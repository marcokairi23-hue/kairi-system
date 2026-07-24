# מערכת קאירי — ארכיטקטורה

## 1. הסטק הטכני

| רכיב | טכנולוגיה |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind |
| Database | Supabase (PostgreSQL) — פרויקט `kairi-os`, אזור אירלנד |
| Auth | Supabase Auth (Email + סיסמה) |
| Storage | Supabase Storage — buckets: `fabric-images` (ציבורי), `documents` (פרטי) |
| Hosting | Cloudflare Pages — `kairi-system.pages.dev` |
| Repo | GitHub — `marcokairi23-hue/kairi-system` (פרטי) |
| Deploy | אוטומטי בכל push ל-main |

**עלות:** ~26$/חודש (Supabase Pro + דומיין). Cloudflare חינמי.

**משתני סביבה (`.env.local`, לא בגיט):**
```
VITE_SUPABASE_URL=https://ipcnyqkcvbvzmasmzaur.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```
⚠️ ה-URL **בלי** `/rest/v1/` בסוף — טעות זו גרמה לבאג.

---

## 2. מבנה הקוד (מעודכן לפי `find src -type f`, 2026-07-24)

```
src/
├── App.tsx                    # routing
├── main.tsx
├── index.css                  # Tailwind + מחלקות עזר (.input, .btn-primary, .card)
├── types.ts                   # Profile, Fabric, FabricImage
├── vite-env.d.ts
├── components/
│   ├── Layout.tsx             # ניווט עליון
│   └── SignaturePad.tsx       # ציור חתימה על מסך (canvas)
├── lib/
│   ├── supabase.ts            # קליינט
│   ├── auth.tsx                # AuthProvider + useAuth
│   ├── statusHelpers.ts       # ⭐ סטטוסים, תוויות, חישוב התקדמות
│   ├── uid.ts                  # fallback ל-crypto.randomUUID בהקשרים לא-מאובטחים
│   └── uploadSignature.ts     # העלאת/שליפת תמונת חתימה מ-storage bucket "documents"
├── pages/
│   ├── Login.tsx
│   ├── Dashboard.tsx          # ⭐ עמוד בית — מדדים, הזמנות תקועות, בייצור עכשיו, פעילות אחרונה
│   ├── activity/
│   │   └── ActivityLog.tsx    # ⭐ יומן פעילות כללי + fetchActivity() + ActivityRowLine (משותפים)
│   ├── fabrics/
│   │   ├── FabricsList.tsx
│   │   └── FabricForm.tsx
│   ├── orders/
│   │   ├── types.ts           # ⭐ OrderForm, CurtainItem, ShadingItem + חישובים
│   │   ├── NewOrder.tsx       # ⭐ טופס הזמנה חדשה
│   │   ├── EditOrder.tsx      # עריכה
│   │   ├── OrderDetail.tsx    # מסך פרטי הזמנה — לשוניות "פרטים" / "יומן פעילות"
│   │   ├── OrderActivityTab.tsx  # לשונית יומן פעילות בתוך הזמנה (משתמש ב-ActivityLog.tsx)
│   │   ├── OrdersList.tsx     # ⭐ רשימה + טאבים (תומך ?tab= מה-URL) + מתג תצוגה
│   │   ├── OrderCardView.tsx  # תצוגת כרטיסיות
│   │   ├── OrderTableView.tsx # תצוגת רשימה
│   │   ├── OrderActions.tsx   # אייקוני פעולות מהירות
│   │   ├── PaymentModal.tsx   # הוספת תשלום
│   │   ├── ItemStatusDialog.tsx  # עדכון סטטוס פריטים
│   │   ├── SyncItemsDialog.tsx   # הזמנה → פריטים
│   │   ├── SyncOrderDialog.tsx   # פריטים → הזמנה
│   │   ├── CurtainCard.tsx    # כרטיס וילון בטופס
│   │   ├── ShadingCard.tsx    # כרטיס הצללה בטופס
│   │   ├── FormFields.tsx     # Field, SummaryBox, BlockHeader
│   │   ├── ShareButton.tsx    # שיתוף הזמנה
│   │   └── printOrder.ts      # ⭐ הדפסה + buildFormFromOrder (הקובץ הפעיל היחיד — PrintOrder.tsx הכפול נמחק)
│   └── items/
│       ├── ItemsList.tsx      # מסך פריטים (כל הפריטים מכל ההזמנות)
│       ├── BulkActionBar.tsx  # סרגל פעולות גורפות
│       └── printWork.ts       # הדפסת הוראות עבודה
```

```
supabase/
├── migrations/
│   ├── 0001_initial_schema.sql
│   └── 0002_ready_status_and_item_timestamps.sql
└── functions/
    ├── create-user/          # Edge Function — יצירת משתמש חדש עם service_role, ראו §6
    │   └── index.ts
    └── delete-user/          # Edge Function — מחיקת משתמש עם service_role, ראו §6
        └── index.ts
```
⚠️ אין `0003` בפרויקט — ראו סעיף 3 (פער בין הסכמה בפועל למיגרציות).

---

## 3. סכמת ה-DB

### 3.1 טבלאות עיקריות ושדות מפתח (מה שבשימוש פעיל בקוד)

| טבלה | תפקיד |
|---|---|
| `profiles` | משתמשים + תפקיד (admin/office/sales/viewer) |
| `orders` | הזמנות והצעות מחיר (ישות אחת, מובחנת בסטטוס) |
| `order_items` | פריטי הזמנה — וילונות והצללה |
| `payments` | תשלומים (הזמנה יכולה לקבל כמה) |
| `order_status_history` | ⭐ **יומן כל שינויי הסטטוס** — מי, מה, מתי |
| `customers` | לקוחות |
| `fabrics` + `fabric_images` | קטלוג בדים |
| `settings` | הגדרות (מונה הזמנות, טקסט משפטי, אמצעי תשלום, `stuck_order_days`) |

**שדות מפתח ב-`orders`:**
`order_number` (רץ מ-9000) · `is_quote` · `status` · `customer_id` · `agent_id` · `customer_name_snapshot` · `phone_snapshot` · `address_snapshot` · `items_total` · `installation_fee` · `discount` · `final_total` · `total_width_m` · `signature_name` · `signature_image_path` · `notes`

**שדות מפתח ב-`order_items`:**
`family` ('curtain'/'shading') · `subtype` (zebra/venetian/roman/roller) · `location` · `width_cm` · `heights_cm` (מערך!) · `sewing_type` · `hem_cm` (מכפלת) · `shtaif_cm` (שטייף) · `is_split` (חצוי) · `fabric_text` · `mount_type` · `mechanism_side` · `color_fabric_text` · `price` · `for_execution` · `item_status` · `notes` · `sort_order` · `created_at`

**שדות מפתח ב-`payments`:** `order_id` · `amount` · `method` · `paid_at` · `received_by` (FK יחיד ל-`profiles`) · `note`

**RLS:** מופעל על כל הטבלאות. admin/office = מלא (חוץ מ-`settings`, ראו 3.3). sales = רק ההזמנות שלו. viewer = קריאה.

---

### 3.2 הסכמה המלאה בפועל — תיעוד `docs/DB-SCHEMA.md` המקורי (מוזג לכאן)

> ⚠️ **הסכמה בפועל ב-Supabase רחבה יותר מ-`0001` + `0002`.**
> ספרינט הייצור (שבוטל) **קיים במלואו ב-DB** — הורץ ידנית ב-SQL Editor ומעולם לא נכתב כמיגרציה בקוד. אין קובץ `0003` בפרויקט. הקוד (`src/`) **לא** משתמש בשום דבר מספרינט הייצור — הוא נשאר יושב ב-DB בלי לקרוא לו.
>
> נשלף ידנית מ-`information_schema` / `pg_policies` ב-2026-07 על ידי המשתמש. תיעוד בלבד — לא DDL, לא להריץ.

**טבלאות (22, RLS מופעל על כולן):**

| טבלה | בשימוש בקוד? | הערה |
|---|---|---|
| `accessories` | ❌ לא | קטלוג חובק/מקל — טרם מומש ב-UI |
| `audit_log` | ❌ לא | לא נכתב אליו מהקוד |
| `communications` | ❌ לא | טבלת תקשורת — לא בשימוש; WhatsApp בפועל הוא `window.open` בלבד, בלי רישום |
| `consumption_rules` | ❌ לא | כלל צריכת בד — יש seed, אין קריאה מהקוד |
| `customers` | ✅ כן | `NewOrder.tsx` |
| `documents` | ❌ לא (טבלה) | יש שימוש ב-`supabase.storage.from('documents')` (bucket אחסון) ב-`uploadSignature.ts` — **לא** אותו דבר כמו טבלת ה-DB `documents`. הטבלה עצמה לא נכתבת אליה |
| `fabric_images` | ✅ כן | `FabricForm.tsx` |
| `fabric_rolls` | ❌ לא | מלאי גלילים — טרם בשימוש |
| `fabric_tags` | ❌ לא | — |
| `fabrics` | ✅ כן | `FabricsList.tsx`, `FabricForm.tsx` |
| `leads` | ❌ לא | CRM לידים — טרם מומש |
| `order_accessories` | ❌ לא | — |
| `order_items` | ✅ כן | ליבת המערכת |
| `order_notes` | ❌ לא | הערות מתוארכות — לא בשימוש (הערות כרגע ב-`orders.notes`) |
| `order_status_history` | ✅ כן | יומן הפעילות |
| `orders` | ✅ כן | ליבת המערכת |
| `payments` | ✅ כן | מאוחד ליומן הפעילות דרך `fetchActivity` |
| `profiles` | ✅ כן | `auth.tsx` + joins |
| `settings` | ✅ כן | מונה הזמנות, טקסט משפטי, אמצעי תשלום, `stuck_order_days` |
| `stock_movements` | ❌ לא | — |
| `suppliers` | ❌ לא | **קיימת במלואה ב-DB** (12 עמודות, RLS, FK) משריד ספרינט הייצור — הקוד לא קורא/כותב אליה כלל |
| `tags` | ❌ לא | — |

**9 טבלאות בשימוש, 13 לא בשימוש.**

**ENUMs:**

| enum | ערכים |
|---|---|
| `order_status` | `draft`, `quote`, `pending_payment`, `ready`, `in_production`, `ready_for_install`, `completed`, `cancelled` |
| `item_status` | `new`, `ordered_from_supplier`, `arrived`, `cut`, `sewing`, `ready`, `installed`, `cancelled` |
| `user_role` | `admin`, `office`, `sales`, `viewer` |
| `item_family` | `curtain`, `shading` |
| `shading_subtype` | `zebra`, `venetian`, `roman`, `roller` |
| `production_route` | `internal`, `external` |
| `supplier_type` | `workshop`, `supplier`, `installer` |
| `lead_status` | `new`, `contacted`, `meeting`, `converted`, `not_relevant` |
| `comm_channel` | `whatsapp`, `email`, `call` |
| `doc_type` | `quote`, `order`, `work_order`, `daily_report` |
| `movement_type` | `receipt`, `consumption`, `adjustment`, `waste`, `return` |

`production_route` ו-`supplier_type` **לא קיימים** ב-`0001`/`0002` — נוספו ידנית בספרינט הייצור. הקוד לא מכיר אותם (אין תווית ב-`statusHelpers.ts`).

`item_status` כולל `ordered_from_supplier` ו-`arrived` — שריד ספרינט הייצור; `ITEM_STATUS_LABELS` לא מגדיר להם תווית, כך שפריט בערך הזה יוצג כטקסט הגולמי במקום עברית.

**פערים מול המיגרציות:**

- **`orders`:** אין `intake_by` — הוסר (ראו סעיף 4). FK יחיד ל-`profiles`: `agent_id` → `orders_agent_id_fkey`.
- **`order_items` — עמודות נוספות משריד ספרינט הייצור:**

  | עמודה | טיפוס | הערה |
  |---|---|---|
  | `production_route` | `production_route` enum, **NOT NULL**, default `'internal'` | ממולא אוטומטית לכל שורה חדשה — **לא ריק** |
  | `supplier_id` | `uuid`, FK → `suppliers.id` | תמיד `NULL` בפועל — אין UI שממלא |
  | `date_cut` / `date_sent` / `date_target` / `date_returned` / `date_installed` | `timestamptz`, nullable | תמיד `NULL` — אין UI שממלא |

  הקוד לא קורא/כותב לאף אחת מהעמודות האלה.

- **`settings`:** מבנה key/value בלבד (`key text PK`, `value jsonb`, `updated_at`). מפתחות בפועל: `order_counter`, `business_info`, `legal_footer`, `payment_methods`, `sewing_types`, `default_hem_cm`, `default_shtaif_cm`, `stuck_order_days`.
- **`suppliers`:** טבלה מלאה (12 עמודות), RLS מופעל, FK-ים תקינים — **לא ריקה/לא נמחקה**. פשוט לא מקושרת לשום מקום בקוד.

**מסקנה תפעולית:** אם בעתיד משקמים את מודול הייצור — התשתית כבר קיימת ב-DB במלואה. אין צורך במיגרציה חדשה לשלב הראשוני, רק בקוד שמשתמש במה שכבר שם. מומלץ בסופו של דבר להוסיף מיגרציה רשמית שמתעדת את זה בגיט (כרגע קיים רק ב-DB עצמו).

---

### 3.3 RLS — נקודות תשומת לב

- **`settings`:** מדיניות `admin_settings` מתירה כתיבה ל-`admin` בלבד — **לא** ל-`office`, למרות ש-office מנהל תפעול יומיומי. שדה עריכת `stuck_order_days` בדשבורד מוגבל בקוד ל-`admin` בהתאם (ל-office מוצג כטקסט קבוע).

---

## 4. מודל הסטטוסים

**סטטוס הזמנה:**
```
quote (הצעת מחיר)
  → pending_payment (ממתין לגבייה)
  → ready (חדש לביצוע)
  → in_production (בייצור)
  → ready_for_install (מוכן)
  → completed (הושלם)
+ cancelled
+ draft (קיים ב-enum, ברירת מחדל DB — לא חלק מהזרימה המתועדת ב-UI)
```

**סטטוס פריט:**
```
new (חדש) → cut (נגזר) → sewing (במתפרה) → ready (מוכן) → installed (הותקן)
+ cancelled
```

**סנכרון דו-כיווני (מיושם):**
- קידום הזמנה → דיאלוג: "לעדכן גם את N הפריטים ל-X?"
- כל הפריטים באותו סטטוס → דיאלוג: "לקדם את ההזמנה ל-Y?"

**הזמנה חלקית:** לא סטטוס נפרד — מוצג כ**פס התקדמות** (`4/6 מוכנים`).

---

## 5. מלכודות טכניות מפורטות

### 5.1 מה קרה בספרינט הייצור (חשוב לדעת)

נבנה מודול ייצור (ספקים, מתפרות, מסלולי ייצור, צ'קליסט קליטה, מסך גזירה) — **ובוטל**. הסיבה: יותר מדי תחכום, סטייה מהמטרה העיקרית. הקוד הוסר, המערכת חזרה ל-V6. מה שנשאר ב-DB מתועד במלואו בסעיף 3.2.

**מה שהוסר מהקוד:** העמודות `intake_by`, `intake_at`, `date_target` מ-`orders` — הן יצרו **קשר כפול ל-`profiles`** ושברו את השאילתות.

### 5.2 תיקון קריטי — שאילתות profiles

כל שאילתה שמושכת `profiles` מ-`orders` **חייבת** לציין את הקשר במפורש:

```typescript
// ❌ שגוי — עמום, PGRST201
.select('*, profiles(full_name), order_items(*), payments(*)')

// ✅ נכון
.select('*, profiles!orders_agent_id_fkey(full_name), order_items(*), payments(*)')
```

זה מיושם היום ב-`OrdersList.tsx`, `OrderDetail.tsx`, `EditOrder.tsx`, `ItemsList.tsx`. (`order_status_history` ו-`payments` יש להם FK יחיד ל-`profiles` — לא צריך FK מפורש שם.)

### 5.3 הדפסת חתימה — מנגנון משותף

`getSignatureDataUrl(path)` ב-`src/lib/uploadSignature.ts` ממיר `signature_url` (path בסטורג') ל-dataURL (signed URL → fetch → FileReader), ומשמש גם את `OrderDetail.tsx` וגם את `OrderActions.tsx` (`doPrint`, לפני קריאה ל-`printOrder`, רק בהדפסה עם מחירים). כך הדפסה מציגה את החתימה המצוירת גם מתוך מסך ההזמנה וגם מרשימת ההזמנות.

### 5.4 תזכורות תפעוליות

- **מיגרציה ב-Supabase:** SQL Editor → New query → הדבק → Run
- **אם enum נוסף ולא עובד:** הרץ את הקובץ פעמיים (Postgres דורש commit בין הוספה לשימוש)
- **רענון schema cache:** `NOTIFY pgrst, 'reload schema';`
- **Deploy:** `git add . && git commit -m "..." && git push` → Cloudflare בונה אוטומטית
- **באג נפוץ:** popup blocker בהדפסה — הפתרון הוא Blob URL, לא `window.open('')`
- **קבצים בעלי שמות דומים** (למשל `printOrder.ts` מול `PrintOrder.tsx` — הכפול הזה כבר נמחק) — Windows לא מבחין, שרת הבנייה של Cloudflare (לינוקס) כן. תמיד לבדוק לפני יצירת קובץ חדש.

### 6. Edge Functions

יש חיבור MCP פעיל לפרויקט Supabase (`kairi-os`) — פריסת Edge Function נעשית ישירות דרך ה-MCP (`deploy_edge_function`), **בלי** צורך ב-`supabase login`/`link` מקומי.

**`create-user`** (נוצר 2026-07-24, שלב 12ב): יוצר משתמש חדש ב-`auth.users` עם סיסמה זמנית שהאדמין קובע. מוודא JWT + `role === 'admin'` של הקורא לפני שימוש ב-`service_role` (הזמין אוטומטית בתוך הפונקציה כ-`SUPABASE_SERVICE_ROLE_KEY`, לא נחשף לקליינט). לא נוגע בטבלת `profiles` ליצירה הראשונית — הטריגר `on_auth_user_created` הקיים כבר עושה זאת; הפונקציה רק משלימה `phone`/`role`. נקרא מ-`UsersList.tsx` דרך `supabase.functions.invoke('create-user', ...)`.

**`delete-user`** (נוצר 2026-07-24, שלב 12ב): מוחק משתמש קיים. אותו דפוס אבטחה כמו `create-user` (JWT + admin בלבד). ⚠️ **מלכודת עיצוב מכוונת:** שדות FK מ-`orders.agent_id`, `payments.received_by`, `order_status_history.changed_by` וכו' ל-`profiles(id)` הם ללא `on delete cascade`/`set null` — כך שמחיקת משתמש שכבר ביצע פעולה כלשהי (יצר הזמנה/קיבל תשלום/שינה סטטוס) **נכשלת בכוונה** בשגיאת foreign key ב-DB, כדי לא לאבד את יומן "מי עשה מה" (המניע המרכזי של הפרויקט). הפונקציה תופסת את השגיאה ומחזירה הודעה בעברית שמפנה להשתמש ב-`is_active=false` במקום. מחיקה אמיתית עובדת רק על משתמש שמעולם לא ביצע פעולה. ב-UI (`UsersList.tsx`) יש אישור בכתב — הקלדת/הדבקת המילה "מחיקה" — לפני קריאה לפונקציה.

עדכון קוד לפונקציה קיימת דורש `deploy_edge_function` מחדש (יוצר גרסה חדשה) — אין hot-reload מקומי כמו ב-Cloudflare Pages.
