# מסמך העברה — מערכת קאירי (Kairi System)

> **הוראות שימוש:** הדבק את המסמך הזה בתחילת שיחה חדשה עם כל כלי AI. זו נקודת הכניסה — היא מפנה לשלושה מסמכים נוספים שמכילים את הפירוט המלא.

## מצב עבודה נוכחי (24.08.2026)

**ספרינט A (תשתית Feature Flags) הושלם.** ראו סעיף למטה. הניסוי העיצובי ב-`ProductionBoard.tsx` (מוזכר למטה) עדיין בעצירה — לא נגעתי בו בספרינט הזה כלל.

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
