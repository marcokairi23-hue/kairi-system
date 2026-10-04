-- Sprint 2 preflight. Read-only; does not apply migration 0016.
-- Run against the approved production project before considering any migration.
begin transaction read only;

select column_name, data_type, udt_name, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'order_items'
  and column_name in ('production_route', 'roman_internal_fabric_cut', 'routing_state', 'routing_owner')
order by column_name;

select 'orders' as entity, count(*) as row_count from public.orders
union all select 'order_items', count(*) from public.order_items
union all select 'payments', count(*) from public.payments
union all select 'order_status_history', count(*) from public.order_status_history;

select oi.item_status, oi.production_route, count(*) as unpaid_executable_items
from public.order_items oi
join public.orders o on o.id = oi.order_id
where oi.for_execution
  and o.status not in ('draft', 'quote', 'pending_payment', 'cancelled')
  and not exists (
    select 1 from public.payments p
    where p.order_id = o.id and p.payment_status = 'received'
  )
group by oi.item_status, oi.production_route;

select c.relname as table_name, t.tgname as trigger_name, pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and not t.tgisinternal
  and t.tgname in (
    'order_items_normalize_initial_routing_v1',
    'order_items_route_after_write_v1',
    'orders_route_items_after_payment_v1',
    'payments_route_items_after_received_v1'
  )
order by c.relname, t.tgname;

commit;
