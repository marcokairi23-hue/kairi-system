-- KAIRI SYSTEM Sprint 1: New Order + Payment Gate V1
-- This migration is intentionally not applied automatically. Production application requires human approval.

-- ---------- Stable payment lifecycle ----------
create type public.payment_status as enum ('pending', 'received', 'rejected');

alter table public.payments
  add column payment_status public.payment_status not null default 'received',
  add column payment_route text,
  add column recorded_by uuid references public.profiles(id),
  add column requested_at timestamptz,
  add column rejected_by uuid references public.profiles(id),
  add column rejected_at timestamptz,
  add column rejection_reason text,
  add column updated_at timestamptz;

-- Every historical payment was previously represented as received (paid_at was NOT NULL).
-- Preserve that meaning; do not guess that any historical row was pending.
update public.payments
set payment_status = 'received',
    recorded_by = coalesce(recorded_by, received_by),
    requested_at = coalesce(requested_at, paid_at, now()),
    updated_at = coalesce(updated_at, paid_at, now());

alter table public.payments
  alter column requested_at set default now(),
  alter column requested_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null,
  alter column paid_at drop not null,
  alter column paid_at drop default;

alter table public.payments
  add constraint payments_payment_route_v1_check check (
    payment_route is null or payment_route in ('cash', 'check', 'credit_card', 'bank_transfer')
  ),
  add constraint payments_lifecycle_v1_check check (
    (
      payment_status = 'received'
      and paid_at is not null
      and rejected_by is null
      and rejected_at is null
      and rejection_reason is null
    )
    or
    (
      payment_status = 'pending'
      and payment_route in ('credit_card', 'bank_transfer')
      and recorded_by is not null
      and paid_at is null
      and received_by is null
      and rejected_by is null
      and rejected_at is null
      and rejection_reason is null
    )
    or
    (
      payment_status = 'rejected'
      and payment_route in ('credit_card', 'bank_transfer')
      and paid_at is null
      and received_by is null
      and rejected_by is not null
      and rejected_at is not null
      and length(trim(rejection_reason)) > 0
    )
  );

-- Enforce positive amounts for all new/changed rows without risking migration failure
-- if an unknown historical anomaly exists. A later data-quality Sprint may validate it.
alter table public.payments
  add constraint payments_positive_amount_v1_check check (amount > 0) not valid;

create index payments_order_status_v1_idx
  on public.payments (order_id, payment_status);

create or replace function public.apply_payment_v1_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if tg_op = 'INSERT' then
    new.requested_at := coalesce(new.requested_at, v_now);
    new.recorded_by := coalesce(new.recorded_by, new.received_by, auth.uid());
  end if;

  new.updated_at := v_now;

  if new.payment_status = 'received' then
    new.paid_at := coalesce(new.paid_at, v_now);
    new.received_by := coalesce(new.received_by, new.recorded_by, auth.uid());
    new.rejected_by := null;
    new.rejected_at := null;
    new.rejection_reason := null;
  elsif new.payment_status = 'pending' then
    new.paid_at := null;
    new.received_by := null;
    new.rejected_by := null;
    new.rejected_at := null;
    new.rejection_reason := null;
  elsif new.payment_status = 'rejected' then
    new.paid_at := null;
    new.received_by := null;
  end if;

  return new;
end;
$$;

create trigger payments_apply_v1_defaults
  before insert or update on public.payments
  for each row execute function public.apply_payment_v1_defaults();

-- ---------- Payment RLS: ownership-scoped read/insert, no direct status update ----------
drop policy if exists office_payments on public.payments;
drop policy if exists sales_payments on public.payments;
drop policy if exists sales_payments_read on public.payments;

create policy office_payments_read_v1 on public.payments for select
  using (public.current_role() in ('admin', 'office'));

create policy office_payments_insert_v1 on public.payments for insert
  with check (
    public.current_role() in ('admin', 'office')
    and recorded_by = auth.uid()
    and (
      (
        payment_status = 'received'
        and payment_route in ('cash', 'check')
        and received_by = auth.uid()
        and paid_at is not null
      )
      or
      (
        payment_status = 'pending'
        and payment_route in ('credit_card', 'bank_transfer')
        and received_by is null
        and paid_at is null
      )
    )
  );

create policy sales_payments_read_v1 on public.payments for select
  using (
    public.current_role() = 'sales'
    and exists (
      select 1 from public.orders o
      where o.id = order_id and o.agent_id = auth.uid()
    )
  );

create policy sales_payments_insert_v1 on public.payments for insert
  with check (
    public.current_role() = 'sales'
    and recorded_by = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = order_id and o.agent_id = auth.uid()
    )
    and (
      (
        payment_status = 'received'
        and payment_route in ('cash', 'check')
        and received_by = auth.uid()
        and paid_at is not null
      )
      or
      (
        payment_status = 'pending'
        and payment_route in ('credit_card', 'bank_transfer')
        and received_by is null
        and paid_at is null
      )
    )
  );

-- ---------- Guard the payment gate ----------
create or replace function public.enforce_order_payment_gate_v1()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_is_operational_target boolean;
  v_has_received_payment boolean;
  v_confirmed_order_id text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_is_operational_target := new.status::text not in (
    'draft', 'quote', 'pending_payment', 'cancelled'
  );

  -- Quote/cancellation/non-operational changes do not cross the payment gate.
  if old.status::text not in ('draft', 'pending_payment')
     or not v_is_operational_target then
    return new;
  end if;

  select exists (
    select 1
    from public.payments p
    where p.order_id = old.id
      and p.payment_status = 'received'
  ) into v_has_received_payment;

  if not v_has_received_payment then
    raise exception 'order may not enter operational execution without a received payment'
      using errcode = '42501';
  end if;

  if old.status = 'pending_payment' then
    v_confirmed_order_id := coalesce(
      current_setting('kairi.confirmed_payment_order_id', true),
      ''
    );

    if v_confirmed_order_id <> old.id::text then
      raise exception 'pending_payment orders may advance only through confirm_pending_payment_v1'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger orders_enforce_payment_gate_v1
  before update of status on public.orders
  for each row execute function public.enforce_order_payment_gate_v1();

create or replace function public.enforce_item_payment_gate_v1()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_order_status public.order_status;
begin
  if new.item_status is distinct from old.item_status
     or new.assigned_worker is distinct from old.assigned_worker then
    select status into v_order_status
    from public.orders
    where id = new.order_id;

    if v_order_status in ('draft', 'quote', 'pending_payment') then
      raise exception 'order items cannot enter operational execution before payment approval'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger order_items_enforce_payment_gate_v1
  before update of item_status, assigned_worker on public.order_items
  for each row execute function public.enforce_item_payment_gate_v1();

-- ---------- Atomic Office/Admin confirmation ----------
create or replace function public.confirm_pending_payment_v1(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.user_role;
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select role into v_role
  from public.profiles
  where id = v_actor and is_active;

  if v_role is null or v_role not in ('admin', 'office') then
    raise exception 'only office or admin may confirm a pending payment'
      using errcode = '42501';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'payment not found' using errcode = 'P0002';
  end if;

  if v_payment.payment_status <> 'pending'
     or v_payment.payment_route not in ('credit_card', 'bank_transfer') then
    raise exception 'payment is not a pending office payment request'
      using errcode = 'P0001';
  end if;

  select * into v_order
  from public.orders
  where id = v_payment.order_id
  for update;

  if not found or v_order.status <> 'pending_payment' then
    raise exception 'order is not pending payment' using errcode = 'P0001';
  end if;

  update public.payments
  set payment_status = 'received',
      received_by = v_actor,
      paid_at = v_now
  where id = v_payment.id;

  perform set_config('kairi.confirmed_payment_order_id', v_order.id::text, true);

  update public.orders
  set status = 'ready',
      updated_at = v_now
  where id = v_order.id;

  insert into public.order_status_history (
    order_id, from_status, to_status, changed_by, changed_at, note
  ) values (
    v_order.id,
    'pending_payment',
    'ready',
    v_actor,
    v_now,
    'Pending payment confirmed by Office/Admin; payment_id=' || v_payment.id::text
  );

  return jsonb_build_object(
    'payment_id', v_payment.id,
    'order_id', v_order.id,
    'payment_status', 'received',
    'order_status', 'ready',
    'confirmed_by', v_actor,
    'confirmed_at', v_now
  );
end;
$$;

-- ---------- Atomic Office/Admin rejection ----------
create or replace function public.reject_pending_payment_v1(
  p_payment_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.user_role;
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_now timestamptz := clock_timestamp();
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select role into v_role
  from public.profiles
  where id = v_actor and is_active;

  if v_role is null or v_role not in ('admin', 'office') then
    raise exception 'only office or admin may reject a pending payment'
      using errcode = '42501';
  end if;

  if v_reason = '' then
    raise exception 'rejection reason is required' using errcode = '22023';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'payment not found' using errcode = 'P0002';
  end if;

  if v_payment.payment_status <> 'pending'
     or v_payment.payment_route not in ('credit_card', 'bank_transfer') then
    raise exception 'payment is not a pending office payment request'
      using errcode = 'P0001';
  end if;

  select * into v_order
  from public.orders
  where id = v_payment.order_id
  for update;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  update public.payments
  set payment_status = 'rejected',
      rejected_by = v_actor,
      rejected_at = v_now,
      rejection_reason = v_reason
  where id = v_payment.id;

  insert into public.order_status_history (
    order_id, from_status, to_status, changed_by, changed_at, note
  ) values (
    v_order.id,
    v_order.status::text,
    v_order.status::text,
    v_actor,
    v_now,
    'Pending payment rejected; payment_id=' || v_payment.id::text || '; reason=' || v_reason
  );

  return jsonb_build_object(
    'payment_id', v_payment.id,
    'order_id', v_order.id,
    'payment_status', 'rejected',
    'rejected_by', v_actor,
    'rejected_at', v_now,
    'reason', v_reason
  );
end;
$$;

revoke all on function public.confirm_pending_payment_v1(uuid) from public;
revoke all on function public.reject_pending_payment_v1(uuid, text) from public;
grant execute on function public.confirm_pending_payment_v1(uuid) to authenticated;
grant execute on function public.reject_pending_payment_v1(uuid, text) to authenticated;

notify pgrst, 'reload schema';
