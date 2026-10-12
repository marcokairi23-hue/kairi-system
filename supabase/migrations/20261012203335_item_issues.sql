begin;
alter table public.order_items
  add column issue_kind text,
  add column issue_note text,
  add column issue_updated_by uuid references public.profiles(id),
  add column issue_updated_at timestamptz;
alter table public.order_items add constraint order_item_issue_kind_check
  check (issue_kind is null or issue_kind in ('defect','wrong_dimensions','missing_delivery'));
alter table public.order_items add constraint order_item_issue_note_check
  check (issue_kind is null or length(trim(coalesce(issue_note,''))) > 0);

create function public.stamp_order_item_issue() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.item_status::text = 'done' and old.item_status::text <> 'done' and new.issue_kind is not null then
    raise exception 'יש לסגור את הטיפול בפריט לפני סימון כהושלם';
  end if;
  if new.issue_kind is distinct from old.issue_kind or new.issue_note is distinct from old.issue_note then
    -- Same parent lock used by order completion; opening a late issue reopens the order.
    perform 1 from public.orders where id=new.order_id for update;
    new.issue_updated_by := auth.uid();
    new.issue_updated_at := now();
  end if;
  return new;
end $$;
create trigger stamp_order_item_issue before update of issue_kind,issue_note,item_status on public.order_items
  for each row execute function public.stamp_order_item_issue();

create function public.log_order_item_issue() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare prior_status text;
begin
  if new.issue_kind is distinct from old.issue_kind or new.issue_note is distinct from old.issue_note then
    insert into public.order_status_history(order_id,order_item_id,from_status,to_status,changed_by,note)
      values(new.order_id,new.id,old.item_status::text,new.item_status::text,new.issue_updated_by,
        case when new.issue_kind is null then 'טיפול בפריט נסגר: ' else 'נפתח/עודכן טיפול בפריט ('||new.issue_kind||'): ' end
        ||coalesce(new.issue_note,'')||' | דיווח קודם: '||coalesce(old.issue_note,''));
    if new.issue_kind is not null then
      select status::text into prior_status from public.orders where id=new.order_id;
      if prior_status = 'completed' then
        update public.orders set status='in_execution' where id=new.order_id;
        insert into public.order_status_history(order_id,from_status,to_status,changed_by,note)
          values(new.order_id,'completed','in_execution',new.issue_updated_by,'הזמנה נפתחה מחדש עקב פריט הדורש טיפול');
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger log_order_item_issue after update of issue_kind,issue_note on public.order_items
  for each row execute function public.log_order_item_issue();

create function public.guard_order_open_issues() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.status::text = 'completed' and exists (
    select 1 from public.order_items where order_id=new.id and for_execution
      and item_status::text <> 'cancelled' and issue_kind is not null
  ) then raise exception 'לא ניתן לסגור הזמנה עם פריט הדורש טיפול'; end if;
  return new;
end $$;
create trigger guard_order_open_issues before update of status on public.orders
  for each row execute function public.guard_order_open_issues();
commit;
