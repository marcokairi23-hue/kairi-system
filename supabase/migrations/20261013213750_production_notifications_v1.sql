-- Local V1 task notifications. No outbound messages, publication or live settings.
begin;

create table public.production_tasks (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  order_item_id uuid references public.order_items(id) on delete set null,
  item_key uuid not null,
  instance_no integer not null check (instance_no > 0),
  previous_task_id uuid references public.production_tasks(id),
  family text not null check (family in ('curtain','shading')),
  subtype text,
  item_location text not null,
  from_status text not null check (from_status in ('new','preparation','ready')),
  target_status text not null,
  opened_version integer not null,
  created_at timestamptz not null default clock_timestamp(),
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  closed_at timestamptz,
  closed_by uuid references public.profiles(id),
  closed_by_name text,
  close_reason text,
  unique(item_key,instance_no),
  check (target_status = case from_status when 'new' then 'preparation' when 'preparation' then 'ready' when 'ready' then 'done' end),
  check ((status='active' and closed_at is null and close_reason is null)
    or (status<>'active' and closed_at is not null and close_reason is not null))
);
create unique index production_task_one_active_idx on public.production_tasks(item_key) where status='active';
create index production_tasks_order_idx on public.production_tasks(order_id);
create index production_tasks_active_idx on public.production_tasks(created_at desc,id desc) where status='active';
create index production_tasks_history_idx on public.production_tasks(closed_at desc,id desc) where status<>'active';

create table public.production_task_recipients (
  task_id uuid not null references public.production_tasks(id),
  user_id uuid not null references public.profiles(id),
  available_at timestamptz not null default clock_timestamp(),
  first_read_at timestamptz,
  primary key(task_id,user_id)
);
create index production_recipients_user_idx on public.production_task_recipients(user_id,task_id)
  include (available_at,first_read_at);
alter table public.production_tasks enable row level security;
alter table public.production_task_recipients enable row level security;
revoke all on public.production_tasks,public.production_task_recipients from public,anon,authenticated;
grant select on public.production_tasks,public.production_task_recipients to authenticated;
grant insert(task_id,user_id), update(first_read_at) on public.production_task_recipients to authenticated;

-- Visibility is checked against the real order/item RLS on every read, including
-- history. Role audience alone cannot reveal a guessed order or task id.
create policy production_tasks_read on public.production_tasks for select to authenticated using (
  exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active
    and p.role::text in ('admin','office'))
  and exists(select 1 from public.orders o where o.id=production_tasks.order_id)
  and (order_item_id is null or exists(select 1 from public.order_items i where i.id=production_tasks.order_item_id))
);
create policy production_recipient_read on public.production_task_recipients for select to authenticated using (
  user_id=(select auth.uid()) and exists(select 1 from public.production_tasks t where t.id=task_id)
);
create policy production_recipient_insert on public.production_task_recipients for insert to authenticated with check (
  user_id=(select auth.uid()) and first_read_at is null and exists(select 1 from public.production_tasks t where t.id=task_id)
);
create policy production_recipient_update on public.production_task_recipients for update to authenticated using (
  user_id=(select auth.uid()) and exists(select 1 from public.production_tasks t where t.id=task_id)
) with check (
  user_id=(select auth.uid()) and exists(select 1 from public.production_tasks t where t.id=task_id)
);

create function production_private.stamp_task_read() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' then
    if current_user in ('anon','authenticated') and (auth.uid() is null or new.user_id is distinct from auth.uid()) then
      raise exception 'Own delivery only' using errcode='42501';
    end if;
    if new.first_read_at is not null then raise exception 'New delivery must be unread' using errcode='42501'; end if;
    new.available_at := clock_timestamp();
  else
    if auth.uid() is null or old.user_id is distinct from auth.uid()
      or new.user_id is distinct from old.user_id or new.task_id is distinct from old.task_id
      or new.available_at is distinct from old.available_at then
      raise exception 'Own read state only' using errcode='42501';
    end if;
    new.first_read_at := case when old.first_read_at is not null then old.first_read_at
      when new.first_read_at is not null then clock_timestamp() else null end;
  end if;
  return new;
end $$;
create trigger production_recipient_stamp before insert or update on public.production_task_recipients
  for each row execute function production_private.stamp_task_read();

-- Internal fan-out uses the repository's verified baseline access map:
-- admin/office all orders, matching the OFFICE task assignment. The internal
-- shading-ready exception grants a business action, not a different audience.
-- Actual SELECT/UPDATE still uses order/item RLS above. No API can invoke this
-- privileged helper or change task lifecycle rows.
create function production_private.deliver_task(t public.production_tasks) returns void
language plpgsql security definer set search_path='' as $$
begin
  insert into public.production_task_recipients(task_id,user_id)
    select t.id,p.id from public.profiles p join public.orders o on o.id=t.order_id
    where p.is_active and p.role::text in ('admin','office')
    on conflict(task_id,user_id) do nothing;
end $$;

create function production_private.sync_item_task(i public.order_items, deleted boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare parent public.orders; prior public.production_tasks; opened public.production_tasks;
  desired text; reason text; actor_name text;
begin
  select * into parent from public.orders where id=i.order_id;
  select * into prior from public.production_tasks where item_key=i.id and status='active';
  desired := case i.item_status::text when 'new' then 'preparation' when 'preparation' then 'ready' when 'ready' then 'done' end;
  reason := case
    when deleted then 'item_deleted'
    when parent.id is null then 'order_deleted'
    when parent.status::text='cancelled' then 'order_cancelled'
    when i.item_status::text='cancelled' then 'item_cancelled'
    when not i.for_execution then 'removed_from_execution'
    when parent.payment_approved is distinct from true then 'payment_not_approved'
    when parent.status::text not in ('new_execution','in_execution','ready','completed') then 'order_inactive'
    when i.item_status::text='ready' and i.issue_kind is not null then 'issue_open'
    when desired is null then 'no_next_transition'
    else null end;
  select full_name into actor_name from public.profiles where id=auth.uid();
  if prior.id is not null then
    if not deleted and prior.target_status=i.item_status::text then
      update public.production_tasks set status='completed',closed_at=clock_timestamp(),closed_by=auth.uid(),
        closed_by_name=actor_name,close_reason='status_advanced' where id=prior.id;
    elsif reason is not null or prior.from_status<>i.item_status::text or prior.family<>i.family::text
      or prior.order_id is distinct from i.order_id then
      update public.production_tasks set status='cancelled',closed_at=clock_timestamp(),closed_by=auth.uid(),
        closed_by_name=actor_name,close_reason=coalesce(reason,'state_changed') where id=prior.id;
    else
      -- Dimension/note edits and receipt retries do not create another instance.
      update public.production_tasks set item_location=i.location,subtype=i.subtype::text where id=prior.id;
      perform production_private.deliver_task(prior);
      return;
    end if;
  end if;
  if reason is not null then return; end if;
  select * into prior from public.production_tasks where item_key=i.id order by instance_no desc limit 1;
  insert into public.production_tasks(order_id,order_item_id,item_key,instance_no,previous_task_id,
    family,subtype,item_location,from_status,target_status,opened_version)
  values(i.order_id,i.id,i.id,coalesce(prior.instance_no,0)+1,prior.id,
    i.family::text,i.subtype::text,i.location,i.item_status::text,desired,i.production_version) returning * into opened;
  perform production_private.deliver_task(opened);
end $$;

create function production_private.task_item_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then perform production_private.sync_item_task(old,true); return old; end if;
  perform production_private.sync_item_task(new);
  return new;
end $$;
create trigger production_notification_item_v1 after insert or update on public.order_items
  for each row execute function production_private.task_item_trigger();
create trigger production_notification_item_delete_v1 before delete on public.order_items
  for each row execute function production_private.task_item_trigger();

create function production_private.task_order_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
declare item public.order_items;
begin
  if tg_op='DELETE' then
    update public.production_tasks set status='cancelled',closed_at=clock_timestamp(),closed_by=auth.uid(),
      closed_by_name=(select full_name from public.profiles where id=auth.uid()),close_reason='order_deleted'
      where order_id=old.id and status='active';
    return old;
  end if;
  if new.status is not distinct from old.status and new.payment_approved is not distinct from old.payment_approved
    and new.agent_id is not distinct from old.agent_id then return new; end if;
  -- Parent already locked by its UPDATE. Do not take item locks in this trigger;
  -- the item guard rejects the competing item->parent path with NOWAIT.
  for item in select * from public.order_items where order_id=new.id order by id loop
    perform production_private.sync_item_task(item);
  end loop;
  return new;
end $$;
create trigger production_notification_order_v1 after update of status,payment_approved,agent_id on public.orders
  for each row execute function production_private.task_order_trigger();
create trigger production_notification_order_delete_v1 before delete on public.orders
  for each row execute function production_private.task_order_trigger();

create function production_private.task_profile_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
declare task public.production_tasks;
begin
  if new.is_active and new.role::text in ('admin','office') then
    for task in select * from public.production_tasks where status='active' order by id loop
      perform production_private.deliver_task(task);
    end loop;
  end if;
  return new;
end $$;
create trigger production_notification_profile_v1 after insert or update of role,is_active on public.profiles
  for each row execute function production_private.task_profile_trigger();

create function public.production_notifications_v1(p_state text default 'active',p_before timestamptz default null,
  p_before_id uuid default null,p_limit integer default 50) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor public.profiles; active_count integer; unread_count integer; entries jsonb; more boolean;
begin
  select * into actor from public.profiles where id=auth.uid();
  if actor.id is null or not actor.is_active or actor.role::text not in ('admin','office') then
    raise exception 'Notifications unavailable' using errcode='42501';
  end if;
  if p_state is null or p_state not in ('active','history') or p_limit is null or p_limit not between 1 and 100
    or (p_before is null)<>(p_before_id is null) then raise exception 'Invalid notification page' using errcode='22023'; end if;
  -- Repair a missing own delivery under current RLS, e.g. a newly granted access
  -- path. Server-trigger fan-out records normal availability before any fetch.
  insert into public.production_task_recipients(task_id,user_id)
    select id,auth.uid() from public.production_tasks where status='active'
    on conflict(task_id,user_id) do nothing;
  select count(*),count(*) filter(where r.first_read_at is null) into active_count,unread_count
    from public.production_tasks t join public.production_task_recipients r on r.task_id=t.id
    where r.user_id=auth.uid() and t.status='active';
  with candidates as (
    select t.*,r.available_at,r.first_read_at,o.order_number,o.customer_name_snapshot,
      case when p_state='active' then t.created_at else t.closed_at end as cursor_at
    from public.production_tasks t join public.production_task_recipients r on r.task_id=t.id
      join public.orders o on o.id=t.order_id
    where r.user_id=auth.uid() and ((p_state='active' and t.status='active') or (p_state='history' and t.status<>'active'))
      and (p_before is null or (case when p_state='active' then t.created_at else t.closed_at end,t.id)<(p_before,p_before_id))
    order by cursor_at desc,t.id desc limit p_limit+1
  ), numbered as (select candidates.*,row_number() over(order by cursor_at desc,id desc) as row_no from candidates)
  select coalesce(jsonb_agg(to_jsonb(numbered)-'row_no' order by cursor_at desc,id desc) filter(where row_no<=p_limit),'[]'::jsonb),
    count(*)>p_limit into entries,more from numbered;
  return jsonb_build_object('tasks',entries,'active_total',active_count,'unread_active',unread_count,'has_more',more);
end $$;

create function public.production_notification_read_v1(p_task uuid) returns timestamptz
language plpgsql security invoker set search_path='' as $$
declare first_read timestamptz;
begin
  update public.production_task_recipients set first_read_at=clock_timestamp()
    where task_id=p_task and user_id=auth.uid() returning first_read_at into first_read;
  if not found then raise exception 'Notification unavailable' using errcode='42501'; end if;
  return first_read;
end $$;

revoke all on function production_private.stamp_task_read() from public,anon,authenticated;
revoke all on function production_private.deliver_task(public.production_tasks) from public,anon,authenticated;
revoke all on function production_private.sync_item_task(public.order_items,boolean) from public,anon,authenticated;
revoke all on function production_private.task_item_trigger() from public,anon,authenticated;
revoke all on function production_private.task_order_trigger() from public,anon,authenticated;
revoke all on function production_private.task_profile_trigger() from public,anon,authenticated;
revoke all on function public.production_notifications_v1(text,timestamptz,uuid,integer) from public,anon;
revoke all on function public.production_notification_read_v1(uuid) from public,anon;
grant execute on function public.production_notifications_v1(text,timestamptz,uuid,integer) to authenticated;
grant execute on function public.production_notification_read_v1(uuid) to authenticated;

-- Initialize only NEW notification metadata for current tasks. Existing order,
-- item, payment and history rows are not edited. No historic creation times are
-- invented: these initial instances become available at installation time.
do $$
declare item public.order_items;
begin
  for item in select * from public.order_items order by order_id,id loop
    perform production_private.sync_item_task(item);
  end loop;
end $$;
commit;
