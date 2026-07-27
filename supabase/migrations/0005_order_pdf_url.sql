-- כתובת URL ציבורית לקובץ ה-PDF של ההזמנה (bucket order-pdfs, ראו 0004).
-- כל הזמנה מוחזקת בקובץ יחיד בנתיב קבוע (<order_id>.pdf) שמוחלף בכל עדכון,
-- כדי למנוע כפילויות.

alter table public.orders add column pdf_url text;
