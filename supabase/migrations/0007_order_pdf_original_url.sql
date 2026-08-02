-- לינק "מקור" לקובץ ה-PDF, נפרד מהלינק החי (pdf_url, ראו 0005).
-- מתעדכן יחד עם pdf_url כל עוד ההזמנה ב-draft/quote/pending_payment.
-- ברגע שהסטטוס עובר ל-ready ואילך — מוקפא לצמיתות (נאכף בקוד, לא ב-DB).

alter table public.orders add column pdf_url_original text;
