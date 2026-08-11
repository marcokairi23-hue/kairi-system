-- תיקון ליקוי #15 (DEFECTS_MAP.md): order_status_history הייתה פתוחה לכל משתמש מחובר
-- (auth.uid() is not null בלבד), בלי תלות בבעלות על ההזמנה. כל sales יכול היה
-- לקרוא/לכתוב רשומות היסטוריה של הזמנות של סוכנים אחרים.
-- מיישר לאותו דפוס שכבר קיים ב-orders/order_items/order_accessories.

drop policy if exists hist_read on public.order_status_history;
drop policy if exists hist_insert on public.order_status_history;

create policy office_history on public.order_status_history for all
  using (public.current_role() in ('admin','office'))
  with check (public.current_role() in ('admin','office'));

create policy sales_history on public.order_status_history for all
  using (public.current_role() = 'sales' and exists
    (select 1 from public.orders o where o.id = order_id and o.agent_id = auth.uid()))
  with check (public.current_role() = 'sales' and exists
    (select 1 from public.orders o where o.id = order_id and o.agent_id = auth.uid()));
