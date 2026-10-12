-- Uses one existing execution item; every change and history entry rolls back.
begin;
do $$
declare item_id uuid; parent_id uuid; history_count bigint;
begin
  select oi.id,oi.order_id into strict item_id,parent_id from public.order_items oi
    join public.orders o on o.id=oi.order_id
    where oi.for_execution and oi.item_status::text <> 'cancelled' and oi.issue_kind is null
      and o.status::text not in ('draft','quote','cancelled')
    order by oi.id limit 1;
  select count(*) into history_count from public.order_status_history where order_id=parent_id;
  update public.order_items set item_status='done' where id=item_id;
  update public.orders set status='completed' where id=parent_id;
  update public.order_items set issue_kind='wrong_dimensions',issue_note='בדיקה זמנית — מידות לא תואמות' where id=item_id;
  if (select status::text from public.orders where id=parent_id) <> 'in_execution' then
    raise exception 'Late issue did not reopen completed order';
  end if;
  begin
    update public.orders set status='completed' where id=parent_id;
    raise exception 'Expected open issue completion rejection' using errcode='P0002';
  exception when raise_exception then null;
  end;
  update public.order_items set item_status='ready' where id=item_id;
  begin
    update public.order_items set item_status='done' where id=item_id;
    raise exception 'Expected item completion rejection' using errcode='P0002';
  exception when raise_exception then null;
  end;
  update public.order_items set issue_kind=null,issue_note='בדיקה זמנית — המידות תוקנו' where id=item_id;
  update public.order_items set item_status='done' where id=item_id;
  update public.orders set status='completed' where id=parent_id;
  if (select count(*) from public.order_status_history where order_id=parent_id) < history_count + 3 then
    raise exception 'Missing issue audit history';
  end if;
end $$;
rollback;
select 'Item issues: reopening, order/item completion guards, resolution and audit passed; all writes rolled back' as result;
