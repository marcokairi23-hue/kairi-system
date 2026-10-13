-- Read-only baseline for the authorized V1 installation. Run again after it.
-- Hashes contain no business row contents; compare within a quiet write window.
begin transaction isolation level repeatable read read only;
select now() as captured_at, current_database() as database_name,
  current_setting('server_version') as postgres_version;
with rows as (
  select 'orders' as table_name, to_jsonb(t) as value from public.orders t
  union all select 'order_items', to_jsonb(t)-'production_version'-'production_changed_by'-'production_changed_at' from public.order_items t
  union all select 'profiles', to_jsonb(t) from public.profiles t
  union all select 'payments', to_jsonb(t) from public.payments t
  union all select 'order_status_history', to_jsonb(t) from public.order_status_history t
  union all select 'feature_flags', to_jsonb(t) from public.feature_flags t
  union all select 'feature_permissions', to_jsonb(t) from public.feature_permissions t
  union all select 'icredit_events', to_jsonb(t) from public.icredit_events t
)
select table_name, count(*) as row_count,
  md5(coalesce(string_agg(value::text,E'\n' order by value::text),'')) as business_fingerprint
from rows group by table_name order by table_name;
select count(*) as eligible_items from public.order_items i join public.orders o on o.id=i.order_id
where i.family::text in ('curtain','shading') and i.for_execution
  and i.item_status::text in ('new','preparation','ready')
  and (i.item_status::text<>'ready' or i.issue_kind is null)
  and o.payment_approved is true and o.status::text in ('new_execution','in_execution','ready','completed');
commit;
