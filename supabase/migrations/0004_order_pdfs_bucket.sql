-- bucket ציבורי לקבצי PDF של הזמנות, לצורך שליחה בוואטסאפ (ManyChat/Make
-- צריכים כתובת URL נגישה בלי אימות). לקח מ-0003: bucket ציבורי עדיין דורש
-- מדיניות RLS מפורשת על storage.objects להעלאה/עדכון/מחיקה — public משפיע
-- רק על קריאה.

insert into storage.buckets (id, name, public)
values ('order-pdfs', 'order-pdfs', true)
on conflict (id) do nothing;

create policy office_order_pdfs_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'order-pdfs' and public.current_role() in ('admin','office'));

create policy office_order_pdfs_update on storage.objects
  for update to authenticated
  using (bucket_id = 'order-pdfs' and public.current_role() in ('admin','office'));

create policy office_order_pdfs_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'order-pdfs' and public.current_role() in ('admin','office'));
