-- תיקון: bucket ציבורי (public=true) מאפשר קריאה אנונימית של קבצים, אבל
-- Storage API מבצע INSERT...RETURNING * גם בהעלאה של משתמש מחובר — וללא
-- מדיניות SELECT על storage.objects, ה-RETURNING נכשל וה-API מחזיר שגיאת
-- RLS גנרית גם כשה-INSERT עצמו הותר. חסר ב-0003/0004 שיצרו רק
-- insert/update/delete בלי select. ראו:
-- https://supabase.com/docs/guides/troubleshooting/storage-error-403-forbidden-new-row-violates-row-level-security-policy-on-upload-a94384

create policy office_order_pdfs_select on storage.objects
  for select to authenticated
  using (bucket_id = 'order-pdfs' and public.current_role() in ('admin','office'));

create policy office_fabric_images_select on storage.objects
  for select to authenticated
  using (bucket_id = 'fabric-images' and public.current_role() in ('admin','office'));
