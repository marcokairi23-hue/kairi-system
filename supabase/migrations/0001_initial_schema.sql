-- ============================================================
-- KAIRI CURTAINS UNIFIED SYSTEM — Initial Schema (v1.1)
-- Migration 0001
-- Target: Supabase (PostgreSQL 15+)
-- ============================================================

-- ---------- ENUMS ----------
create type user_role as enum ('admin', 'office', 'sales', 'viewer');
create type lead_status as enum ('new', 'contacted', 'meeting', 'converted', 'not_relevant');
create type order_status as enum (
  'draft',            -- טיוטה (כולל טיוטות אופליין)
  'quote',            -- הצעת מחיר
  'pending_payment',  -- ממתין לגבייה
  'ready',            -- חדש לביצוע
  'in_production',    -- בייצור
  'completed',        -- הושלם
  'cancelled'         -- מבוטל
);
create type item_family as enum ('curtain', 'shading');
create type shading_subtype as enum ('zebra', 'venetian', 'roman', 'roller');
create type item_status as enum ('new', 'cut', 'sewing', 'ready', 'installed', 'cancelled');
create type movement_type as enum ('receipt', 'consumption', 'adjustment', 'waste', 'return');
create type doc_type as enum ('quote', 'order', 'work_order', 'daily_report');
create type comm_channel as enum ('whatsapp', 'email', 'call');

-- ---------- USERS / PROFILES ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  role user_role not null default 'sales',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'viewer');
  return new;
end $$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- role helper for RLS
create or replace function public.current_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ---------- CRM ----------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,              -- מפתח שורה מ-Google Sheets למניעת כפילויות
  full_name text not null,
  phone text not null,
  city text,
  source text,
  status lead_status not null default 'new',
  assigned_to uuid references public.profiles(id),
  notes text,
  converted_customer_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.leads (status);
create index on public.leads (phone);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  phone2 text,
  email text,
  address text,
  city text,
  notes text,
  lead_id uuid references public.leads(id),
  created_at timestamptz not null default now()
);
create index on public.customers (phone);

alter table public.leads
  add constraint leads_converted_fk
  foreign key (converted_customer_id) references public.customers(id);

-- ---------- CATALOG ----------
create table public.fabrics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text unique,
  barcode text,
  supplier text,
  color text,
  gsm numeric,                          -- משקל למ"ר
  weight_per_meter numeric,             -- ק"ג למטר אורך
  roll_width_cm numeric default 300,    -- רוחב גליל, ברירת מחדל 3.00 מ'
  composition text,
  price_per_meter numeric,
  is_stock_managed boolean not null default true,
  low_stock_threshold_m numeric default 20,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.fabrics (name);
create index on public.fabrics (barcode);

create table public.fabric_images (
  id uuid primary key default gen_random_uuid(),
  fabric_id uuid not null references public.fabrics(id) on delete cascade,
  storage_path text not null,
  is_primary boolean not null default false,
  sort_order int not null default 0
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  color text
);
create table public.fabric_tags (
  fabric_id uuid references public.fabrics(id) on delete cascade,
  tag_id uuid references public.tags(id) on delete cascade,
  primary key (fabric_id, tag_id)
);

-- ---------- INVENTORY ----------
create table public.fabric_rolls (
  id uuid primary key default gen_random_uuid(),
  fabric_id uuid not null references public.fabrics(id),
  roll_barcode text unique,
  received_weight_kg numeric,
  received_meters numeric not null,
  location text,
  status text not null default 'active' check (status in ('active','depleted')),
  received_at timestamptz not null default now(),
  received_by uuid references public.profiles(id)
);
create index on public.fabric_rolls (fabric_id);

-- יומן תנועות: append-only. אין UPDATE / DELETE לאף אחד.
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  roll_id uuid not null references public.fabric_rolls(id),
  movement_type movement_type not null,
  quantity_meters numeric not null,     -- חיובי בקליטה/החזרה, שלילי בניכוי/פחת
  order_item_id uuid,                   -- FK מתווסף אחרי יצירת order_items
  weight_measured_kg numeric,           -- לשקילות
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index on public.stock_movements (roll_id);

-- מלאי פיזי נוכחי לפי גליל
create view public.roll_stock as
  select r.id as roll_id, r.fabric_id,
         coalesce(sum(m.quantity_meters), 0) as meters_on_hand
  from public.fabric_rolls r
  left join public.stock_movements m on m.roll_id = r.id
  group by r.id, r.fabric_id;

-- ---------- CONSUMPTION RULES (נוסחאות צריכת בד — מתחלפות, לא בקוד) ----------
-- כלל התחלתי: וילון הסטה = רוחב × 3, בתנאי שהגובה ≤ גובה מקסימלי (רוחב גליל).
-- אם התנאי לא מתקיים — אין חישוב אוטומטי והשדה מסומן להזנה ידנית.
create table public.consumption_rules (
  id uuid primary key default gen_random_uuid(),
  family item_family not null,
  name text not null,
  width_multiplier numeric not null default 3.0,
  fixed_addition_m numeric not null default 0,
  max_height_cm numeric default 300,    -- מעבר לזה: חישוב ידני
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- ORDERS ----------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number int unique,              -- NULL בטיוטה; מוקצה בשרת מ-9000
  client_draft_id text unique,          -- מזהה טיוטה שנוצר במכשיר (אופליין) למניעת כפילות בסנכרון
  is_quote boolean not null default false,
  status order_status not null default 'draft',
  customer_id uuid references public.customers(id),
  agent_id uuid not null references public.profiles(id),
  customer_name_snapshot text not null, -- הקפאת פרטים כפי שהוזנו בשטח
  phone_snapshot text,
  address_snapshot text,
  items_total numeric not null default 0,       -- מחושב: סכום פריטים לביצוע
  installation_fee numeric not null default 0,  -- לא נכלל בסה"כ (נגבה מול המתקין)
  discount numeric not null default 0,
  final_total numeric not null default 0,       -- "סה"כ לתשלום" — ידני, עם כפתור מלא
  total_width_m numeric not null default 0,     -- נתון עזר: סך רוחבים (מטר קיר)
  send_email text,
  signature_name text,
  signature_image_path text,            -- חתימת מגע (שלב 5)
  legal_footer_snapshot text,           -- הטקסט המשפטי כפי שהיה בעת השליחה
  legacy boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);
create index on public.orders (status);
create index on public.orders (agent_id);
create index on public.orders (customer_id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  family item_family not null,
  subtype shading_subtype,              -- רק למשפחת הצללה
  location text not null,               -- מיקום (סלון, חדר שינה...)
  width_cm numeric not null,
  heights_cm numeric[] not null default '{}',   -- כמה מדידות גובה לאורך החלון
  -- שדות וילון תפור:
  sewing_type text,                     -- סוג תפירה (שטוח הפוך...)
  hem_cm numeric,                       -- מכפלת (תחתון), בד"כ 10
  shtaif_cm numeric,                    -- שטייף (קפל עליון)
  is_split boolean,                     -- חצוי: נפתח מהאמצע לצדדים
  -- שדות הצללה:
  mount_type text,                      -- רגלי קיר / תקרה
  mechanism_side text,                  -- צד מנגנון
  color_fabric_text text,               -- צבע/סוג בד (טקסט חופשי)
  -- משותף:
  fabric_id uuid references public.fabrics(id),
  fabric_text text,                     -- כשהבד לא מהקטלוג
  price numeric not null default 0,     -- עלות ₪ ללקוח (ידני)
  for_execution boolean not null default true,  -- "לביצוע"
  item_status item_status not null default 'new',
  estimated_meters numeric,             -- צריכת בד לשריון (מחושב עם דריסה ידנית)
  estimated_meters_manual boolean not null default false,
  notes text,
  sort_order int not null default 0
);
create index on public.order_items (order_id);
create index on public.order_items (fabric_id);

alter table public.stock_movements
  add constraint stock_movements_item_fk
  foreign key (order_item_id) references public.order_items(id);

-- קטלוג אביזרים (חובק, מקל פתיחה...) — ניתן לעריכה בהגדרות
create table public.accessories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  default_unit_price numeric not null default 0,
  is_active boolean not null default true
);
create table public.order_accessories (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  accessory_id uuid references public.accessories(id),
  name_snapshot text not null,
  quantity numeric not null default 0,
  unit_price numeric not null default 0
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  amount numeric not null,
  method text,                          -- מתוך רשימת settings
  paid_at timestamptz not null default now(),
  received_by uuid references public.profiles(id),
  note text
);
create index on public.payments (order_id);

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id),
  from_status text,
  to_status text not null,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now(),
  note text
);

-- יומן פעילות/הערות מתוארך (מחליף את שדה ההערות שנערך שוב ושוב)
create table public.order_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  body text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- DOCUMENTS & COMMUNICATIONS ----------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id),
  doc_type doc_type not null,
  doc_number text,
  storage_path text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.communications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id),
  order_id uuid references public.orders(id),
  channel comm_channel not null,
  direction text not null default 'out' check (direction in ('in','out')),
  document_id uuid references public.documents(id),
  status text not null default 'sent' check (status in ('sent','failed','pending')),
  sent_by uuid references public.profiles(id),
  sent_at timestamptz not null default now(),
  note text
);

-- ---------- SETTINGS & AUDIT ----------
create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  action text not null,
  table_name text not null,
  record_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

-- ---------- ORDER NUMBER ALLOCATION (מונה אטומי מ-9000) ----------
create or replace function public.allocate_order_number(p_order_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_next int;
begin
  update public.settings
     set value = jsonb_build_object('next', (value->>'next')::int + 1),
         updated_at = now()
   where key = 'order_counter'
   returning (value->>'next')::int - 1 into v_next;

  update public.orders
     set order_number = v_next, updated_at = now()
   where id = p_order_id and order_number is null;

  return v_next;
end $$;

-- ---------- ESTIMATED METERS (חישוב לפי כלל פעיל, עם fallback ידני) ----------
create or replace function public.estimate_item_meters(
  p_family item_family, p_width_cm numeric, p_max_height_cm numeric
) returns numeric language plpgsql stable as $$
declare r record; v numeric;
begin
  select * into r from public.consumption_rules
   where family = p_family and is_active limit 1;
  if r is null then return null; end if;
  if r.max_height_cm is not null and p_max_height_cm > r.max_height_cm then
    return null;  -- מחוץ לתחום הכלל: נדרשת הזנה ידנית
  end if;
  v := (p_width_cm / 100.0) * r.width_multiplier + r.fixed_addition_m;
  return round(v, 2);
end $$;

-- ---------- ROW LEVEL SECURITY ----------
alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.customers enable row level security;
alter table public.fabrics enable row level security;
alter table public.fabric_images enable row level security;
alter table public.tags enable row level security;
alter table public.fabric_tags enable row level security;
alter table public.fabric_rolls enable row level security;
alter table public.stock_movements enable row level security;
alter table public.consumption_rules enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.accessories enable row level security;
alter table public.order_accessories enable row level security;
alter table public.payments enable row level security;
alter table public.order_status_history enable row level security;
alter table public.order_notes enable row level security;
alter table public.documents enable row level security;
alter table public.communications enable row level security;
alter table public.settings enable row level security;
alter table public.audit_log enable row level security;

-- כל משתמש מחובר ופעיל: קריאה בסיסית
create policy read_all on public.profiles for select using (auth.uid() is not null);
create policy read_fabrics on public.fabrics for select using (auth.uid() is not null);
create policy read_fabric_images on public.fabric_images for select using (auth.uid() is not null);
create policy read_tags on public.tags for select using (auth.uid() is not null);
create policy read_fabric_tags on public.fabric_tags for select using (auth.uid() is not null);
create policy read_rules on public.consumption_rules for select using (auth.uid() is not null);
create policy read_accessories on public.accessories for select using (auth.uid() is not null);
create policy read_settings on public.settings for select using (auth.uid() is not null);

-- admin/office: ניהול מלא של CRM, קטלוג, מלאי, הזמנות
create policy office_leads on public.leads for all
  using (public.current_role() in ('admin','office'))
  with check (public.current_role() in ('admin','office'));
create policy office_customers on public.customers for all
  using (public.current_role() in ('admin','office'))
  with check (public.current_role() in ('admin','office'));
create policy office_fabrics on public.fabrics for all
  using (public.current_role() in ('admin','office'))
  with check (public.current_role() in ('admin','office'));
create policy office_fabric_images on public.fabric_images for all
  using (public.current_role() in ('admin','office'))
  with check (public.current_role() in ('admin','office'));
create policy office_rolls on public.fabric_rolls for all
  using (public.current_role() in ('admin','office'))
  with check (public.current_role() in ('admin','office'));
create policy office_orders on public.orders for all
  using (public.current_role() in ('admin','office'))
  with check (public.current_role() in ('admin','office'));
create policy office_items on public.order_items for all
  using (public.current_role() in ('admin','office'))
  with check (public.current_role() in ('admin','office'));
create policy office_accessories_rows on public.order_accessories for all
  using (public.current_role() in ('admin','office'))
  with check (public.current_role() in ('admin','office'));
create policy office_payments on public.payments for all
  using (public.current_role() in ('admin','office'))
  with check (public.current_role() in ('admin','office'));

-- sales: לידים והזמנות ששויכו אליו; יצירת לקוחות
create policy sales_leads on public.leads for select
  using (public.current_role() = 'sales' and assigned_to = auth.uid());
create policy sales_leads_update on public.leads for update
  using (public.current_role() = 'sales' and assigned_to = auth.uid());
create policy sales_customers_read on public.customers for select
  using (public.current_role() = 'sales');
create policy sales_customers_insert on public.customers for insert
  with check (public.current_role() = 'sales');
create policy sales_orders on public.orders for select
  using (public.current_role() = 'sales' and agent_id = auth.uid());
create policy sales_orders_insert on public.orders for insert
  with check (public.current_role() = 'sales' and agent_id = auth.uid());
create policy sales_orders_update on public.orders for update
  using (public.current_role() = 'sales' and agent_id = auth.uid());
create policy sales_items on public.order_items for all
  using (public.current_role() = 'sales' and exists
    (select 1 from public.orders o where o.id = order_id and o.agent_id = auth.uid()))
  with check (public.current_role() = 'sales' and exists
    (select 1 from public.orders o where o.id = order_id and o.agent_id = auth.uid()));
create policy sales_order_accessories on public.order_accessories for all
  using (public.current_role() = 'sales' and exists
    (select 1 from public.orders o where o.id = order_id and o.agent_id = auth.uid()))
  with check (public.current_role() = 'sales' and exists
    (select 1 from public.orders o where o.id = order_id and o.agent_id = auth.uid()));
create policy sales_payments on public.payments for insert
  with check (public.current_role() = 'sales');
create policy sales_payments_read on public.payments for select
  using (public.current_role() = 'sales');

-- תנועות מלאי: קריאה לכולם, יצירה ל-admin/office/sales. אין UPDATE/DELETE לאיש.
create policy stock_read on public.stock_movements for select using (auth.uid() is not null);
create policy stock_insert on public.stock_movements for insert
  with check (public.current_role() in ('admin','office','sales'));

-- היסטוריה, הערות, מסמכים, תקשורת: קריאה לכולם, כתיבה למחוברים
create policy hist_read on public.order_status_history for select using (auth.uid() is not null);
create policy hist_insert on public.order_status_history for insert with check (auth.uid() is not null);
create policy notes_read on public.order_notes for select using (auth.uid() is not null);
create policy notes_insert on public.order_notes for insert with check (auth.uid() is not null);
create policy docs_read on public.documents for select using (auth.uid() is not null);
create policy docs_insert on public.documents for insert with check (auth.uid() is not null);
create policy comms_read on public.communications for select using (auth.uid() is not null);
create policy comms_insert on public.communications for insert with check (auth.uid() is not null);

-- admin בלבד: הגדרות, כללים, אביזרים, פרופילים, audit
create policy admin_settings on public.settings for all
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy admin_rules on public.consumption_rules for all
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy admin_accessories on public.accessories for all
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy admin_profiles on public.profiles for all
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy audit_read on public.audit_log for select using (public.current_role() = 'admin');
create policy audit_insert on public.audit_log for insert with check (auth.uid() is not null);

-- ---------- SEED ----------
insert into public.settings (key, value) values
  ('order_counter',      '{"next": 9000}'),
  ('business_info',      '{"name": "מרקו קאירי — וילונות ובדים", "phone_office": "050-745-5551", "address": "נחלת בנימין 16 ת\"א || דרך מנחם בגין 7 ת\"א", "instagram": "marcokairi_curtains", "website": "marcokairi.com"}'),
  ('legal_footer',       '{"text": "ההזמנה תסופק עד 21 ימי עסקים מרגע תשלום המקדמה. (פרט לוילונות הונציאנים, הרומאים והגלילות)\nבדקתי את המידות וסוג התפירה ואני מאשר/ת את ההזמנה (לא תתקבל תלונה)"}'),
  ('payment_methods',    '["מזומן", "אשראי", "העברה בנקאית", "ביט", "צ׳ק"]'),
  ('sewing_types',       '["שטוח הפוך", "קפלים", "טאבים", "שרוול"]'),
  ('default_hem_cm',     '10'),
  ('default_shtaif_cm',  '10');

insert into public.consumption_rules (family, name, width_multiplier, fixed_addition_m, max_height_cm, notes) values
  ('curtain', 'וילון הסטה — כלל בסיס', 3.0, 0, 300,
   'רוחב × 3 כל עוד הגובה ≤ 3.00 מ׳ (רוחב גליל סטנדרטי). מעבר לכך — הזנה ידנית. יוחלף באלגוריתם אופטימיזציית גזירה בעתיד.');

insert into public.accessories (name, default_unit_price) values
  ('חובק', 25),
  ('מקל פתיחה', 20);
