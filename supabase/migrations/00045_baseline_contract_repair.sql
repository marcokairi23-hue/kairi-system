-- Missing baseline objects only. Existing incompatible definitions abort atomically.
begin;

do $$
declare
  route_type oid;
  route_kind "char";
  route_values text[];
begin
  select t.oid, t.typtype into route_type, route_kind
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public' and t.typname = 'production_route';

  if not found then
    create type public.production_route as enum ('internal', 'external');
  else
    select array_agg(e.enumlabel::text order by e.enumlabel::text)
      into route_values
    from pg_enum e where e.enumtypid = route_type;

    if route_kind <> 'e'
      or route_values is distinct from array['external', 'internal']::text[] then
      raise exception 'Incompatible public.production_route definition';
    end if;
  end if;
end $$;

alter table public.order_items
  add column if not exists production_route public.production_route
    not null default 'internal'::public.production_route;

alter table public.orders
  add column if not exists notes text,
  add column if not exists signature_url text;

do $$
declare
  route_column record;
  order_column record;
begin
  select a.atttypid, a.attnotnull, pg_get_expr(d.adbin, d.adrelid) as default_expression
    into route_column
  from pg_attribute a
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.order_items'::regclass
    and a.attname = 'production_route' and a.attnum > 0 and not a.attisdropped;

  if not found then
    raise exception 'Missing public.order_items.production_route';
  end if;
  if route_column.atttypid <> 'public.production_route'::regtype
    or not route_column.attnotnull
    or route_column.default_expression is null
    or route_column.default_expression not in (
      '''internal''::production_route', '''internal''::public.production_route'
    ) then
    raise exception 'Incompatible public.order_items.production_route definition';
  end if;

  for order_column in
    select a.attname, a.atttypid, a.attnotnull, d.oid as default_oid
    from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = 'public.orders'::regclass
      and a.attname in ('notes', 'signature_url')
      and a.attnum > 0 and not a.attisdropped
  loop
    if order_column.atttypid <> 'pg_catalog.text'::regtype
      or order_column.attnotnull or order_column.default_oid is not null then
      raise exception 'Incompatible public.orders.% definition', order_column.attname;
    end if;
  end loop;
end $$;

commit;
