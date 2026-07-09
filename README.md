# מערכת קאירי — Kairi System

מערכת ניהול מאוחדת: לידים, קטלוג בדים ומלאי, הזמנות, PDF ומעקב.
Stack: React (Vite) + TypeScript + Tailwind + Supabase, פריסה ב-Cloudflare Pages.

## הרצה מקומית (למי שמפתח)

1. `npm install`
2. העתיקו את `.env.example` לקובץ `.env.local` ומלאו את שני הערכים מ-Supabase.
3. `npm run dev` ופתחו את הכתובת שמוצגת.

## העלאה לאוויר — GitHub + Cloudflare Pages (פעם אחת)

### א. העלאת הקוד ל-GitHub
1. צרו חשבון/התחברו ל-https://github.com
2. New repository → שם: `kairi-system` → **Private** → Create.
3. העלאת הקוד: הדרך הקלה בלי שורת פקודה — בדף הריפו: *uploading an existing file* → גררו את כל תוכן התיקייה (בלי node_modules אם קיים) → Commit.
   (לחלופין עם git: `git init && git add -A && git commit -m "initial" && git push` לפי ההוראות שבדף.)

### ב. חיבור Cloudflare Pages
1. היכנסו ל-https://dash.cloudflare.com → Workers & Pages → Create → Pages → **Connect to Git**.
2. אשרו גישה ל-GitHub ובחרו את `kairi-system`.
3. הגדרות Build:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Build output directory: `dist`
4. **Environment variables** (חשוב!) — הוסיפו:
   - `VITE_SUPABASE_URL` = ה-Project URL מ-Supabase
   - `VITE_SUPABASE_ANON_KEY` = מפתח ה-anon/publishable
   (לא להכניס לכאן את ה-service_role לעולם.)
5. Save and Deploy. בסיום תקבלו כתובת `xxx.pages.dev` — המערכת באוויר.
6. חיבור דומיין: בפרויקט ה-Pages → Custom domains → הוסיפו את הדומיין שלכם ועקבו אחר ההוראות.

### ג. הגדרת SPA routing
צרו בריפו קובץ בשם `public/_redirects` עם השורה:
```
/* /index.html 200
```
(כלול כבר בפרויקט זה.)

## מה יש בגרסה הזו (שלב 1–2 התחלתי)
- התחברות עם משתמשי Supabase והרשאות לפי תפקיד
- ניווט ראשי + דשבורד
- קטלוג בדים: רשימה עם חיפוש, כרטיס בד, הוספה/עריכה, העלאת תמונות

## הצעדים הבאים בתוכנית
מלאי גלילים ושקילה → CRM לידים + סנכרון Sheets → טופס הזמנות → PDF ושליחה → מעקב.
