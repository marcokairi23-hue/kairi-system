משימה: חתימה דיגיטלית על המסך (SignaturePad)
הקשר
מערכת קאירי, V6. הסוכן ממלא טופס הזמנה ב-iPad אצל הלקוח. כיום החתימה היא שדה טקסט (signature_name). צריך להוסיף ציור באצבע. עברית, RTL. React 18 + Vite + TS + Tailwind + Supabase.
עקרונות עבודה
בקש אישור לפני כל שינוי בקוד. הצג diff, קבל אישור, ואז בצע.
שלב אחד בכל פעם. עצור בסוף כל שלב.
אל תיגע בקבצים שלא ברשימה למטה.
אל תשנה את signature_name — הוא נשאר לתאימות לאחור.
מצב ביצוע
שלב 0 — פוליסות Storage על bucket documents (SELECT/INSERT/UPDATE ל-authenticated) — בוצע
שלב 1 — מיגרציה ✅
שלב 2 — SignaturePad.tsx ✅
שלב 3 — uploadSignature.ts ✅
שלב 4 — NewOrder ✅
שלב 5 — EditOrder + OrderDetail ✅
שלב 6 — הדפסה ✅
שלב 7 — בדיקה ידנית ✅


קבצים רלוונטיים — קרא לפני שאתה מתחיל
קרא בלבד:

src/pages/orders/types.ts        — OrderForm interface
src/pages/orders/NewOrder.tsx    — איפה signature_name נמצא היום
src/pages/orders/EditOrder.tsx
src/pages/orders/OrderDetail.tsx — איפה החתימה מוצגת
src/pages/orders/printOrder.ts   — החתימה בהדפסה ללקוח
src/lib/supabase.ts              — הקליינט
src/index.css                    — .input / .btn-primary / .card
supabase/migrations/             — לראות קונבנציית שמות

אל תקרא את שאר src/. לא רלוונטי.


שלב 1 — מיגרציה - בוצע
צור: supabase/migrations/0004_signature_url.sql

alter table orders add column if not exists signature_url text;

notify pgrst, 'reload schema';

עצור. אני מריץ ידנית ב-Supabase SQL Editor ומאשר.


שלב 2 — קומפוננטת SignaturePad - בוצע
צור: src/components/SignaturePad.tsx

Props:

{

  value?: string | null;      // dataURL או path קיים

  onChange: (dataUrl: string | null) => void;

  disabled?: boolean;

}

דרישות:

<canvas> עם pointer events (pointerdown/move/up) — לא mouse+touch נפרד
touch-action: none על ה-canvas, אחרת ה-iPad גולל במקום לצייר
devicePixelRatio scaling — אחרת החתימה מטושטשת ברטינה
קו: lineWidth 2, lineCap/lineJoin round, צבע שחור
רקע לבן מלא (לא שקוף) — PNG שקוף נראה רע בהדפסה
כפתור "נקה" — מנקה canvas וקורא onChange(null)
אם value הוא path קיים: הצג <img> עם כפתור "חתום מחדש", לא canvas
גובה קבוע ~180px, רוחב מלא
אין שמירה לרשת כאן. הקומפוננטה מחזירה dataURL בלבד.

עצור להצגה ואישור.


שלב 3 — פונקציית העלאה - בוצע
צור: src/lib/uploadSignature.ts

export async function uploadSignature(orderId: string, dataUrl: string): Promise<string>

export async function getSignatureUrl(path: string): Promise<string | null>

dataURL → Blob (fetch(dataUrl).then(r => r.blob()))
העלאה ל-bucket documents, path signatures/${orderId}.png, upsert: true
מחזיר את ה-path (לא public URL — הבאקט פרטי)
getSignatureUrl — createSignedUrl, תוקף שעה
שגיאות עם הודעה בעברית

עצור.


שלב 4 — חיווט ל-NewOrder - בוצע
קבצים: src/pages/orders/types.ts, src/pages/orders/NewOrder.tsx

ב-types.ts: הוסף signatureDataUrl?: string | null ל-OrderForm
ב-NewOrder.tsx: הצב את <SignaturePad> ליד שדה signature_name הקיים
בשמירה — הסדר קריטי: a. INSERT להזמנה (בלי חתימה) → מקבל order id b. אם יש signatureDataUrl → uploadSignature(id, dataUrl) c. UPDATE orders set signature_url = path d. אם ההעלאה נכשלה: ההזמנה נשמרת בכל זאת, הצג הודעה "ההזמנה נשמרה אך החתימה לא הועלתה"

אל תחסום שמירת הזמנה בגלל כישלון חתימה.

- [ ] פתוח: כשהעלאת חתימה נכשלת, ההזמנה כבר נשמרה.
      למנוע לחיצה חוזרת על "שמור" (הזמנה כפולה).

עצור.


שלב 5 — EditOrder + OrderDetail
EditOrder.tsx: אותו דפוס, אבל ה-id כבר קיים — העלאה לפני ה-UPDATE
OrderDetail.tsx: הצג את החתימה כתמונה (getSignatureUrl), fallback ל-signature_name

⚠️ ודא שהשאילתה כאן משתמשת ב-profiles!orders_agent_id_fkey(full_name) ולא profiles(...). יש קשר כפול ל-profiles שנשאר מספרינט קודם. אם זה לא מפורש — השאילתה נשברת.

עצור.


שלב 6 — הדפסה
קובץ: src/pages/orders/printOrder.ts

⚠️ יש גם printWork.ts ב-pages/items/. אל תבלבל. הוראות עבודה = בלי חתימה ובלי מחירים. אל תיגע בו.

בהדפסה ללקוח בלבד: החלף את שורת החתימה בתמונה.

הטמע כ-dataURL בתוך ה-HTML, לא כ-URL חתום — הוא יפוג לפני ההדפסה
גובה ~80px
fallback: אם אין חתימה, השאר את הטקסט הקיים

באג ידוע: popup blocker. הפתרון הוא Blob URL, לא window.open('').

עצור.


שלב 7 — בדיקה ידנית
ציור ב-iPad Safari — לא גולל את הדף
החתימה חדה, לא מטושטשת
"נקה" עובד
הזמנה נשמרת גם אם החתימה נכשלת
החתימה מופיעה ב-OrderDetail
החתימה מופיעה בהדפסה ללקוח
הוראות עבודה — בלי חתימה
RTL תקין


Deploy
git add . && git commit -m "feat: signature pad" && git push

Cloudflare בונה אוטומטית.

✅ שלבים 1-7

פריטים פתוחים:

- כישלון העלאת חתימה ב-NewOrder: ההזמנה כבר נשמרה, לחיצה חוזרת על "שמור" תיצור הזמנה כפולה
- כפתור "נקה" ב-EditOrder: ה-?? מחזיר את החתימה הישנה, צריך להבחין בין "לא נגעו" ל"נוקה במפורש"
- הדפסה מרשימת ההזמנות (OrdersList/OrderActions) לא כוללת חתימה — ההמרה ל-dataURL קיימת רק ב-OrderDetail