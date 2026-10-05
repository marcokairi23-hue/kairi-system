begin;

-- Exclusive access keeps the guard and conversion on the same set of rows.
lock table public.order_items in access exclusive mode;

do $$
declare
  labels text[];
  kind "char";
begin
  select t.typtype into kind from pg_type t
  where t.oid = 'public.item_status'::regtype;
  if kind <> 'e' then raise exception 'public.item_status is not an enum'; end if;
  select array_agg(enumlabel::text order by enumsortorder) into labels
  from pg_enum where enumtypid = 'public.item_status'::regtype;
  if not labels <@ array['new','ordered_from_supplier','arrived','cut','sewing',
    'ready','installed','cancelled','preparation','done']::text[] then
    raise exception 'Unexpected item_status enum values: %', labels;
  end if;
  if exists (select 1 from public.order_items where item_status is null
    or item_status::text not in ('new','ordered_from_supplier','arrived','cut','sewing',
      'ready','installed','cancelled','preparation','done')) then
    raise exception 'Unexpected persisted item_status';
  end if;
  if (select atttypid from pg_attribute where attrelid = 'public.order_items'::regclass
    and attname = 'item_status' and not attisdropped) <> 'public.item_status'::regtype then
    raise exception 'Incompatible order_items.item_status type';
  end if;

  if labels is distinct from array['new','preparation','ready','done','cancelled']::text[] then
    alter type public.item_status rename to item_status_v1_legacy;
    create type public.item_status as enum ('new','preparation','ready','done','cancelled');
    alter table public.order_items alter column item_status drop default;
    alter table public.order_items alter column item_status type public.item_status
      using (case item_status::text
        when 'ordered_from_supplier' then 'preparation'
        when 'arrived' then 'preparation'
        when 'cut' then 'preparation'
        when 'sewing' then 'preparation'
        when 'installed' then 'done'
        else item_status::text
      end)::public.item_status;
    alter table public.order_items alter column item_status set default 'new'::public.item_status;
    -- Unexpected dependencies abort the transaction rather than being removed.
    drop type public.item_status_v1_legacy;
  end if;
end $$;

commit;
