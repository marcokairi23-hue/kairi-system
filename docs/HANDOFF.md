# מסמך העברה — מערכת קאירי (Kairi System)

> **הוראות שימוש:** הדבק את המסמך הזה בתחילת שיחה חדשה עם כל כלי AI. זו נקודת הכניסה — היא מפנה לשלושה מסמכים נוספים שמכילים את הפירוט המלא.

## מצב עבודה נוכחי (24.08.2026)

**ספרינט C (מסך ניהול מסכים) הושלם — זו נקודת הסיום של פרויקט ה-feature flags** (תשתית + אכיפה + UI). ראו סעיף למטה, ולפניו 0013, B2, B1, A. הניסוי העיצובי ב-`ProductionBoard.tsx` (מוזכר למטה) עדיין בעצירה — לא נגעתי בו.

### ספרינט C — מסך ניהול מסכים (24.08.2026)

מה נעשה:
- `src/lib/featureFlags.tsx` הורחב: `refresh()`, `setFlagEnabled(key, enabled_global)`, `setPermissionAllowed(featureKey, role, allowed)` — כתיבה אופטימיסטית ל-state המשותף (navbar/routes/מסך הניהול כולם קוראים מאותו context, כך שהם מתעדכנים מיד בלי refetch/רענון דף) + rollback אם ה-DB write נכשל. `evaluateFeature` יוצא (exported) לשימוש בתצוגה המקדימה. hook חדש `useFeatureFlagsAdmin()`.
- `src/pages/admin/ScreenManager.tsx` (חדש) — accordion של 11 המסכים (ממוינים לפי sort_order), עם קומפוננטות מקוננות תחתם (למשל dashboard + 7 קומפוננטות). כל כרטיס: badge פעיל/כבוי, מספר תפקידים מורשים, סוויצ' גלובלי (נעול/מושבת ל-is_locked), 4 pills הרשאה (admin/office/sales/viewer), חיווי שמירה זמני (שומר.../✓ נשמר/שגיאה), ותג "✓/✗ נראה ל-&lt;role&gt;" לפי בורר תפקיד לתצוגה מקדימה (מבוסס `evaluateFeature` על ה-state החי — לא סימולציה נפרדת).
- `src/App.tsx` — route חדש `/screen-manager` עטוף ב-`FeatureRoute featureKey="screenManager"`.
- `src/components/Layout.tsx` — נוסף פריט navbar "ניהול מסכים" (admin בלבד, כמו users/settings), מסונן גם דרך `useFeature('screenManager')`.
- עיצוב: נשען על `.card`/`.btn-*` הקיימים ב-`index.css` וצבעי `brand`/`brand-dark` הקיימים ב-`tailwind.config.js` — לא הוצגו צבעים/סגנונות חדשים.

**באג אבטחה אמיתי שנמצא ותוקן (אושר עם מרקו לפני התיקון):**
ה-`useFeature`/`evaluateFeature` שנכתבו בספרינט A מימשו את `is_locked` כ"return true ללא תלות ב-role" — מילולית לפי הספרינט ("מסך מערכת תמיד גלוי"). בפועל זה אומר ש-`screenManager` (המסך הנעול היחיד ב-seed) היה **נגיש דרך URL ישיר (`/screen-manager`) לכל משתמש מחובר**, לא רק לאדמין — למרות ש-`feature_permissions` אומר office/sales/viewer=✗, ולמרות שספרינט B2 עצמו הניח בטעות ש"is_locked יבטיח שרק אדמין נכנס". התיקון: הוסר קיצור-הדרך; `is_locked` כבר לא עוקף את בדיקת ה-role — הבדיקה תמיד רצה מול `feature_permissions` (fail-open נשאר כרגיל אם אין שורה). הבאג היחיד שנפגע ממנו בפועל: `screenManager` (כרגע ה-feature היחיד עם `is_locked=true`). תוקן ב-`src/lib/featureFlags.tsx`.

פלט קריטריון קבלה:
```
npm run build → ✓ built in 15.28s (tsc + vite build עברו נקי, אחרי התיקון)
```
תיאור התנהגות (לאימות ידני של מרקו):
- כניסה כאדמין ל"ניהול מסכים" → 11 מסכים, dashboard עם 7 קומפוננטות מקוננות.
- הזזת סוויצ' items ל-ON → אמור להופיע מיד ב-navbar (state משותף דרך context, בלי רענון דף).
- הזזה חזרה ל-OFF → אמור להיעלם מיד.
- screenManager מוצג עם סוויצ' נעול (אפור, מושבת) ו-pill admin נעול-דלוק; office/sales/viewer מוצגים ✗ ולא ניתנים לשינוי דרך URL (אחרי התיקון לעיל).
- **טרם בוצעה בדיקה ידנית בדפדפן בפועל** — התיאור לעיל מבוסס על קריאת הקוד/לוגיקה, לא הרצה. מרקו מתבקש לאמת ולוודא להחזיר items ל-OFF בסוף הבדיקה כדי לא להשאיר את ה-seed משובש.

**זו נקודת הסיום של פרויקט ה-feature flags** (ספרינטים A, B1, B2, מיגרציה 0013, C). המנגנון מלא: תשתית DB, אכיפה ב-navbar+routes, ו-UI ניהול חי.

**עצירה.**

### ספרינט B2 — אכיפת feature flags ברמת ה-routes (24.08.2026)

מה נעשה (רק ב-`src/App.tsx`, לא נגעתי ב-Layout/hook/מסכים):
- רכיב הגנה `FeatureRoute({ featureKey, children })` — קורא `useFeature(featureKey)`, מרנדר את `children` אם true, אחרת `<Navigate to="/" replace />`.
- כל route (מלבד `/` ו-`*`) עטוף ב-`FeatureRoute` עם ה-key התואם: fabrics/fabrics-new/fabrics-:id→`fabrics`, orders→`orders`, orders/new→`newOrder`, orders/:id ו-orders/:id/edit→`orderDetail`, items→`items`, production→`production`, activity→`activityLog`, users→`users`, settings→`settings`.
- **`/users` ו-`/settings`**: הוחלף הצ'ק הישן `profile?.role==='admin' ? ... : <Navigate/>` ב-`FeatureRoute` — עכשיו נאכף דרך `feature_permissions` (שנזרעו במיגרציה 0013), לא hardcoded בקוד.
- **`/` (dashboard) לא עטוף בכוונה** — אם היה עטוף וייחסם, ה-redirect שלו הוא ל-"/" עצמו → redirect-loop. הוחלט (החלטה טכנית, לא עסקית) להשאיר את הדף הראשי כ"נחלת מילוט" בלתי-חסומה; dashboard מורשה היום לכל 4 התפקידים כך שאין השפעה בפועל כרגע.

**הכרעה לגבי 3 sub-routes בלי key עצמאי, אושרה עם מרקו לפני ביצוע:**
`/fabrics/new`, `/fabrics/:id` → מפתח `fabrics` (המסך-אב); `/orders/:id/edit` → מפתח `orderDetail` (המסך-אב). לא נוסף key חדש ל-DB.

`screenManager` נשאר בלי route (כמו newOrder/production בהחלטת B1 — שם אין key בלי route; הפעם ההפך: יש key, אין route. לא נוצר route חדש).

פלט קריטריון קבלה:
```
npm run build → ✓ built in 14.58s (tsc + vite build עברו נקי)
```
תיאור התנהגות (לפי seed נוכחי: items/fabrics = enabled_global=false):
- ניווט ישיר ל-`/items` → redirect ל-`/`, ItemsList לא נטען.
- ניווט ישיר ל-`/fabrics` (וגם `/fabrics/new`, `/fabrics/:id`) → redirect ל-`/`.
- ניווט ל-`/orders` → נטען כרגיל (מורשה, דלוק).

מה **לא** נעשה:
- לא נוצר מסך "אין הרשאה" — redirect שקט ל-`/` בלבד (כפי שההוראות אפשרו כברירת מחדל בהיעדר מסך כזה בפרויקט).
- מסך ניהול המסכים (feature_flags CRUD ב-UI) — ספרינט C, עדיין לא הותחל.

**עצירה. לא הותחל C — ממתין לאישור מפורש.**

### מיגרציה 0013 — users + settings ב-feature flags (24.08.2026)

מה נעשה (seed בלבד, אין שינוי קוד):
- `supabase/migrations/0013_users_settings_flags.sql` — הוסיף 2 מסכים (`users`="משתמשים", `settings`="הגדרות") ל-`feature_flags` (both in_navbar=true, is_locked=false, enabled_global=true) + 8 שורות הרשאה ב-`feature_permissions`: `users` = admin בלבד; `settings` = admin+office. הוחל בפועל על ה-DB המרוחק (`ipcnyqkcvbvzmasmzaur`) דרך Supabase MCP.
- `src/components/Layout.tsx` **לא נגעתי** — הפריטים "משתמשים"/"הגדרות" עדיין מחווטים רק לפי `role==='admin'` בקוד, לא דרך `useFeature`. יש להם כבר key/הרשאות ב-DB אך אין עדיין חיווט ב-navbar (זה המצב שהיה גם קודם — הפער ידוע, מטופל בספרינט עתידי).

פלט קריטריון קבלה (מול ה-DB המרוחק בפועל):
```
screens=11, permissions=76
users.enabled_global    = true ✓
settings.enabled_global = true ✓
```

**עצירה. ממתין לאישור לפני B2.**

### ספרינט B1 — אכיפת feature flags ב-navbar (24.08.2026)

מה נעשה:
- `src/components/Layout.tsx` — כל פריט ב-`navItems` קיבל `featureKey`, ונוסף `useFeature(...)` נקרא פעם אחת לכל אחד מ-6 המפתחות (סדר קבוע, לא בתוך loop/map — שומר על rules-of-hooks). רשימת ה-items מסוננת לפי `featureVisible[featureKey]`. סדר הפריטים, העיצוב והטקסט לא שונו.
- לא נגעתי ב-routing, במסכים עצמם, או ב-`featureFlags.tsx`.

**שני פערים שהתגלו מול טיוטת הספרינט, שאושרו עם מרקו לפני ביצוע:**
1. פריטי "משתמשים" (`/users`) ו"הגדרות" (`/settings`) — קיימים ב-navbar (admin בלבד) אבל **אין להם key ב-feature_flags בכלל**. הוחלט: להשאירם כמו שהיו, בלי חיווט feature-flag (`featureKey` לא מוגדר להם → מוצגים תמיד לפי תנאי ה-`role==='admin'` הקיים).
2. `newOrder` ו-`screenManager` — יש להם key ב-feature_flags (מספרינט A), אבל **אין להם פריט navbar בפועל** (אין קישור "הזמנה חדשה" או "ניהול מסכים" בתפריט). הוחלט: לדלג — לא נוסף פריט navbar חדש. חוותט רק 6 הפריטים הקיימים: dashboard/orders/items/production/fabrics/activityLog.

פלט קריטריון קבלה:
```
npm run build → ✓ built in 14.04s (tsc + vite build עברו נקי)
```
תיאור התנהגות (לפי ה-seed הנוכחי מספרינט A: items ו-fabrics הם enabled_global=false):
- **items** ו-**fabrics** נעלמים מה-navbar לכל התפקידים (בדוק ב-`featureVisible` → `enabled_global=false` גובר).
- **dashboard, orders, production, activityLog** מוצגים למשתמשי admin/office (וגם sales/viewer לפי טבלת ההרשאות מספרינט A, למעט production ל-sales/viewer).
- לאדמין, ה-navbar בפועל מציג: **ראשי, הזמנות, לוח ייצור - בדיקה, יומן פעילות, משתמשים, הגדרות** — בלי פריטים, בלי בדים. (אין "הזמנה חדשה"/"ניהול מסכים" כי אין להם פריט navbar כלל, ראה פער #2 למעלה.)

מה **לא** נעשה (בכוונה):
- routes לא נגעו — ניווט ישיר ב-URL ל-`/items`, `/fabrics` וכו' עדיין עובד. זה מתוקן ב-B2.
- לא נוסף פריט navbar ל-newOrder/screenManager.

**עצירה. לא הותחל B2 — ממתין לאישור מפורש.**

### ספרינט A — תשתית Feature Flags (24.08.2026)

מה נוצר:
- `supabase/migrations/0012_feature_flags.sql` — טבלאות `feature_flags` + `feature_permissions`, RLS (read=authenticated, write=admin בלבד דרך `current_role()`), seed מלא. **הוחל בפועל על ה-DB המרוחק** (`ipcnyqkcvbvzmasmzaur`) דרך Supabase MCP `apply_migration` — לא רק קובץ מקומי.
- `src/lib/featureFlags.tsx` — `FeatureFlagsProvider` (טוען את שתי הטבלאות פעם אחת) + hook `useFeature(key)` עם לוגיקת fail-open לפי הספק.
- `src/main.tsx` — `FeatureFlagsProvider` עטוף בתוך `AuthProvider` (תלוי ב-role). שום מסך/navbar/route לא נגעו בו.

**סטייה מטיוטת הספרינט המקורית (אושרה עם מרקו לפני ביצוע):**
1. **תפקידים**: הטיוטה ביקשה `admin/office/agent/viewer/installer`. בפועל ב-DB/`types.ts`/`PERMISSIONS_MAP.md` התפקידים הם `admin/office/sales/viewer` — אין `agent`/`installer` בשום מקום. הוחלט להשתמש בתפקידים הקיימים בפועל (agent→sales מופה, installer הושמט לגמרי). כתוצאה מכך `feature_permissions` מכיל **68 שורות** (17 פיצ'רים × 4 תפקידים), לא 85.
2. **מספור מיגרציה**: `0004` תפוס כבר פעמיים בפועל (`0004_order_pdfs_bucket.sql`, `0004_status_flow.sql`); המיגרציה האחרונה בפועל הייתה `0011`. נכתב `0012_feature_flags.sql` במקום `0004`.

פלט קריטריון קבלה (מול ה-DB המרוחק בפועל):
```
screens=9, components=8, permissions=68
orderDetail.in_navbar = false ✓
screenManager.is_locked = true ✓
npm run build → ✓ built in 32.43s (tsc + vite build עברו נקי)
```

מה **לא** נעשה (בכוונה — ספרינט B):
- אכיפה בפועל: אף מסך/navbar/route לא משתמש ב-`useFeature` עדיין. שום דבר ויזואלי לא השתנה.
- לא נוצר תפקיד `installer` ב-DB/UI — אם יידרש בעתיד, צריך migration נפרד ל-`user_role` enum + `profiles` + כל ה-RLS הרלוונטי, לא רק ל-feature_flags.

**עצירה. לא הותחל ספרינט B — ממתין לאישור מפורש.**

---

## מצב קודם (23.08.2026, עדיין רלוונטי)

**בעצירה, ממתין להנחיות.** נבנה `src/pages/items/ProductionBoard.tsx` (route `/production`, קישור ב-nav "לוח ייצור - בדיקה") כניסוי עיצובי לפי פרויקט ה-Design "Curtains order system redesign". מרקו עצר את העבודה במכוון: הכיוון העיצובי הרחב עומד להתהפך — במקום redesign, חזרה לרפליקה קרובה של המערכת הקיימת עם שדרוגי workflow מינוריים בלבד. פרטים מלאים: `SPEC.md` §4.10, `WORKPLAN.md` §8 (23.08.2026). לפני שממשיכים — לבדוק אם הגיעו הנחיות עיצוב חדשות וגורפות; אם לא, לא להניח כלום ולשאול.

(הערה: המסמך הזה הפנה בעבר ל-`PROJECT.md`/`ARCHITECTURE.md` שאינם קיימים בפועל ב-`docs/` — קיימים במקום זאת `SPEC.md`, `WORKPLAN.md`, `BUSINESS.md`, `PERMISSIONS_MAP.md`. סעיף "סדר קריאה" למטה טעון עדכון בנפרד.)

## מה הפרויקט

מערכת ניהול הזמנות לעסק משפחתי — **מרקו קאירי, וילונות ובדים בהתאמה אישית**. מחליפה גיליון Google Sheets ("Tofsy") ומאחדת שלוש אפליקציות ישנות (Base44/Lovable) למערכת אחת.

**המניע העיקרי:** חותמות זמן על פעולות של כל עובד — **שקיפות ואחריות**, לא תחכום. זה הלב של הפרויקט; כל החלטת עיצוב נמדדת מולו.

## הסטק בשורה

React 18 + Vite + TypeScript + Tailwind, מול Supabase (Postgres + Auth + Storage), דיפלוי אוטומטי ל-Cloudflare Pages בכל push ל-`main`.

## סדר קריאה

1. **[PROJECT.md](PROJECT.md)** — רקע עסקי, תפקידי הצוות, שרשרת ההזמנה, החלטות מוצר סגורות, מונחים מקצועיים.
2. **[ARCHITECTURE.md](ARCHITECTURE.md)** — סטק מפורט, מבנה קוד, סכמת ה-DB המלאה, מודל הסטטוסים, מלכודות טכניות.
3. **[WORKPLAN.md](WORKPLAN.md)** — כללי עבודה, שלבים שבוצעו, מצב נוכחי, רשימת פתוחים.

## מלכודות קריטיות (הפירוט המלא ב-ARCHITECTURE.md)

1. **שאילתת `profiles(...)` על `orders` בלי FK מפורש** → שגיאת PGRST201 (יש שני FK אפשריים). חובה `profiles!orders_agent_id_fkey(...)`.
2. **`VITE_SUPABASE_URL` חייב להיות בלי `/rest/v1/`** בסוף — טעות זו כבר גרמה לבאג.
3. **סכמת ה-DB בפועל רחבה יותר מהמיגרציות** (`0001`+`0002`) — שריד ספרינט ייצור שבוטל (טבלת `suppliers`, עמודות ב-`order_items`, enums) קיים ב-DB במלואו ולא נכתב כמיגרציה. לפני שמסתמכים על מבנה טבלה — לבדוק ב-`ARCHITECTURE.md`, לא להניח לפי הקוד בלבד.
4. **כתיבה לטבלת `settings` מוגבלת ל-`admin` בלבד ב-RLS** — לא `office`, למרות שזה אולי אינטואיטיבי. UI שמאפשר ל-office לערוך הגדרות ייכשל בשקט מול ה-DB אם לא בודקים תפקיד לפני.
5. **קבצים בעלי שמות דומים שוברים build.** Windows לא מבחין בין `printOrder.ts` ל-`PrintOrder.tsx`, שרת הבנייה של Cloudflare (לינוקס) כן מבחין. תמיד לבדוק שמות קבצים חדשים מול קיימים.
