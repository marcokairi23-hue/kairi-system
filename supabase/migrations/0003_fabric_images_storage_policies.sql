-- bucket fabric-images קיים (public) אבל היה בלי שום מדיניות RLS על storage.objects,
-- כך שהעלאת תמונות נכשלה בשקט. מוסיף INSERT/UPDATE/DELETE מוגבל ל-admin/office,
-- תואם את office_fabric_images שכבר קיימת על טבלת ה-DB fabric_images.

create policy office_fabric_images_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fabric-images' and public.current_role() in ('admin','office'));

create policy office_fabric_images_update on storage.objects
  for update to authenticated
  using (bucket_id = 'fabric-images' and public.current_role() in ('admin','office'));

create policy office_fabric_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'fabric-images' and public.current_role() in ('admin','office'));
