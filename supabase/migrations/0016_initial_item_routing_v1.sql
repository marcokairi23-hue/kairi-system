-- KAIRI SYSTEM Sprint 2: authoritative initial item routing after payment approval.
-- SAFETY GATE: this migration must not be applied without explicit human approval.

-- The production schema already has production_route ('internal'/'external') and
-- the legacy operational item_status. Keep both backward-compatible and persist
-- the V1 initial routing decision separately until later workflow Sprints replace
-- the legacy execution track.
create type public.item_routing_state_v1 as enum (
  'outside_execution',
  'awaiting_cut',
  'awaiting_supplier_order',
  'legacy_routed',
  'legacy_unverified'
);

create type public.item_routing_owner_v1 as enum (
  'CUTTER',
  'OFFICE_SUPPLIER'
);

alter table public.order_items
  alter column production_route drop default,
  alter column production_route drop not null,
  add column roman_internal_fabric_cut boolean not null default false,
  add column routing_state public.item_routing_state_v1,
  add column routing_owner public.item_routing_owner_v1;

comment on column public.order_items.roman_internal_fabric_cut is
  'Explicit Roman exception: KAIRI-owned fabric requires internal cutting.';
comment on column public.order_items.routing_state is
  'Authoritative initial V1 routing state assigned only after the payment gate passes.';
comment on column public.order_items.routing_owner is
  'Authoritative initial V1 owner assigned with routing_state.';

-- Preserve historical work without calling a cut, sewing, or ready item newly
-- awaiting its first action. Rows with no received payment are never assigned
-- a new routing owner. Legacy routes remain visible for reconciliation.
update public.order_items oi
set production_route = null,
    routing_state = 'outside_execution',
    routing_owner = null
from public.orders o
where o.id = oi.order_id
  and (
    not oi.for_execution
    or o.status in ('draft', 'quote', 'pending_payment', 'cancelled')
    or (
      oi.item_status = 'new'
      and not exists (
        select 1 from public.payments p
        where p.order_id = o.id and p.payment_status = 'received'
      )
    )
  );

update public.order_items oi
set routing_state = case oi.production_route
      when 'internal' then 'awaiting_cut'::public.item_routing_state_v1
      when 'external' then 'awaiting_supplier_order'::public.item_routing_state_v1
    end,
    routing_owner = case oi.production_route
      when 'internal' then 'CUTTER'::public.item_routing_owner_v1
      when 'external' then 'OFFICE_SUPPLIER'::public.item_routing_owner_v1
    end
from public.orders o
where o.id = oi.order_id
  and oi.for_execution
  and oi.item_status = 'new'
  and o.status not in ('draft', 'quote', 'pending_payment', 'cancelled')
  and exists (
    select 1 from public.payments p
    where p.order_id = o.id and p.payment_status = 'received'
  )
  and (
    (oi.family = 'curtain' and oi.production_route = 'internal')
    or (oi.family = 'shading' and oi.production_route = 'external')
  );

-- A paid, still-new historical item whose old route contradicts the current
-- explicit policy is retained as legacy, not presented as a fresh approval.
update public.order_items oi
set routing_state = 'legacy_routed',
    routing_owner = null
from public.orders o
where o.id = oi.order_id
  and oi.for_execution
  and oi.item_status = 'new'
  and oi.routing_state is null
  and o.status not in ('draft', 'quote', 'pending_payment', 'cancelled')
  and exists (
    select 1 from public.payments p
    where p.order_id = o.id and p.payment_status = 'received'
  )
  and oi.production_route is not null;

update public.order_items oi
set routing_state = case when exists (
      select 1 from public.payments p
      where p.order_id = o.id and p.payment_status = 'received'
    ) then 'legacy_routed'::public.item_routing_state_v1
      else 'legacy_unverified'::public.item_routing_state_v1 end,
    routing_owner = null
from public.orders o
where o.id = oi.order_id
  and oi.for_execution
  and oi.item_status <> 'new'
  and o.status not in ('draft', 'quote', 'pending_payment', 'cancelled');

-- An operational, paid, new item with no historical route needs review rather
-- than a guessed backfill. Current production schema declares route NOT NULL.
do $$
begin
  if exists (
    select 1 from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.routing_state is null
  ) then
    raise exception '0016 backfill found order items without a safe routing classification';
  end if;
end;
$$;

alter table public.order_items
  alter column routing_state set default 'outside_execution',
  alter column routing_state set not null,
  add constraint order_items_roman_internal_fabric_v1_check check (
    not roman_internal_fabric_cut
    or coalesce(family = 'shading' and subtype in ('רומי', 'roman'), false)
  ),
  add constraint order_items_initial_routing_v1_check check (
    (
      routing_state = 'outside_execution'
      and production_route is null
      and routing_owner is null
    )
    or
    (
      routing_state = 'awaiting_cut'
      and production_route is not distinct from 'internal'::public.production_route
      and routing_owner is not distinct from 'CUTTER'::public.item_routing_owner_v1
    )
    or
    (
      routing_state = 'awaiting_supplier_order'
      and production_route is not distinct from 'external'::public.production_route
      and routing_owner is not distinct from 'OFFICE_SUPPLIER'::public.item_routing_owner_v1
    )
    or
    (
      routing_state in ('legacy_routed', 'legacy_unverified')
      and production_route is not null
      and routing_owner is null
    )
  );

create index order_items_routing_queue_v1_idx
  on public.order_items (routing_owner, routing_state)
  where for_execution;

-- Keep initial routing under the server-side route function. A direct item
-- write cannot supply its own routing transition or advance an unrouted item.
create or replace function public.normalize_initial_item_routing_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_status public.order_status;
  v_has_received_payment boolean;
  v_routing_order_id text := coalesce(
    current_setting('kairi.routing_order_id', true), ''
  );
begin
  select o.status into v_order_status
  from public.orders o
  where o.id = new.order_id;

  if not found then
    raise exception 'order not found for item routing' using errcode = 'P0002';
  end if;

  select exists (
    select 1
    from public.payments p
    where p.order_id = new.order_id
      and p.payment_status = 'received'
  ) into v_has_received_payment;

  if new.roman_internal_fabric_cut
     and not coalesce(
       new.family = 'shading' and new.subtype in ('רומי', 'roman'), false
     ) then
    raise exception 'internal fabric cutting requires a Roman shading item'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if new.item_status <> 'new' or new.assigned_worker is not null then
      raise exception 'new items must begin unassigned at item_status new'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.routing_state <> 'outside_execution'
       and (
         new.order_id is distinct from old.order_id
         or new.family is distinct from old.family
         or new.subtype is distinct from old.subtype
         or new.roman_internal_fabric_cut is distinct from old.roman_internal_fabric_cut
         or new.for_execution is distinct from old.for_execution
       ) then
      raise exception 'released item routing cannot be changed by an item edit'
        using errcode = '42501';
    end if;

    if (new.item_status is distinct from old.item_status
        or new.assigned_worker is distinct from old.assigned_worker)
       and not (
         new.item_status = 'cancelled'
         and new.assigned_worker is not distinct from old.assigned_worker
       )
       and (
         old.routing_state in ('outside_execution', 'legacy_unverified')
         or not new.for_execution
         or v_order_status in ('draft', 'quote', 'pending_payment', 'cancelled')
         or not v_has_received_payment
       ) then
      raise exception 'unrouted or unpaid item cannot advance in execution'
        using errcode = '42501';
    end if;

    if old.routing_state in ('legacy_routed', 'legacy_unverified') then
      new.production_route := old.production_route;
      new.routing_state := old.routing_state;
      new.routing_owner := null;
      return new;
    end if;

    if old.routing_state in ('awaiting_cut', 'awaiting_supplier_order')
       and new.routing_state is distinct from old.routing_state then
      raise exception 'initial routing state is immutable after release'
        using errcode = '42501';
    end if;
  end if;

  if not new.for_execution
     or v_order_status in ('draft', 'quote', 'pending_payment', 'cancelled')
     or not v_has_received_payment then
    new.production_route := null;
    new.routing_state := 'outside_execution';
    new.routing_owner := null;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.production_route := null;
    new.routing_state := 'outside_execution';
    new.routing_owner := null;
    return new;
  end if;

  if old.routing_state = 'outside_execution'
     and v_routing_order_id <> new.order_id::text then
    new.production_route := null;
    new.routing_state := 'outside_execution';
    new.routing_owner := null;
    return new;
  end if;

  if new.family = 'curtain'
     or (
       new.family = 'shading'
       and new.subtype in ('רומי', 'roman')
       and new.roman_internal_fabric_cut
     ) then
    new.production_route := 'internal';
    new.routing_state := 'awaiting_cut';
    new.routing_owner := 'CUTTER';
  else
    new.production_route := 'external';
    new.routing_state := 'awaiting_supplier_order';
    new.routing_owner := 'OFFICE_SUPPLIER';
  end if;

  return new;
end;
$$;

create trigger order_items_normalize_initial_routing_v1
  before insert or update of
    order_id,
    family,
    subtype,
    for_execution,
    production_route,
    roman_internal_fabric_cut,
    routing_state,
    routing_owner,
    item_status,
    assigned_worker
  on public.order_items
  for each row execute function public.normalize_initial_item_routing_v1();

-- Route all still-unrouted executable items in one transaction and append one
-- existing-history row per item with actor, timestamp, state, and route decision.
create or replace function public.route_order_items_after_payment_v1(
  p_order_id uuid,
  p_actor uuid,
  p_source text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_status public.order_status;
  v_item record;
  v_route public.production_route;
  v_state public.item_routing_state_v1;
  v_owner public.item_routing_owner_v1;
  v_now timestamptz := clock_timestamp();
  v_count integer := 0;
  v_previous_marker text := coalesce(
    current_setting('kairi.routing_order_id', true), ''
  );
begin
  select o.status into v_order_status
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'order not found for item routing' using errcode = 'P0002';
  end if;

  if v_order_status in ('draft', 'quote', 'pending_payment', 'cancelled') then
    return 0;
  end if;

  if not exists (
    select 1
    from public.payments p
    where p.order_id = p_order_id
      and p.payment_status = 'received'
  ) then
    return 0;
  end if;

  perform set_config('kairi.routing_order_id', p_order_id::text, true);

  for v_item in
    select oi.id,
           oi.family,
           oi.subtype,
           oi.roman_internal_fabric_cut,
           oi.routing_state
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.for_execution
      and oi.item_status = 'new'
      and oi.routing_state = 'outside_execution'
    order by oi.sort_order, oi.id
    for update
  loop
    if v_item.family = 'curtain'
       or (
         v_item.family = 'shading'
         and v_item.subtype in ('רומי', 'roman')
         and v_item.roman_internal_fabric_cut
       ) then
      v_route := 'internal';
      v_state := 'awaiting_cut';
      v_owner := 'CUTTER';
    else
      v_route := 'external';
      v_state := 'awaiting_supplier_order';
      v_owner := 'OFFICE_SUPPLIER';
    end if;

    update public.order_items
    set production_route = v_route,
        routing_state = v_state,
        routing_owner = v_owner
    where id = v_item.id;

    insert into public.order_status_history (
      order_id,
      order_item_id,
      from_status,
      to_status,
      changed_by,
      changed_at,
      note
    ) values (
      p_order_id,
      v_item.id,
      v_item.routing_state::text,
      v_state::text,
      p_actor,
      v_now,
      'Initial item routing; source=' || coalesce(p_source, 'unknown')
        || '; route=' || v_route::text
        || '; owner=' || v_owner::text
        || '; roman_internal_fabric_cut=' || v_item.roman_internal_fabric_cut::text
    );

    v_count := v_count + 1;
  end loop;

  perform set_config('kairi.routing_order_id', v_previous_marker, true);
  return v_count;
end;
$$;

revoke all on function public.route_order_items_after_payment_v1(uuid, uuid, text)
  from public, anon, authenticated;

-- An item added to an already-paid active order, or selected for execution
-- later, uses the same authoritative routing/history boundary as order release.
create or replace function public.route_order_items_on_item_write_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.route_order_items_after_payment_v1(
    new.order_id,
    auth.uid(),
    'item_write'
  );
  return new;
end;
$$;

create trigger order_items_route_after_write_v1
  after insert or update of order_id, for_execution, family, subtype, roman_internal_fabric_cut
  on public.order_items
  for each row
  when (new.for_execution and new.routing_state = 'outside_execution')
  execute function public.route_order_items_on_item_write_v1();

-- Cash/Check route on the guarded draft -> ready transition. Card/Transfer route
-- in the same confirmation transaction when its order becomes ready.
create or replace function public.route_order_items_on_order_release_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and new.status not in ('draft', 'quote', 'pending_payment', 'cancelled') then
    perform public.route_order_items_after_payment_v1(
      new.id,
      coalesce(auth.uid(), new.agent_id),
      'order_status_release'
    );
  end if;
  return new;
end;
$$;

create trigger orders_route_items_after_payment_v1
  after update of status on public.orders
  for each row execute function public.route_order_items_on_order_release_v1();

-- Compatibility for already-paid operational imports (for example the existing
-- WooCommerce RPC, which inserts its received payment after inserting items).
create or replace function public.route_order_items_on_received_payment_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_status = 'received' then
    perform public.route_order_items_after_payment_v1(
      new.order_id,
      coalesce(new.received_by, auth.uid(), new.recorded_by),
      'received_payment'
    );
  end if;
  return new;
end;
$$;

create trigger payments_route_items_after_received_v1
  after insert or update of payment_status on public.payments
  for each row execute function public.route_order_items_on_received_payment_v1();

-- Migration 0015 guards entry from draft/pending_payment. Historical active
-- orders can lack a received payment; do not let those advance operationally.
-- Quote/cancellation remain non-operational, and pending_payment still needs
-- the Office/Admin confirmation marker from the existing RPC.
create or replace function public.enforce_order_payment_gate_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_confirmed_order_id text;
begin
  if new.status is not distinct from old.status
     or new.status in ('draft', 'quote', 'pending_payment', 'cancelled') then
    return new;
  end if;

  if not exists (
    select 1 from public.payments p
    where p.order_id = old.id and p.payment_status = 'received'
  ) then
    raise exception 'order may not advance operationally without a received payment'
      using errcode = '42501';
  end if;

  if old.status = 'pending_payment' then
    v_confirmed_order_id := coalesce(
      current_setting('kairi.confirmed_payment_order_id', true), ''
    );
    if v_confirmed_order_id <> old.id::text then
      raise exception 'pending_payment orders may advance only through confirm_pending_payment_v1'
        using errcode = '42501';
    end if;
  end if;

  if old.status not in ('draft', 'quote', 'pending_payment')
     and exists (
       select 1 from public.order_items oi
       where oi.order_id = old.id
         and oi.for_execution
         and oi.item_status <> 'cancelled'
         and oi.routing_state in ('outside_execution', 'legacy_unverified')
     ) then
    raise exception 'order has unrouted items and cannot advance operationally'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
