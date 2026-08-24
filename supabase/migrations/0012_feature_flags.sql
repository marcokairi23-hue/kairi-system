-- Sprint A: תשתית Feature Flags (טבלאות + RLS + seed)
-- הערה: התפקידים ב-feature_permissions הם admin/office/sales/viewer (התפקידים הקיימים
-- בפועל ב-user_role enum), לא agent/installer כפי שנכתב בטיוטת הספרינט המקורית —
-- agent/installer לא קיימים היום ב-DB/UI/PERMISSIONS_MAP.md. הוחלט עם מרקו ב-24.08.2026
-- למפות agent→sales ולהשמיט installer עד שיוגדר תפקיד כזה בפועל. ראו HANDOFF.md.

-- ---------- feature_flags ----------
create table public.feature_flags (
  key             text primary key,
  label           text not null,
  type            text not null check (type in ('screen', 'component')),
  parent_key      text references public.feature_flags(key),
  enabled_global  boolean not null default true,
  in_navbar       boolean not null default true,
  is_locked       boolean not null default false,
  sort_order      int
);

create index feature_flags_parent_key_idx on public.feature_flags(parent_key);

-- ---------- feature_permissions ----------
create table public.feature_permissions (
  feature_key text not null references public.feature_flags(key) on delete cascade,
  role        text not null,
  allowed     boolean not null default true,
  primary key (feature_key, role)
);

-- הערה: feature_key כבר מאונדקס דרך ה-PK (leftmost column) — לא נוסף אינדקס כפול.

-- ---------- RLS ----------
alter table public.feature_flags enable row level security;
alter table public.feature_permissions enable row level security;

create policy read_all on public.feature_flags for select using (auth.uid() is not null);
create policy admin_feature_flags on public.feature_flags for all
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

create policy read_all on public.feature_permissions for select using (auth.uid() is not null);
create policy admin_feature_permissions on public.feature_permissions for all
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

-- ---------- seed: מסכים ----------
insert into public.feature_flags (key, label, type, parent_key, in_navbar, is_locked, enabled_global, sort_order) values
  ('dashboard',     'מסך ראשי',        'screen', null, true,  false, true,  1),
  ('orders',        'הזמנות',          'screen', null, true,  false, true,  2),
  ('newOrder',      'הזמנה חדשה',      'screen', null, true,  false, true,  3),
  ('production',    'לוח ייצור',       'screen', null, true,  false, true,  4),
  ('orderDetail',   'הזמנה ספציפית',   'screen', null, false, false, true,  5),
  ('activityLog',   'יומן פעילות',     'screen', null, true,  false, true,  6),
  ('items',         'פריטים',          'screen', null, true,  false, false, 7),
  ('fabrics',       'קטלוג בדים',      'screen', null, true,  false, false, 8),
  ('screenManager', 'ניהול מסכים',     'screen', null, true,  true,  true,  9);

-- ---------- seed: קומפוננטות ----------
insert into public.feature_flags (key, label, type, parent_key, in_navbar, is_locked, enabled_global, sort_order) values
  ('balance',        'יתרות פתוחות לגבייה', 'component', 'dashboard',   true, false, true,  1),
  ('statusCards',    'כרטיסיות סטטוס',      'component', 'dashboard',   true, false, true,  2),
  ('newOrderBtn',    'כפתור הזמנה חדשה',    'component', 'dashboard',   true, false, true,  3),
  ('stuck',          'הזמנות תקועות',       'component', 'dashboard',   true, false, false, 4),
  ('inProduction',   'בייצור עכשיו',        'component', 'dashboard',   true, false, false, 5),
  ('recentActivity', 'פעילות אחרונה',       'component', 'dashboard',   true, false, false, 6),
  ('shortcuts',      'קיצורי דרך למסכים',   'component', 'dashboard',   true, false, false, 7),
  ('activityTab',    'טאב יומן פעילות',     'component', 'orderDetail', true, false, true,  1);

-- ---------- seed: הרשאות (feature_permissions) ----------
-- 17 features × 4 roles (admin/office/sales/viewer) = 68 שורות.
insert into public.feature_permissions (feature_key, role, allowed) values
  -- מסכים
  ('dashboard',     'admin', true), ('dashboard',     'office', true), ('dashboard',     'sales', true),  ('dashboard',     'viewer', true),
  ('orders',        'admin', true), ('orders',        'office', true), ('orders',        'sales', true),  ('orders',        'viewer', true),
  ('newOrder',      'admin', true), ('newOrder',      'office', true), ('newOrder',      'sales', true),  ('newOrder',      'viewer', false),
  ('production',    'admin', true), ('production',    'office', true), ('production',    'sales', false), ('production',    'viewer', false),
  ('orderDetail',   'admin', true), ('orderDetail',   'office', true), ('orderDetail',   'sales', true),  ('orderDetail',   'viewer', true),
  ('activityLog',   'admin', true), ('activityLog',   'office', true), ('activityLog',   'sales', false), ('activityLog',   'viewer', false),
  ('items',         'admin', true), ('items',         'office', true), ('items',         'sales', false), ('items',         'viewer', false),
  ('fabrics',       'admin', true), ('fabrics',       'office', true), ('fabrics',       'sales', true),  ('fabrics',       'viewer', false),
  ('screenManager', 'admin', true), ('screenManager', 'office', false),('screenManager', 'sales', false), ('screenManager', 'viewer', false),
  -- קומפוננטות
  ('balance',        'admin', true), ('balance',        'office', true), ('balance',        'sales', true),  ('balance',        'viewer', true),
  ('statusCards',    'admin', true), ('statusCards',    'office', true), ('statusCards',    'sales', true),  ('statusCards',    'viewer', true),
  ('newOrderBtn',    'admin', true), ('newOrderBtn',    'office', true), ('newOrderBtn',    'sales', true),  ('newOrderBtn',    'viewer', false),
  ('stuck',          'admin', true), ('stuck',          'office', true), ('stuck',          'sales', false), ('stuck',          'viewer', false),
  ('inProduction',   'admin', true), ('inProduction',   'office', true), ('inProduction',   'sales', false), ('inProduction',   'viewer', false),
  ('recentActivity', 'admin', true), ('recentActivity', 'office', true), ('recentActivity', 'sales', false), ('recentActivity', 'viewer', false),
  ('shortcuts',      'admin', true), ('shortcuts',      'office', true), ('shortcuts',      'sales', true),  ('shortcuts',      'viewer', false),
  ('activityTab',    'admin', true), ('activityTab',    'office', true), ('activityTab',    'sales', true),  ('activityTab',    'viewer', true);
