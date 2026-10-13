-- Read-only validation, only after BOTH migrations have committed.
begin transaction isolation level repeatable read read only;
with eligible as (
  select i.id, i.item_status::text as state from public.order_items i join public.orders o on o.id=i.order_id
  where i.family::text in ('curtain','shading') and i.for_execution
    and i.item_status::text in ('new','preparation','ready')
    and (i.item_status::text<>'ready' or i.issue_kind is null)
    and o.payment_approved is true and o.status::text in ('new_execution','in_execution','ready','completed')
)
select (select count(*) from eligible) as eligible_items,
  (select count(*) from public.production_tasks where status='active') as active_tasks,
  (select count(*) from eligible e where not exists(select 1 from public.production_tasks t
    where t.order_item_id=e.id and t.status='active' and t.from_status=e.state)) as missing_tasks,
  (select count(*) from public.production_tasks t where t.status='active' and not exists(
    select 1 from eligible e where e.id=t.order_item_id and e.state=t.from_status)) as unexpected_tasks,
  (select count(*) from (select item_key from public.production_tasks where status='active'
    group by item_key having count(*)>1) duplicates) as duplicate_active_tasks,
  (select count(*) from public.production_tasks t cross join public.profiles p
    where t.status='active' and p.is_active and p.role::text in ('admin','office')
    and not exists(select 1 from public.production_task_recipients r where r.task_id=t.id and r.user_id=p.id)) as missing_recipients,
  (select count(*) from public.production_task_recipients where first_read_at is not null) as initial_read_count,
  (select count(*) from public.production_item_events) as initial_item_events;
select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('production_tasks','production_task_recipients','production_item_events');
select c.relname,t.tgname,t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid
where not t.tgisinternal and t.tgname in ('production_guard_v1','production_log_v1',
  'production_notification_item_v1','production_notification_item_delete_v1',
  'production_notification_order_v1','production_notification_order_delete_v1','production_notification_profile_v1')
order by c.relname,t.tgname;
select p.proname,p.prosecdef,p.proconfig,
  has_function_privilege('anon',p.oid,'execute') as anon_execute,
  has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('production_mutate_v1','production_notifications_v1','production_notification_read_v1')
order by p.proname;
commit;
