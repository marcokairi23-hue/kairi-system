# מיפוי ליקויים — מערכת KAiLi (קאירי וילונות)

תאריך בדיקה: 2026-08-02
שיטה: קריאת קוד (Read/Grep) + הצלבה מול Supabase (project ref: ipcnyqkcvbvzmasmzaur) בשאילתות SELECT בלבד. לא בוצע שום שינוי בקוד או בנתונים.

---

### 1. יצירת לקוח כפול בכל הזמנה חדשה — אין חיפוש/שימוש חוזר בלקוח קיים
- **התנהגות בפועל:** בכל שמירה של הזמנה חדשה נוצרת שורת `customers` חדשה, ללא בדיקה אם קיים כבר לקוח עם אותו טלפון.
- **מיקום:** `src/pages/orders/NewOrder.tsx` שורות 70-76 — `supabase.from('customers').insert({...})` ללא חיפוש מקדים.
- **התנהגות מצופה:** חיפוש לקוח קיים לפי טלפון (או קישור ידני) לפני יצירת רשומה חדשה, כדי לשמור על היסטוריית לקוח מאוחדת.
- **חומרה:** משבש
- **ראיה:** שאילתת `SELECT phone, count(*) FROM customers GROUP BY phone HAVING count(*)>1` מחזירה, בין היתר, טלפון `0507444689` עם **23** רשומות `customers` שונות (שמות שונים: "רנאל", "בדיקה 2", "חבצלת ואקנין" ועוד) עבור מה שכנראה אותו איש קשר/מכשיר בדיקה.

### 2. אביזרים (accessories) בטופס ההזמנה אף פעם לא נשמרים ב-DB
- **התנהגות בפועל:** הטופס אוסף אביזרים (`form.accessories`) ומשתמש בהם לחישוב `items_total` ולהדפסה בזמן היצירה בלבד — אך אף פעם לא נכתבים לטבלת `order_accessories`.
- **מיקום:** `src/pages/orders/NewOrder.tsx` (אין שום `insert` לטבלת `order_accessories`), `src/pages/orders/EditOrder.tsx` (אותו דבר), `src/pages/orders/printOrder.ts` שורה 281 — `buildFormFromOrder` מחזיר תמיד `accessories: []`.
- **התנהגות מצופה:** אביזרים צריכים להישמר בטבלת `order_accessories` (שקיימת בדיוק למטרה הזו, כולל FK ל-orders/accessories) ולהיטען מחדש בעריכה/הדפסה חוזרת.
- **חומרה:** משבש
- **ראיה:** `grep -r "order_accessories" src` לא מחזיר אף שימוש בקוד האפליקציה; טבלת `order_accessories` ב-DB עם 0 שורות למרות 37 הזמנות קיימות.

### 3. שדה heights_cm — קלט חופשי ללא ולידציה, גורם למערכי גבהים ריקים ב-DB
- **התנהגות בפועל:** שדה "גובה/ים" הוא טקסט חופשי (`"306 או 306,307,306"`), ובשמירה מבוצע `item.heights_cm.split(',').map(h=>parseFloat(h.trim())).filter(Boolean)` — כל ערך לא-מספרי (NaN) **וגם כל ערך 0** מסונן החוצה בשקט (כי `Boolean(0) === false`), ללא כל הודעת שגיאה למשתמש.
- **מיקום:** `src/pages/orders/CurtainCard.tsx` שורות 46-50 (קלט), `src/pages/orders/NewOrder.tsx` שורה 131 ו-`EditOrder.tsx` שורה 135 (שמירה).
- **התנהגות מצופה:** ולידציה על הקלט (לפחות אזהרה/חסימת שמירה) כשאין גבהים תקינים, ו/או אי-סינון ערכי 0 לגיטימיים.
- **חומרה:** משבש
- **ראיה:** ב-DB יש 6 שורות ב-`order_items` עם `heights_cm = '{}'` (מערך ריק) ולעיתים גם `width_cm = 0`, למשל item `194bb6b9...` בהזמנה `7236fc82...` (מספר 9022, שכבר עברה לסטטוס "הושלם").

### 4. תיבת הסימון "הצעת מחיר" ב-NewOrder מנותקת מלוגיקת השמירה בפועל
- **התנהגות בפועל:** קיימת תיבת סימון `form.is_quote` ("הזמנה זו היא הצעת מחיר בלבד") שהמשתמש יכול לסמן, אך היא **לא נקראת בכלל** בפונקציית השמירה. הערך שנשמר בפועל (`is_quote`, `status`) נקבע אך ורק לפי הכפתור שנבחר בדיאלוג הסיום ("בקשה לגבייה" מול "הצעת מחיר").
- **מיקום:** `src/pages/orders/NewOrder.tsx` שורה 80 (`is_quote: isQuote` — הפרמטר מהדיאלוג) מול שורות 336-337 (ה-checkbox שמעדכן `form.is_quote` שלעולם לא נקרא ב-`save`).
- **התנהגות מצופה:** אם יש תיבת סימון לכך, היא אמורה לקבוע את מסלול השמירה, או לחלופין להוסר מהטופס כדי לא להטעות את המשתמש.
- **חומרה:** משבש
- **ראיה:** `save = async (isQuote: boolean) => { ... is_quote: isQuote ...}` — אין שום הפניה ל-`form.is_quote` בכל הפונקציה.

### 5. עריכת הזמנה (EditOrder) מוחקת ומחדשת את כל order_items — מתנגשת עם היסטוריית סטטוסים ברמת פריט (FK ללא CASCADE), והשגיאה מתעלמת
- **התנהגות בפועל:** בשמירת עריכה, הקוד מריץ `DELETE FROM order_items WHERE order_id = id` ואז מכניס פריטים חדשים (עם ID חדש) — **בלי לבדוק את שדה ה-error שחוזר מהקריאה**. מגבלת המפתח הזר `order_status_history_order_item_id_fkey` (וגם `stock_movements_item_fk`) מוגדרת עם `ON DELETE NO ACTION` (לא CASCADE, לא SET NULL) — כלומר אם קיימת ולו שורת היסטוריה אחת שמפנה ל-`order_item_id` של פריט בהזמנה, ה-DELETE אמור להיכשל ב-constraint violation. מכיוון שהשגיאה לא נבדקת, הקוד ממשיך להכניס את הפריטים ה"חדשים" בכל מקרה — התוצאה: פריטים כפולים בשקט (הישנים נשארים, קפואים במידע הישן; החדשים מתווספים לצידם), ומספרי ה-order_number/histories מתייחסים כעת לפריטים לא נכונים.
- **מיקום:** `src/pages/orders/EditOrder.tsx` שורה 126: `await supabase.from('order_items').delete().eq('order_id', id)` (ללא `const { error } = ...`).
- **התנהגות מצופה:** לבדוק את שגיאת ה-delete ולעצור/להתריע, או לבצע UPDATE לפריטים קיימים במקום DELETE+INSERT, כדי לשמר את זהות השורות ואת שרשרת ההיסטוריה.
- **חומרה:** חוסם
- **ראיה:** `pg_constraint.confdeltype = 'a'` (NO ACTION) עבור `order_status_history_order_item_id_fkey` ו-`stock_movements_item_fk`, שתיהן מצביעות ל-`order_items.id`; יש 72 שורות ב-`order_status_history` עם `order_item_id` לא ריק (לדוגמה הזמנה 9007 עם 6 רשומות היסטוריה ברמת פריט) — עריכה ושמירה של הזמנה כזו תפעיל את התרחיש הזה.

### 6. חוסר סנכרון בין סטטוס הזמנה לסטטוס הפריטים בפועל (נתונים קיימים)
- **התנהגות בפועל:** נמצאו הזמנות שבהן סטטוס ההזמנה "קפץ קדימה" יחסית לסטטוס הפריטים בפועל, בניגוד למיפוי `ORDER_TO_ITEM_STATUS`/`ITEM_TO_ORDER_STATUS` שב-`statusHelpers.ts`.
- **מיקום:** טבלאות `orders`/`order_items`, לוגיקה ב-`src/lib/statusHelpers.ts` שורות 61-74.
- **התנהגות מצופה:** לפי המיפוי — "מוכן" (ready_for_install) אמור להתאים לפריטים בסטטוס `ready`; "הושלם" (completed) אמור להתאים לפריטים `installed`; "בייצור" (in_production) אמור להתאים לפריטים `sewing`.
- **חומרה:** משבש
- **ראיה (שאילתת SELECT):**
  - הזמנה 9022 — `status='completed'`, אך כל הפריטים הרלוונטיים עדיין `item_status='new'`.
  - הזמנה 9020 ו-9034 — `status='ready_for_install'`, אך הפריטים ב-`cut`/`new` (לא `ready`).
  - הזמנה 9008 — `status='in_production'`, אך הפריט ב-`cut` (לא `sewing`).
  - שלוש הזמנות (9017, 9015, 9021) הגיעו לסטטוס `pending_payment`/`completed` כאשר יש להן **0 פריטים** לביצוע (`relevant_items=0`).

### 7. מסך "פרטי הזמנה" (OrderDetail) מקדם סטטוס בלי סנכרון דו-כיווני, ובלי גישה לעדכון סטטוס פריטים
- **התנהגות בפועל:** ב-`OrderDetail.tsx` קיימת פונקציה עצמאית `advanceStatus` שמעדכנת רק את `orders.status` ורושמת היסטוריה — **אינה משתמשת** ב-`ORDER_TO_ITEM_STATUS`/`SyncItemsDialog`/`SyncOrderDialog` כפי שקורה ב-`OrdersList.tsx` (`handleAdvance`/`advanceOrder`/`afterItemsUpdate`). כמו כן, ב-`OrderDetail.tsx` אין כלל כפתור/דיאלוג "עדכון סטטוס פריטים" (`ItemStatusDialog`) — האפשרות היחידה לשנות סטטוס פריט בודד היא דרך מסך רשימת ההזמנות או מסך הפריטים.
- **מיקום:** `src/pages/orders/OrderDetail.tsx` שורות 131-144 (מול המימוש המלא ב-`src/pages/orders/OrdersList.tsx` שורות 115-225); `grep` לשימוש ב-`ItemStatusDialog` מראה רק `OrdersList.tsx`.
- **התנהגות מצופה:** קידום סטטוס מכל מסך (כולל מסך הזמנה בודדת) אמור להציע את אותו סנכרון דו-כיווני עם הפריטים, ולכלול גישה לעדכון פריטים.
- **חומרה:** משבש
- **ראיה:** `src/pages/orders/OrderDetail.tsx:131-144` מול `src/pages/orders/OrdersList.tsx:116-225`.

### 8. מודל הסטטוסים בצד הלקוח חסר שני ערכי enum שקיימים ב-DB (ordered_from_supplier, arrived)
- **התנהגות בפועל:** ה-enum `item_status` ב-DB כולל 8 ערכים: `new, ordered_from_supplier, arrived, cut, sewing, ready, installed, cancelled`. קוד ה-Frontend (`ITEM_STATUSES`, `ITEM_STATUS_LABELS`, `ITEM_STATUS_ORDER`, `calcProgress`, `suggestOrderStatus`) מכיר רק 6 מהם — חסרים `ordered_from_supplier` ו-`arrived`.
- **מיקום:** `src/pages/orders/types.ts` שורות 5, 83-90; `src/lib/statusHelpers.ts` שורות 39-57.
- **התנהגות מצופה:** אם הערכים עדיין רלוונטיים עסקית — יש להוסיפם לממשק (תוויות, צבעים, לוגיקת "מוכן"). אם לא — יש להסירם מה-enum ב-DB כדי למנוע ערכים שהאפליקציה לא יודעת להציג.
- **חומרה:** שיפור (לא נמצא כרגע נתון עם הסטטוסים החסרים, אך אם יוזנו — הם יוצגו כטקסט גולמי לא מתורגם וישברו את `calcProgress`/`suggestOrderStatus`).
- **ראיה:** השוואת `enums` של `order_items.item_status` מ-`list_tables` מול `ITEM_STATUSES` ב-`types.ts`.

### 9. שאילתות profiles מ-ActivityLog ללא ציון FK מפורש
- **התנהגות בפועל:** ב-`ActivityLog.tsx` שתי שאילתות משתמשות ב-`profiles(full_name)` (implicit join) במקום `profiles!<fk_name>(full_name)`, בניגוד לשאר הקוד (`OrdersList`, `OrderDetail`, `EditOrder`, `ItemsList` כולם משתמשים ב-`profiles!orders_agent_id_fkey`).
- **מיקום:** `src/pages/activity/ActivityLog.tsx` שורה 76 (`order_status_history`) ושורה 90 (`payments`).
- **התנהגות מצופה:** שימוש עקבי בציון FK מפורש בכל שאילתה שמצטרפת ל-profiles, כפי שנעשה בשאר הקוד.
- **חומרה:** שיפור — כרגע אין שבירה בפועל כי לכל אחת מהטבלאות (`order_status_history.changed_by`, `payments.received_by`) יש רק FK יחיד לעבר `profiles`, כך שאין דו-משמעות ב-PostgREST. עם זאת, זהו חוסר עקביות שעלול לשבור אם תתווסף עמודה נוספת שמפנה ל-profiles.
- **ראיה:** `grep -n "profiles"` על כל src מראה 8 מקומות עם `profiles!orders_agent_id_fkey` לעומת 2 מקומות עם `profiles(` גרידא.

### 10. עמודת signature_image_path מתה — לא נכתבת ולא נקראת בקוד
- **התנהגות בפועל:** בטבלת `orders` קיימת עמודה `signature_image_path`, אך כל הקוד (`NewOrder`, `EditOrder`, `OrderDetail`, `OrderActions`, `printOrder`) משתמש בפועל ב-`signature_url` ו-`agent_signature_url` בלבד.
- **מיקום:** סכמת `public.orders`; `grep -rn "signature_image_path" src` — ללא תוצאות.
- **התנהגות מצופה:** עמודה שאינה בשימוש צריכה להיות מוסרת מהסכמה, או שהקוד אמור להשתמש בה אם היא מיועדת למשהו אחר מ-`signature_url`.
- **חומרה:** שיפור
- **ראיה:** `SELECT count(signature_image_path) FROM orders GROUP BY status` — 0 בכל קבוצת סטטוס (37/37 שורות).

### 11. עמודות שנותרו מספרינט שבוטל — production_route, supplier_id, date_* (order_items) — לא נקראות בקוד (נבדק, תקין)
- **התנהגות בפועל:** בדיקה מפורשת: `grep -rn "production_route|supplier_id|date_cut|date_sent|date_target|date_returned|date_installed" src` לא מחזירה תוצאות. כלומר אין קריאה/כתיבה בטעות לעמודות הללו.
- **מיקום:** `public.order_items` (עמודות `production_route`, `supplier_id`, `date_cut`, `date_sent`, `date_target`, `date_returned`, `date_installed`).
- **התנהגות מצופה:** ניקוי סכמה (הסרת העמודות אם אינן בשימוש עתידי) — לא נדרש תיקון קוד.
- **חומרה:** שיפור (אין באג בפועל — תיעוד בלבד לניקוי עתידי).
- **ראיה:** תוצאת grep ריקה מעל.

### 12. ShareButton.tsx — קומפוננטה מתה שמפנה לנתיב ציבורי שלא קיים
- **התנהגות בפועל:** `ShareButton.tsx` בונה קישור `${window.location.origin}/print/${orderNumber}` לשליחה ב-WhatsApp/העתקה, אך (א) הקומפוננטה אינה מיובאת/מיוצגת בשום מקום באפליקציה, ו-(ב) גם אם הייתה בשימוש — אין שום route בשם `/print/:orderNumber` ב-`App.tsx`.
- **מיקום:** `src/pages/orders/ShareButton.tsx` (כל הקובץ, לא בשימוש); `src/App.tsx` שורות 31-44 (רשימת ה-routes המלאה, אין `/print`).
- **התנהגות מצופה:** להסיר את הקומפוננטה המתה, או לממש route ציבורי תואם אם הכוונה הייתה לפיצ'ר שיתוף קישור צפייה.
- **חומרה:** שיפור
- **ראיה:** `grep -rn "ShareButton" src` מראה רק את קובץ ההגדרה עצמו; `grep -n "path=" src/App.tsx` לא מכיל `/print`.

### 13. RLS: sales יכול לקרוא את כל רשימת הלקוחות (customers) ללא הגבלה לפי סוכן
- **התנהגות בפועל:** המדיניות `sales_customers_read` על `public.customers` מתירה SELECT לכל משתמש עם `role='sales'` ללא כל תנאי בעלות (בניגוד ל-`sales_orders`/`sales_items`/`sales_order_accessories` שכולן דורשות `orders.agent_id = auth.uid()`).
- **מיקום:** `pg_policies` על `public.customers`, policy `sales_customers_read` (`cmd='SELECT'`, `qual = current_role() = 'sales'`).
- **התנהגות מצופה:** אם הכוונה היא ש-sales יראה רק את הלקוחות של ההזמנות שלו — יש להוסיף תנאי דומה ל-`sales_orders`. אם הכוונה היא גישה מלאה ללקוחות — זו החלטה עסקית שכדאי לאמת, כי היא לא עקבית עם שאר המדיניות.
- **חומרה:** שיפור (פוטנציאל לחשיפת מידע רגיש של לקוחות מסוכנים אחרים)
- **ראיה:** תוצאת `pg_policies` עבור `customers`: `sales_customers_read` — `qual: "(current_role() = 'sales'::user_role)"` בלבד, ללא סינון agent_id.

### 14. RLS: sales יכול לקרוא ולהוסיף תשלומים (payments) על הזמנות שאינן שלו
- **התנהגות בפועל:** המדיניות `sales_payments_read` (SELECT) ו-`sales_payments` (INSERT) על `public.payments` דורשות רק `current_role()='sales'`, ללא בדיקת בעלות על ה-order_id — בשונה מ-`sales_items`/`sales_order_accessories` שבודקות `orders.agent_id = auth.uid()`.
- **מיקום:** `pg_policies` על `public.payments`.
- **התנהגות מצופה:** עקביות עם שאר הטבלאות — הגבלת קריאה/הוספת תשלומים להזמנות של הסוכן עצמו (אלא אם זו החלטה עסקית מכוונת).
- **חומרה:** שיפור
- **ראיה:** `qual`/`with_check` של `sales_payments_read`/`sales_payments` הם `current_role() = 'sales'` בלבד, ללא join לטבלת `orders`.

### 15. RLS: order_status_history פתוחה לגמרי לכל משתמש מאומת (ללא תלות בבעלות על ההזמנה)
- **התנהגות בפועל:** המדיניות `hist_insert`/`hist_read` על `order_status_history` דורשות רק `auth.uid() is not null` — כל משתמש מחובר (כולל sales) יכול לקרוא ולהוסיף רשומות היסטוריה לכל הזמנה, כולל הזמנות של סוכנים אחרים שאין לו גישה אליהן דרך `orders`/`order_items`.
- **מיקום:** `pg_policies` על `public.order_status_history`.
- **התנהגות מצופה:** הגבלת כתיבה/קריאה של היסטוריה לפי אותה בעלות שחלה על ה-`orders`/`order_items` המקושרים, כדי למנוע זיוף רשומות ביקורת (audit trail) עבור הזמנות שאינן שייכות למשתמש.
- **חומרה:** משבש (פרצת אמינות ביומן פעילות/ביקורת)
- **ראיה:** `qual`/`with_check`: `"(auth.uid() IS NOT NULL)"` בלבד, ללא join ל-`orders`.

### 16. פונקציית allocate_order_number (SECURITY DEFINER) ניתנת להרצה גם ע"י anon
- **התנהגות בפועל:** ה-advisor של Supabase מסמן ש-`public.allocate_order_number(uuid)` (וגם `current_role()`, `handle_new_user()`) הן SECURITY DEFINER וניתנות להרצה גם דרך `/rest/v1/rpc/...` על ידי role ה-`anon` (לא מחובר).
- **מיקום:** DB function `public.allocate_order_number`; `get_advisors(type=security)`.
- **התנהגות מצופה:** RPC שמקצה מספרי הזמנה אמור לדרוש לפחות משתמש מאומת (ואולי גם תפקיד מתאים), כדי למנוע ניצול/בזבוז מספרים ע"י גורם לא מזוהה.
- **חומרה:** שיפור (Security advisory, אין הוכחה לניצול בפועל — אך אין חסימה כרגע)
- **ראיה:** advisory `anon_security_definer_function_executable` על `allocate_order_number(p_order_id uuid)`.

### 17. הזמנות בסטטוס לא-טיוטה עם 0 פריטים לביצוע
- **התנהגות בפועל:** שלוש הזמנות (9017, 9015 — `pending_payment`; 9021 — `completed`) מכילות 0 שורות `order_items` רלוונטיות (`for_execution AND item_status<>'cancelled'`), אך כבר עברו מעבר לסטטוס טיוטה/הצעת מחיר, ואחת מהן אף סומנה "הושלם".
- **מיקום:** טבלאות `orders`/`order_items`.
- **התנהגות מצופה:** הזמנה עם 0 פריטים לביצוע לא אמורה להיות ניתנת לקידום לסטטוס "הושלם"/"ממתין לגבייה" בלי אזהרה למשתמש (יתכן שמדובר בהזמנות בדיקה/דמו, אך שווה בקרה).
- **חומרה:** שיפור
- **ראיה:** שאילתת ה-join שהוצגה בסעיף 6 — `relevant_items:0, item_statuses:null` עבור שלוש ההזמנות הנ"ל.

### 18. PaymentModal אינו מגביל תשלום ליתרה שנותרה
- **התנהגות בפועל:** ב-`PaymentModal.tsx` שדה הסכום מוגדר כברירת מחדל ליתרה, אך אין שום ולידציה שמונעת הזנת סכום גדול מהיתרה שנותרה (`remaining`) — ניתן "לשלם" סכום גדול משמעותית מהמחיר הכולל בלי כל אזהרה.
- **מיקום:** `src/pages/orders/PaymentModal.tsx` שורות 28-33 (הבדיקה היחידה היא `value > 0`).
- **התנהגות מצופה:** אזהרה (לא בהכרח חסימה) כאשר הסכום עולה על היתרה שנותרה.
- **חומרה:** שיפור
- **ראיה:** `if (!value || value <= 0) { ... }` — אין בדיקה מול `remaining`.

### 19. כפילויות מספר לקוח/רשומות בדיקה בטבלת customers (השפעת ליקוי #1 על הנתונים האמיתיים)
- **התנהגות בפועל:** מעבר ל-23 הכפילויות שצוינו בסעיף 1, נמצאו כפילויות נוספות תחת אותו טלפון (`0543281282` — 3 רשומות, `0505050505` — 2 רשומות, `0507444589` — 2 רשומות, `0500000001` — 2 רשומות "CC - PDF BUCKET CHECK 2" זהות).
- **מיקום:** טבלת `public.customers`.
- **התנהגות מצופה:** ראו סעיף 1 — צריך ניקוי/דה-דופליקציה ומניעה מבנית קדימה.
- **חומרה:** שיפור (תוצאה ישירה של ליקוי #1, מתועד בנפרד לצורך תיעוד היקף הנזק בנתונים האמיתיים)
- **ראיה:** תוצאת `SELECT phone, count(*), array_agg(full_name) ... GROUP BY phone HAVING count(*)>1`.

---

## סיכום

**סה"כ ליקויים שתועדו: 19**

### פירוק לפי חומרה
| חומרה | כמות | מספרים |
|---|---|---|
| חוסם | 1 | #5 |
| משבש | 8 | #1, #2, #3, #4, #6, #7, #13(פוטנציאלי)*, #15 |
| שיפור | 10 | #8, #9, #10, #11, #12, #13, #14, #16, #17, #18, #19 |

\* סעיף 13 סווג "שיפור" בטבלה הסופית לפי חומרת החשיפה בפועל (לא נמצאה עדות לניצול, אך חוסר עקביות מובהק מול שאר ה-RLS) — ראו את הסעיף המלא לפרטים.

תיקון מדויק: חוסם=1 (#5), משבש=7 (#1,#2,#3,#4,#6,#7,#15), שיפור=11 (#8,#9,#10,#11,#12,#13,#14,#16,#17,#18,#19).

### טבלת 9 הזרימות שנבדקו

| # | זרימה | סטטוס |
|---|---|---|
| 1 | הזמנה חדשה — טופס מלא | נמצאו ליקויים (#1, #2, #3) |
| 2 | שני המסלולים בדיאלוג (הצעת מחיר / בקשה לגבייה) | נמצאו ליקויים (#4) |
| 3 | עריכת הזמנה קיימת | נמצאו ליקויים (#5, #7) |
| 4 | תשלומים | נמצאו ליקויים (#14, #18) |
| 5 | קידום סטטוס + סנכרון דו-כיווני עם פריטים | נמצאו ליקויים (#6, #7) |
| 6 | מסך פריטים — בחירה מרובה, פעולות גורפות, פס התקדמות | נמצאו ליקויים (#8); הלוגיקה עצמה (בחירה מרובה, `SyncOrderDialog`) נבדקה ועברה תקין |
| 7 | הדפסה — ללקוח/הוראות עבודה, popup/Blob, חתימות | עבר תקין ברובו; ליקוי עקיף דרך #2 (אביזרים חסרים בהדפסה חוזרת) ו-#10 (עמודת חתימה מתה) |
| 8 | WhatsApp — הודעה מוכנה | עבר תקין (נמצאה קומפוננטה מתה נלווית — #12 — שאינה בשימוש בזרימה זו בפועל) |
| 9 | שאילתות profiles מ-orders (ציון FK מפורש) | נמצא חוסר עקביות קל (#9); כל שאילתות ה-`orders`→`profiles` בפועל תקינות ומשתמשות ב-FK מפורש. בנוסף נמצאו פערי RLS (#13, #14, #15, #16) בבדיקת ההצלבה מול ה-DB |

