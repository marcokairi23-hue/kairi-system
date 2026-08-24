-- מיגרציה 0013: הוספת מסכי "משתמשים" ו"הגדרות" למנגנון feature flags (seed בלבד).
-- אין שינוי קוד/navbar/hook כאן — עדיין מחווטים ב-Layout.tsx דרך role==='admin' בלבד.

-- ---------- seed: מסכים ----------
insert into public.feature_flags (key, label, type, parent_key, in_navbar, is_locked, enabled_global, sort_order) values
  ('users',    'משתמשים', 'screen', null, true, false, true, 10),
  ('settings', 'הגדרות',  'screen', null, true, false, true, 11);

-- ---------- seed: הרשאות (feature_permissions) ----------
-- 2 מסכים × 4 תפקידים (admin/office/sales/viewer) = 8 שורות.
insert into public.feature_permissions (feature_key, role, allowed) values
  ('users',    'admin', true), ('users',    'office', false), ('users',    'sales', false), ('users',    'viewer', false),
  ('settings', 'admin', true), ('settings', 'office', true),  ('settings', 'sales', false), ('settings', 'viewer', false);
