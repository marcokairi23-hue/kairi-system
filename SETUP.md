# מדריך הקמה — שלב 1: תשתית הנתונים

בסוף המדריך יהיה לך Database חי בענן עם כל הסכמה, ההרשאות והנתונים ההתחלתיים — הבסיס שעליו נבנה את האפליקציה.

## שלב א׳ — יצירת פרויקט Supabase (5 דקות)

1. היכנס ל-https://supabase.com והירשם (אפשר עם Google/GitHub).
2. לחץ **New Project**:
   - Name: `kairi-system`
   - Database Password: צור סיסמה חזקה **ושמור אותה** (מנהל סיסמאות).
   - Region: **Frankfurt (eu-central-1)** — הקרוב לישראל.
   - Plan: Free מספיק לשלב הפיתוח.
3. המתן כ-2 דקות עד שהפרויקט מוכן.

## שלב ב׳ — הרצת המיגרציה

1. בתפריט הצד: **SQL Editor** → **New query**.
2. פתח את הקובץ `supabase/migrations/0001_initial_schema.sql`, העתק את כל התוכן והדבק.
3. לחץ **Run**. אמור להסתיים בהצלחה תוך שניות.
4. אימות: בתפריט **Table Editor** אמורות להופיע כל הטבלאות (orders, fabrics, leads, stock_movements ועוד), ובטבלת `settings` תראה את `order_counter` עם הערך 9000.

## שלב ג׳ — יצירת המשתמש הראשון (אדמין)

1. **Authentication → Users → Add user → Create new user**: האימייל שלך + סיסמה. סמן **Auto confirm**.
2. **Table Editor → profiles**: תראה שנוצרה שורה אוטומטית. ערוך אותה:
   - `full_name`: השם שלך
   - `role`: `admin`
3. חזור על התהליך בהמשך עבור רן, גיא והמשרד עם role מתאים (`sales` / `office`).

## שלב ד׳ — Storage לתמונות ומסמכים

1. **Storage → New bucket**: שם `fabric-images`, **Public bucket: כן** (תמונות קטלוג).
2. **New bucket** נוסף: שם `documents`, **Public bucket: לא** (PDF של הזמנות — פרטי).

## שלב ה׳ — מפתחות לחיבור האפליקציה

**Project Settings → API**, שמור בצד שלושה ערכים (נצטרך אותם לקוד ול-Cloudflare):
- `Project URL`
- `anon public key`
- `service_role key` — **סודי, לעולם לא נכנס לקוד הצד-לקוח**

## מה הלאה

- [ ] שלב 2 בקוד: שלד אפליקציית React PWA + מסך התחברות + קטלוג בדים
- [ ] ייבוא נתוני FABRIKAIRI וטבלה1 (סקריפט ייבוא ייכתב ברגע שיהיה קובץ ייצוא)
- [ ] חיבור GitHub → Cloudflare Pages (נעשה כשיש קוד ראשון)

## הערות חשובות

- **אל תערוך נתונים ישירות ב-Table Editor** אחרי שהמערכת באוויר — רק דרך האפליקציה, כדי שה-audit והמלאי יישארו עקביים. בשלב ההקמה זה בסדר.
- טבלת `stock_movements` היא append-only בכוונה — אין דרך "לתקן" תנועה, רק להוסיף תנועת התאמה. זה מנגנון הבקרה.
- מונה ההזמנות מתחיל מ-9000 ומוקצה דרך פונקציית `allocate_order_number` — לא ידנית.
