-- Read-only. Run during the dedicated migrations sprint before approving SQL.
-- Zero rows in the first result means these required columns exist, NOT that
-- every policy/trigger is compatible. Review those separately before deployment.
with required(table_name,column_name) as (values
  ('orders','notes'),('orders','total_width_m'),('orders','order_number'),
  ('order_items','production_route'),('order_items','width_m'),('order_items','heights_m'),
  ('order_items','subtype'),('payments','payment_status'),('payments','recorded_by'),
  ('payments','requested_at'),('payments','received_by'),('payments','paid_at')
)
select r.* from required r left join information_schema.columns c
  on c.table_schema='public' and c.table_name=r.table_name and c.column_name=r.column_name
where c.column_name is null;

select to_regprocedure('public.create_order_v1(uuid,jsonb)') as creation_rpc,
  to_regclass('public.order_creation_requests_v1') as request_table,
  to_regprocedure('public.allocate_order_number(uuid)') as allocation_rpc;

select key,value from public.settings where key='order_counter';
select tablename,policyname,roles,cmd,qual,with_check from pg_policies
  where schemaname='public' and tablename in
  ('customers','orders','order_items','order_accessories','payments','order_status_history','order_creation_requests_v1');
select c.relname,t.tgname,pg_get_triggerdef(t.oid) as definition
  from pg_trigger t join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and not t.tgisinternal and c.relname in
  ('orders','order_items','payments','order_status_history');
