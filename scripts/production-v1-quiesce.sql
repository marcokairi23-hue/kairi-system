-- Emergency plan, NOT an installation migration. Execute only after explicit
-- authorization and while business writes are paused. Preserve every journal,
-- task, read timestamp and business row. Pair with rollback to the previous UI.
-- Resuming V1 needs a reviewed repair/re-enable step and refreshed clients.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

revoke execute on function public.production_mutate_v1(jsonb,text,text) from public,anon,authenticated;
revoke execute on function public.production_notifications_v1(text,timestamptz,uuid,integer) from public,anon,authenticated;
revoke execute on function public.production_notification_read_v1(uuid) from public,anon,authenticated;

alter table public.order_items disable trigger production_guard_v1;
alter table public.order_items disable trigger production_log_v1;
alter table public.order_items disable trigger production_notification_item_v1;
alter table public.order_items disable trigger production_notification_item_delete_v1;
alter table public.orders disable trigger production_notification_order_v1;
alter table public.orders disable trigger production_notification_order_delete_v1;
alter table public.profiles disable trigger production_notification_profile_v1;

commit;
