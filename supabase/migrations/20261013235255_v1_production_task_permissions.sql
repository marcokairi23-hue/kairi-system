-- Local proposal only. Apply to an isolated database before release.
begin;

create schema if not exists production_private;
revoke all on schema production_private from public;
grant usage on schema production_private to authenticated;

alter table public.order_items
  add column production_version integer not null default 0,
  add column production_changed_by uuid references public.profiles(id),
  add column production_changed_at timestamptz;

-- Durable append-only audit; worker columns preserve legacy metadata only.
-- Manual worker assignment is disabled. Existing history is
-- also populated for the order screen, but this journal cannot be edited by users.
create table public.production_item_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  order_item_id uuid not null references public.order_items(id),
  changed_by uuid not null references public.profiles(id),
  changed_at timestamptz not null default clock_timestamp(),
  from_status text not null,
  to_status text not null,
  from_worker uuid references public.profiles(id),
  to_worker uuid references public.profiles(id),
  from_execution boolean not null,
  to_execution boolean not null,
  version integer not null,
  unique(order_item_id, version)
);
alter table public.production_item_events enable row level security;
revoke all on public.production_item_events from public, anon, authenticated;
grant select on public.production_item_events to authenticated;
create policy production_events_read on public.production_item_events
  for select to authenticated using (exists (
    select 1 from public.orders o where o.id = order_id
  ));
create index production_events_order_idx on public.production_item_events(order_id, changed_at);

create function production_private.allowed_transition(i public.order_items, target text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce(exists (
    select 1 from public.profiles p, public.orders o
    where p.id = auth.uid() and p.is_active and p.role::text in ('admin','office','sales')
      and o.id = i.order_id and o.status::text in ('new_execution','in_execution','ready','completed')
      and o.payment_approved is true
      and i.for_execution
      and target = case i.item_status::text
        when 'new' then 'preparation' when 'preparation' then 'ready' when 'ready' then 'done' end
      and (target <> 'done' or i.issue_kind is null)
      and (p.role::text = 'admin'
        or (i.family::text = 'shading' and target = 'ready')
        or (i.family::text in ('curtain','shading') and p.role::text = 'office'))
      -- User confirmed cutter's existing role is OFFICE; no new user role.
  ), false);
$$;

create function production_private.guard_item() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare actor public.profiles; parent public.orders; production_change boolean;
begin
  -- BEFORE INSERT runs before the new item exists. Lock the parent first, also
  -- for backend inserts, so an approval/status UPDATE either sees this item or
  -- commits before the item notification reads the parent's current state.
  if tg_op = 'INSERT' then
    select * into parent from public.orders where id = new.order_id for update;
  end if;
  -- Backend integrations with no end-user identity keep their existing path.
  if auth.uid() is null then
    if current_user in ('anon','authenticated') then raise exception 'Authentication required' using errcode='42501'; end if;
    return new;
  end if;
  select * into actor from public.profiles where id = auth.uid();
  if tg_op = 'INSERT' then
    if new.assigned_worker is not null then
      raise exception 'Manual worker assignment disabled' using errcode='42501';
    end if;
    if new.item_status::text <> 'new' or new.production_version <> 0
      or new.production_changed_by is not null or new.production_changed_at is not null then
      raise exception 'Production items must start at new' using errcode='42501';
    end if;
    return new;
  end if;

  if new is not distinct from old then return old; end if;
  -- A direct UPDATE already owns the item row before this trigger. Never wait
  -- for a parent held by an RPC waiting on that row: reject the direct request
  -- with 55P03, rolling it back. RPC owns its parents, so NOWAIT succeeds there.
  select * into parent from public.orders where id = old.order_id for update nowait;
  if parent.status::text in ('new_execution','in_execution','ready','completed')
    and (new.order_id is distinct from old.order_id or new.family is distinct from old.family) then
    raise exception 'Cannot reroute an active production item' using errcode='42501';
  end if;
  production_change := new.item_status is distinct from old.item_status
    or new.assigned_worker is distinct from old.assigned_worker
    or new.for_execution is distinct from old.for_execution;
  if production_change then
    if actor.id is null or not actor.is_active or actor.role::text not in ('admin','office','sales') or parent.id is null then
      raise exception 'Production action forbidden' using errcode='42501';
    end if;
    if new.order_id is distinct from old.order_id or new.family is distinct from old.family then
      raise exception 'Cannot change order or route with production action' using errcode='42501';
    end if;
    if new.item_status is distinct from old.item_status and not production_private.allowed_transition(old, new.item_status::text) then
      raise exception 'Task permission or transition rejected' using errcode='42501';
    end if;
    if new.assigned_worker is distinct from old.assigned_worker then
      raise exception 'Manual worker assignment disabled' using errcode='42501';
    end if;
    if new.for_execution is distinct from old.for_execution and parent.status::text in ('new_execution','in_execution','ready','completed')
      and actor.role::text not in ('admin','office') then
      raise exception 'Execution scope forbidden' using errcode='42501';
    end if;
    new.production_changed_by := auth.uid();
    new.production_changed_at := clock_timestamp();
  else
    new.production_changed_by := old.production_changed_by;
    new.production_changed_at := old.production_changed_at;
  end if;
  -- Every edit invalidates old snapshots, including issues, family and dimensions.
  new.production_version := old.production_version + 1;
  return new;
end $$;
create trigger production_guard_v1 before insert or update on public.order_items
  for each row execute function production_private.guard_item();

-- Narrow definer use: the caller cannot write/erase the audit journal. This
-- function is private, not executable by API roles, and only runs as a trigger.
create function production_private.log_item() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and (new.item_status is distinct from old.item_status
    or new.assigned_worker is distinct from old.assigned_worker
    or new.for_execution is distinct from old.for_execution) then
    if new.production_changed_by is distinct from auth.uid() then
      raise exception 'Missing production actor' using errcode='42501';
    end if;
    insert into public.production_item_events(order_id,order_item_id,changed_by,changed_at,
      from_status,to_status,from_worker,to_worker,from_execution,to_execution,version)
    values(new.order_id,new.id,auth.uid(),new.production_changed_at,old.item_status::text,new.item_status::text,
      old.assigned_worker,new.assigned_worker,old.for_execution,new.for_execution,new.production_version);
    insert into public.order_status_history(order_id,order_item_id,from_status,to_status,changed_by,changed_at,note)
    values(new.order_id,new.id,old.item_status::text,new.item_status::text,auth.uid(),new.production_changed_at,
      'פעולת ייצור; לביצוע: '||old.for_execution::text||' → '||new.for_execution::text);
  end if;
  return new;
end $$;
create trigger production_log_v1 after update on public.order_items
  for each row execute function production_private.log_item();

create function public.production_mutate_v1(p_items jsonb, p_action text, p_next text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare requested record; item public.order_items; parent public.orders; actor public.profiles;
  affected integer := 0; target_order uuid; derived text; paid numeric;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or not actor.is_active or actor.role::text not in ('admin','office','sales') then
    raise exception 'Production action forbidden' using errcode='42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Expected item array'; end if;
  if jsonb_array_length(p_items) not between 1 and 200 then raise exception 'Choose 1 to 200 items'; end if;
  if p_action is distinct from 'advance' then raise exception 'Only status advancement is supported' using errcode='42501'; end if;
  if (select count(distinct x.id) from jsonb_to_recordset(p_items) x(id uuid, version integer)) <> jsonb_array_length(p_items) then
    raise exception 'Duplicate or missing item';
  end if;
  -- RLS is deliberately retained. A guessed id cannot expose or mutate an order.
  perform 1 from public.orders o where o.id in (
    select oi.order_id from public.order_items oi
    join jsonb_to_recordset(p_items) x(id uuid, version integer) on x.id = oi.id
  ) order by o.id for update;
  for requested in select * from jsonb_to_recordset(p_items) x(id uuid, version integer) order by id loop
    select * into item from public.order_items where id = requested.id for update;
    if not found then raise exception 'Item unavailable' using errcode='42501'; end if;
    if requested.version is null or item.production_version <> requested.version then
      raise exception 'Item changed; refresh selection' using errcode='40001';
    end if;
    select * into parent from public.orders where id = item.order_id;
    if parent.id is null or parent.status::text not in ('new_execution','in_execution','ready','completed')
      or not item.for_execution or item.item_status::text not in ('new','preparation','ready')
      or (item.item_status::text = 'ready' and item.issue_kind is not null) then
      raise exception 'Item is not actionable' using errcode='42501';
    end if;
    if not production_private.allowed_transition(item, p_next) then
      raise exception 'Task permission or transition rejected' using errcode='42501';
    end if;
    update public.order_items set item_status = p_next::public.item_status where id = item.id;
    affected := affected + 1;
  end loop;
  -- Derive order state in the same transaction. Existing iCredit proposal
  -- behavior is preserved: receipts still require explicit employee acceptance.
  for target_order in select distinct oi.order_id from public.order_items oi
    join jsonb_to_recordset(p_items) x(id uuid, version integer) on x.id = oi.id order by oi.order_id loop
    select * into parent from public.orders where id = target_order;
    if exists(select 1 from public.payments where order_id = target_order and provider = 'icredit') then continue; end if;
    select coalesce(sum(amount),0) into paid from public.payments where order_id = target_order;
    select case
      when count(*) = 0 then 'quote'
      when parent.payment_approved is distinct from true then 'waiting_payment'
      when bool_or(issue_kind is not null) then 'in_execution'
      when bool_and(item_status::text = 'new') then 'new_execution'
      when bool_and(item_status::text = 'ready') then 'ready'
      when bool_and(item_status::text = 'done') and parent.final_total = paid then 'completed'
      else 'in_execution' end into derived
    from public.order_items where order_id = target_order and for_execution and item_status::text <> 'cancelled';
    if parent.status::text <> derived then
      update public.orders set status = derived::public.order_status where id = target_order;
      insert into public.order_status_history(order_id,from_status,to_status,changed_by,note)
      values(target_order,parent.status::text,derived,auth.uid(),'חישוב סטטוס לאחר פעולת ייצור');
    end if;
  end loop;
  return affected;
end $$;

revoke all on function production_private.allowed_transition(public.order_items,text) from public, anon;
grant execute on function production_private.allowed_transition(public.order_items,text) to authenticated;
revoke all on function production_private.guard_item() from public, anon, authenticated;
revoke all on function production_private.log_item() from public, anon, authenticated;
revoke all on function public.production_mutate_v1(jsonb,text,text) from public, anon;
grant execute on function public.production_mutate_v1(jsonb,text,text) to authenticated;

commit;
