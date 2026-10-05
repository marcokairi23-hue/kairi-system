begin;

alter table public.payments
  add column if not exists collection_status text,
  add column if not exists office_received_by uuid,
  add column if not exists office_received_at timestamptz;

do $$
declare
  expected record;
begin
  for expected in select * from (values
    ('collection_status','text'), ('office_received_by','uuid'),
    ('office_received_at','timestamp with time zone')
  ) as fields(column_name, type_name)
  loop
    if (select atttypid from pg_attribute where attrelid = 'public.payments'::regclass
      and attname = expected.column_name and not attisdropped) <> expected.type_name::regtype then
      raise exception 'Incompatible payments.% type', expected.column_name;
    end if;
  end loop;
  if exists (select 1 from public.payments where collection_status is not null
    and collection_status not in ('at_agent','received_office')) then
    raise exception 'Unexpected collection_status';
  end if;
  if not exists (select 1 from pg_constraint c
    where c.conrelid = 'public.payments'::regclass and c.contype = 'f'
      and c.confrelid = 'public.profiles'::regclass
      and c.conkey = array[(select attnum from pg_attribute
        where attrelid = c.conrelid and attname = 'office_received_by')]::smallint[]
      and c.confkey = array[(select attnum from pg_attribute
        where attrelid = c.confrelid and attname = 'id')]::smallint[]
  ) then
    alter table public.payments add constraint payments_office_received_by_fkey
      foreign key (office_received_by) references public.profiles(id);
  end if;
end $$;

alter table public.payments
  alter column collection_status drop not null,
  alter column collection_status drop default,
  alter column office_received_by drop not null,
  alter column office_received_by drop default,
  alter column office_received_at drop not null,
  alter column office_received_at drop default;

-- Replace only this migration's checks before its deterministic backfill.
alter table public.payments drop constraint if exists payments_collection_status_v1_check;
alter table public.payments drop constraint if exists payments_office_receipt_v1_check;
update public.payments
set collection_status = case
      when payment_route in ('cash','check') and payment_status::text = 'received' then 'at_agent'
      else null end,
    office_received_by = null,
    office_received_at = null
where not (collection_status is not distinct from 'received_office'
  and office_received_by is not null and office_received_at is not null);

alter table public.payments add constraint payments_collection_status_v1_check
  check (collection_status is null or collection_status in ('at_agent','received_office'));
alter table public.payments add constraint payments_office_receipt_v1_check check (
  ((collection_status is null or collection_status = 'at_agent')
    and office_received_by is null and office_received_at is null)
  or (collection_status is not distinct from 'received_office'
    and office_received_by is not null and office_received_at is not null)
);

-- Baseline office_payments already grants Office/Admin UPDATE.
-- Restrictive checks also prevent Sales inserting a pre-confirmed receipt.
drop policy if exists payments_office_receipt_insert_v1 on public.payments;
create policy payments_office_receipt_insert_v1 on public.payments
  as restrictive for insert to authenticated with check (
    (collection_status is distinct from 'received_office')
    or public.current_role() in ('admin','office')
  );
drop policy if exists payments_office_receipt_update_v1 on public.payments;
create policy payments_office_receipt_update_v1 on public.payments
  as restrictive for update to authenticated
  using (public.current_role() in ('admin','office'))
  with check (public.current_role() in ('admin','office'));

commit;
