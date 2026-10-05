begin;

-- Remove only the abandoned gate objects, without cascading to other objects.
drop trigger if exists order_items_enforce_payment_gate_v1 on public.order_items;
drop trigger if exists orders_enforce_payment_gate_v1 on public.orders;
drop trigger if exists payments_apply_v1_defaults on public.payments;
drop function if exists public.confirm_pending_payment_v1(uuid);
drop function if exists public.reject_pending_payment_v1(uuid, text);
drop function if exists public.apply_payment_v1_defaults();
drop function if exists public.enforce_order_payment_gate_v1();
drop function if exists public.enforce_item_payment_gate_v1();

alter table public.orders
  add column if not exists payment_route text,
  add column if not exists deposit_requested numeric,
  add column if not exists payment_approved boolean,
  add column if not exists payment_approved_by uuid,
  add column if not exists payment_approved_at timestamptz;

-- Existing baseline payments are receipts; omitted status remains a receipt.
alter table public.payments
  add column if not exists payment_status text not null default 'received',
  add column if not exists payment_route text,
  add column if not exists recorded_by uuid;

do $$
declare
  expected record;
  actual record;
  status_type oid;
  status_kind "char";
  status_labels text[];
begin
  for expected in select * from (values
    ('orders', 'payment_route', 'text'),
    ('orders', 'deposit_requested', 'numeric'),
    ('orders', 'payment_approved', 'boolean'),
    ('orders', 'payment_approved_by', 'uuid'),
    ('orders', 'payment_approved_at', 'timestamp with time zone'),
    ('payments', 'payment_route', 'text'),
    ('payments', 'recorded_by', 'uuid')
  ) as fields(table_name, column_name, type_name)
  loop
    select a.atttypid, a.attnotnull into actual from pg_attribute a
    where a.attrelid = format('public.%I', expected.table_name)::regclass
      and a.attname = expected.column_name and a.attnum > 0 and not a.attisdropped;
    if actual.atttypid <> expected.type_name::regtype or actual.attnotnull then
      raise exception 'Incompatible public.%.%', expected.table_name, expected.column_name;
    end if;
  end loop;

  select t.oid, t.typtype into status_type, status_kind
  from pg_attribute a join pg_type t on t.oid = a.atttypid
  where a.attrelid = 'public.payments'::regclass and a.attname = 'payment_status'
    and a.attnum > 0 and not a.attisdropped;
  if status_kind = 'e' then
    select array_agg(enumlabel::text order by enumlabel::text) into status_labels
    from pg_enum where enumtypid = status_type;
    if status_labels is distinct from array['pending','received','rejected']::text[] then
      raise exception 'Incompatible payments.payment_status enum';
    end if;
  elsif status_type <> 'text'::regtype then
    raise exception 'Incompatible payments.payment_status type';
  end if;

  for expected in select * from (values
    ('orders', 'payment_approved_by', 'orders_payment_approved_by_fkey'),
    ('payments', 'recorded_by', 'payments_recorded_by_fkey')
  ) as fields(table_name, column_name, constraint_name)
  loop
    if not exists (
      select 1 from pg_constraint c
      where c.conrelid = format('public.%I', expected.table_name)::regclass
        and c.contype = 'f' and c.confrelid = 'public.profiles'::regclass
        and c.conkey = array[(select attnum from pg_attribute
          where attrelid = c.conrelid and attname = expected.column_name)]::smallint[]
        and c.confkey = array[(select attnum from pg_attribute
          where attrelid = c.confrelid and attname = 'id')]::smallint[]
    ) then
      execute format('alter table public.%I add constraint %I foreign key (%I) references public.profiles(id)',
        expected.table_name, expected.constraint_name, expected.column_name);
    end if;
  end loop;
end $$;

alter table public.payments alter column payment_status set default 'received';

alter table public.orders drop constraint if exists orders_payment_route_v1_check;
alter table public.orders add constraint orders_payment_route_v1_check
  check (payment_route is null or payment_route in ('cash','check','credit_card','bank_transfer','quote'));
alter table public.orders drop constraint if exists orders_deposit_requested_v1_check;
alter table public.orders add constraint orders_deposit_requested_v1_check
  check (deposit_requested is null or deposit_requested >= 0);
alter table public.payments drop constraint if exists payments_payment_status_v1_check;
alter table public.payments add constraint payments_payment_status_v1_check
  check (payment_status is not null and payment_status::text in ('pending','received','rejected'));
alter table public.payments drop constraint if exists payments_payment_route_v1_check;
alter table public.payments add constraint payments_payment_route_v1_check
  check (payment_route is null or payment_route in ('cash','check','credit_card','bank_transfer'));

commit;
