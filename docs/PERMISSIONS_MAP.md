# מפת הרשאות — Kairi System (READ-ONLY audit)

תאריך: 2026-08-02
מקורות: `pg_policies` בסכמת `public` (פרויקט Supabase `ipcnyqkcvbvzmasmzaur`) + סריקת קוד UI (`src/App.tsx`, `src/components/Layout.tsx`, `src/pages/**`).

מנגנון הבסיס: פונקציית `current_role()` מוגדרת כ-`select role from public.profiles where id = auth.uid()`. כל המדיניות (RLS) מבוססת על ערך זה. תפקיד `viewer` **אינו מוזכר באף policy בשם מפורש** — הוא מקבל גישה רק דרך policies גנריות שתנאיין הוא `auth.uid() IS NOT NULL` (כלומר "כל משתמש מחובר", לא משנה איזה role).

חשוב: אין אף route/nav-item בקוד ה-UI שמבחין בין `sales`, `office`, `viewer` — הפרדת admin היא היחידה שקיימת בפועל (`/users` וכפתור הניווט "משתמשים"). כל שאר ההבחנה בין תפקידים (במיוחד sales מול office, ו-viewer מול כולם) קיימת **רק ב-RLS**, לא ב-UI.

---

## 1. מטריצת הרשאות ראשית (DB, לפי RLS בפועל)

| טבלה | admin | office | sales | viewer |
|---|---|---|---|---|
| **orders** | CRUD (הכל) | CRUD (הכל) | CRUD **רק שלו** (`agent_id = auth.uid()`; SELECT/UPDATE/INSERT — אין policy מפורש ל-DELETE ל-sales) | **אין גישה כלל** (אין policy תואם) |
| **order_items** | CRUD (הכל) | CRUD (הכל) | CRUD **רק אם ההזמנה שלו** (exists orders o where o.agent_id=auth.uid()) | **אין גישה כלל** |
| **order_accessories** | CRUD (הכל) | CRUD (הכל) | CRUD **רק אם ההזמנה שלו** | **אין גישה כלל** |
| **payments** | CRUD (הכל) | CRUD (הכל) | C (INSERT, ללא תנאי בעלות מעבר ל-role=sales) + R (SELECT, ללא סינון שורה — sales יכול לקרוא **את כל** תשלומי כל ההזמנות, לא רק שלו) | **אין גישה כלל** |
| **customers** | CRUD (הכל) | CRUD (הכל) | C (INSERT) + R (SELECT) — **ללא סינון שורה** (sales רואה את כל הלקוחות, לא רק שלו) | **אין גישה כלל** |
| **order_status_history** | R+C (כל משתמש מחובר) | R+C | R+C | **R+C** (auth.uid() IS NOT NULL בלבד — גם viewer יכול לקרוא **ולהכניס** רשומות היסטוריה) |
| **profiles** | CRUD (הכל, כולל שינוי roles) | R בלבד (auth.uid() IS NOT NULL) | R בלבד | R בלבד |
| **fabrics** | CRUD (הכל) | CRUD (הכל) | R בלבד | R בלבד |
| **fabric_images** | CRUD (הכל) | CRUD (הכל) | R בלבד | R בלבד |
| **settings** | CRUD (הכל) | R בלבד | R בלבד | R בלבד |
| **leads** | CRUD (הכל) | CRUD (הכל) | R+U **רק שלו** (`assigned_to = auth.uid()`) — **אין INSERT ל-sales** | **אין גישה כלל** |
| **accessories** | CRUD (הכל) | R בלבד | R בלבד | R בלבד |
| **consumption_rules** | CRUD (הכל) | R בלבד | R בלבד | R בלבד |
| **fabric_rolls** | CRUD (הכל, admin/office בלבד) | CRUD | **אין גישה כלל** (אין policy read כללי!) | **אין גישה כלל** |
| **fabric_tags / tags** | R (כל המחוברים) — אין policy כתיבה כלל בשום role (כנראה מנוהל ע"י service role בלבד) |
| **stock_movements** | R (הכל) + C (admin/office/sales) | R+C | R+C | R בלבד (אין INSERT ל-viewer) |
| **suppliers** | CRUD (admin/office) | CRUD | R בלבד | R בלבד |
| **documents** | R+C (כל המחוברים) | R+C | R+C | **R+C** (גם viewer יכול להעלות/לקרוא מסמכים) |
| **communications** | R+C (כל המחוברים) | R+C | R+C | **R+C** |
| **order_notes** | R+C (כל המחוברים) | R+C | R+C | **R+C** |
| **audit_log** | R (admin בלבד) + C (כל מחובר יכול להכניס) | C בלבד | C בלבד | C בלבד |

הערות מפתח:
- **sales** על `payments` ו-`customers`: יש הרשאת SELECT ללא תנאי בעלות ברמת השורה (`current_role() = 'sales'`) — משמע כל sales agent יכול לקרוא **את כל** התשלומים וכל הלקוחות במערכת, לא רק את שלו. זה בניגוד להתנהגות orders/order_items שכן מסוננת לפי `agent_id`.
- טבלאות "יומן/תמיכה" (`order_status_history`, `order_notes`, `documents`, `communications`, `audit_log` (רק insert)) פתוחות ל-SELECT/INSERT לכל משתמש מחובר, כולל **viewer**, ללא כל תלות בבעלות על ההזמנה המקושרת — למרות ש-viewer לא יכול בכלל לקרוא את טבלת `orders` עצמה.
- `fabric_rolls` — אין policy read כלל עבור sales/viewer (לא "read_fabrics"-style גנרי), כך שגם קריאה חסומה להם, לא רק כתיבה.

---

## 2. פערי UI מול RLS

### 2א. חסימה ויזואלית בלבד (UI מסתיר, RLS מתיר) — חשיפת אבטחה אפשרית דרך קריאה ישירה ל-API/SDK

| מיקום UI | מה ה-UI מסתיר/לא בודק | מה RLS בפועל מתיר | סיכון |
|---|---|---|---|
| כל ניווט/routing (`App.tsx`, `Layout.tsx`) | אין שום בדיקת role עבור `/orders`, `/orders/:id`, `/orders/:id/edit`, `/items`, `/fabrics`, `/activity` — התפריט זהה ל-admin/office/sales/viewer (רק "/users" מוגן) | RLS בפועל מגביל sales ל-agent_id שלו, ו-viewer לכלום ברוב הטבלאות. ה-UI לא מיישר קו אך זה לרוב לא חשיפה — RLS חוסם בפועל ב-DB. **לא חשיפה מבחינת נתונים**, אך חוויית משתמש לא עקבית (viewer רואה תפריטים למסכים שיחזירו ריק/שגיאה). |
| `OrderDetail.tsx` — כפתורי "התקדם בסטטוס" (`advanceStatus`), שליחת PDF (`syncingPdf`, `sharePdfFile`, `sendPdfViaMake`), חתימה | אין שום `profile?.role` check — מוצג זהה לכל role, כולל office/sales/viewer | `order_status_history` פתוח ל-INSERT לכל משתמש מחובר (גם viewer) ללא קשר לבעלות על ההזמנה. אם viewer יצליח לפתוח מסך הזמנה כלשהי (בעקיפין, כי SELECT על `orders` עצמו חסום לו) — לא רלוונטי בפועל כי viewer לא יקבל את שורת ה-order מלכתחילה. **אך אם sales-agent פותח (בעקיפין URL ישיר) הזמנה של agent אחר** — ה-UI לא בודק בעלות בצד קליינט; RLS על `orders`/`order_items` יחסום SELECT (כי sales מוגבל ל-agent_id שלו) כך שבפועל הדף יקבל שגיאה/ריק. אך **כתיבה ל-`order_status_history`/`order_notes`/`documents`/`communications` בעקיפין (קריאה ישירה ל-Supabase REST/SDK, לא דרך ה-UI)** אפשרית לכל role מחובר לכל order_id (כולל של אחרים) כי אין תנאי בעלות בטבלאות האלה — **זו חשיפה אמיתית**: כל sales/viewer יכול, בקריאת API ישירה, להוסיף שורת היסטוריית סטטוס/הערה/מסמך גם על הזמנה שאינה שלו. |
| `payments` — אין מסך ב-UI שחושף רשימת "כל התשלומים" ל-sales, אבל ה-policy `sales_payments_read` מתיר SELECT לכל שורה בטבלה ל-role sales, לא רק לתשלומי ההזמנות שלו | ה-UI (PaymentModal, OrderDetail) תמיד שולף תשלומים מקושרים ל-order_id ספציפי דרך ה-join, כך שבפועל ה-UI "מגן" בעקיפין ע"י כך שהוא תמיד מסנן לפי order_id שנבחר במסך. אך **קריאה ישירה ל-`payments` (ללא סינון order_id)** תחזיר ל-sales agent את **כל** התשלומים של **כל** ההזמנות במערכת — כולל סכומים, אמצעי תשלום וכו' של הזמנות שאינן שלו. | חשיפת מידע פיננסי חוצה-סוכן. |
| `customers` — דומה: `sales_customers_read` נותן SELECT גורף ל-role sales על כל שורות הלקוחות, ללא סינון | ה-UI לא חושף כיום מסך "כל הלקוחות" נפרד ל-sales (לא נמצא route מוקדש), אך קריאת API ישירה תחזיר את כל בסיס הלקוחות | חשיפת PII (שם/טלפון/כתובת לקוחות) חוצה-סוכן. |

### 2ב. חסימה עודפת (RLS חוסם, UI עדיין מנסה) — שגיאה/חוויה שבורה

| מיקום UI | מה ה-UI מאפשר לנסות | מה RLS חוסם | תוצאה |
|---|---|---|---|
| `NewOrder.tsx` — טופס יצירת הזמנה חדשה, נגיש לכל role דרך route `/orders/new` ללא בדיקת role בכניסה | הטופס תמיד שולח `agent_id: profile!.id` בעת יצירה, ולא בודק role לפני הצגת הטופס | ל-**viewer** אין שום policy INSERT על `orders` → כל ניסיון הגשה יכשל עם שגיאת RLS (403/permission denied) ללא הודעה ברורה למשתמש | viewer רואה טופס מלא, ממלא אותו, ומקבל שגיאה טכנית בשמירה — אין הודעה מוקדמת "אין לך הרשאה". |
| `OrdersList.tsx` — route `/orders` נגיש לכולם דרך הניווט (`Layout.tsx` לא מסנן) | מציג את מסך רשימת ההזמנות + פילטר סוכן (`agentFilter`) לכל role | ל-**viewer** SELECT על `orders` חסום לגמרי — הרשימה תמיד תחזור ריקה, ללא שום סימון "אין הרשאה" | viewer יראה מסך ריק לצמיתות ויחשוב שאין הזמנות במערכת, במקום שהמסך יוסתר. |
| `FabricForm.tsx` — `canEdit = admin/office` בלבד חוסם שמירה ב-UI (ככל הנראה מסתיר/מנטרל כפתור שמירה) | sales/viewer בכל מקרה לא יכולים לערוך UI-side | תואם ל-RLS (`office_fabrics` — admin/office בלבד לכתיבה) — **אין פער, זה מקרה תקין** |  |
| `Dashboard.tsx` — `canEditThreshold = admin` בלבד | תואם ל-`admin_settings` (admin בלבד לכתיבה) — **אין פער** |  |  |
| `leads` — אין מסך ב-UI שנמצא בסריקה זו לניהול leads, אך אם קיים מסך: sales יכול R/U רק leads המשויכים אליו (`assigned_to`), **אך אין לו INSERT policy כלל** | אם קיים טופס "ליד חדש" הנגיש ל-sales — הוא ייכשל תמיד ב-RLS (insert חסום לכל role חוץ מ-admin/office) | לא אותרה תבנית UI ל-leads בסריקה הממוקדת; יש לבדוק בנפרד אם יש מסך ייעודי. |

---

## 3. סיכום לכל תפקיד

**admin** — גישה מלאה (CRUD) לכל טבלה ללא יוצא מן הכלל, כולל ניהול משתמשים/roles (`/users`), הגדרות מערכת (`settings`), ומחיקת/עריכת הזמנות של כל סוכן. שורות בולטות: (1) admin הוא היחיד עם כתיבה ל-`profiles`/`settings`/`audit_log` read — ריכוזיות הרשאות תואמת כוונה; (2) יש לוודא ש-`/users` הוא אכן ה-gate היחיד הדרוש ברמת admin, וש-service-role לא נחשף בטעות ב-client; (3) admin אינו מוגבל בשום מקום ל-agent_id — תקין להנחת admin-full-access.

**office** — כמעט זהה ל-admin בהיקף (CRUD מלא) על orders/order_items/order_accessories/payments/customers/fabrics/fabric_images/leads/fabric_rolls/suppliers/stock_movements, אך ללא גישה ל-`profiles`/`settings`/`audit_log` בכתיבה (R בלבד). שורות בולטות: (1) office מקבל בפועל הרשאות תפעוליות זהות ל-admin על נתוני ליבה — כדאי לשאול אם זו הכוונה המקורית או שיש לצמצם (למשל: office לא אמור למחוק הזמנות?); (2) אין שום UI-gating ייעודי ל-office (הוא מקבל בדיוק אותו UI כמו sales/viewer, מלבד "/users" שחסום גם לו) — ההבחנה כולה ב-RLS; (3) office צריך להיבדק האם אמור לראות/לערוך `leads` ו-`fabric_rolls` באופן גורף כפי שה-policy מאפשרת כרגע.

**sales** — מוגבל ברוב הטבלאות ל"מה ששלו" (`agent_id`/`assigned_to` = `auth.uid()`), אבל עם שני חריגים בולטים: SELECT גורף (ללא סינון שורה) על **payments** ו-**customers** — כלומר sales agent יכול לראות תשלומי/לקוחות של סוכנים אחרים דרך קריאת API ישירה, גם שה-UI לא חושף זאת כרגע. שורות בולטות: (1) `sales_payments_read`/`sales_customers_read` ראויים להצטמצם לתנאי בעלות דרך ה-order/agent, בדומה ל-`order_items`/`order_accessories`; (2) אין INSERT policy ל-sales על `leads`, כך שאם יש טופס יצירת ליד יתכן שהוא שבור; (3) UI לא מבחין בין sales ל-office/viewer בניווט/routing כלל — כל ההגנה בפועל תלויה ב-RLS, מה שאומר שכל שגיאת policy עתידית תיצור חוויית משתמש שבורה (מסכים ריקים/שגיאות) ולא הודעת "אין הרשאה" ברורה.

**viewer** — לא מוזכר באף policy ספציפי; מקבל גישה **רק** לטבלאות עם policy גנרי `auth.uid() IS NOT NULL` (profiles, fabrics, fabric_images, accessories, consumption_rules, tags/fabric_tags, stock_movements-read, suppliers-read, settings-read, **וכן documents/communications/order_notes/order_status_history/audit_log-insert**). **אין לו שום גישה** ל-orders, order_items, order_accessories, payments, customers, leads, fabric_rolls. שורות בולטות: (1) viewer יכול, דרך API ישירה, **לכתוב** ל-`order_status_history`/`order_notes`/`documents`/`communications`/`audit_log` על כל order_id שהוא בוחר — למרות שאין לו קריאה על ההזמנה עצמה, זו אנומליה של הרשאות-כתיבה בלי הרשאת-קריאה על הישות ההורה; (2) ה-UI כרגע לא מסתיר מ-viewer אף מסך (הוא רואה בדיוק את אותו תפריט וניתובים כמו sales/office) — מה שיוצר חוויית "מסכים ריקים"/שגיאות RLS בלתי-מוסברות בכל מסך שקשור להזמנות; (3) כדאי להחליט אם viewer אמור להיות read-only אמיתי (ואז לסגור את הכתיבה ל-audit/notes/history/documents/communications) או להרחיב לו קריאה תואמת (SELECT על orders בהיקף מסונן) בהתאם לכוונת התפקיד.
