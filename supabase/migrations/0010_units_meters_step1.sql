-- SPEC.md §4.1 — מעבר ליחידות מטר, שלב 1 (הדרגתי, לפי החלטת מרקו 11.08.2026):
-- מוסיפים עמודות חדשות למטר לרוחב/גובה, עם backfill חד-פעמי מהעמודות הישנות (ס"מ).
-- העמודות הישנות (width_cm/heights_cm) *לא* נמחקות — נשארות לצורך רולבק/היסטוריה,
-- רק מפסיקים לדרוש מילוי שלהן בהכנסה חדשה. שטייף/מכפלת (hem_cm/shtaif_cm) לא משתנים כלל.
-- מחיקת עמודות הסרק והעמודות הישנות (contract) — שלב עתידי נפרד, לאחר אימות בפועל.

alter table public.order_items
  add column width_m numeric,
  add column heights_m numeric[] not null default '{}';

update public.order_items
   set width_m = width_cm / 100.0,
       heights_m = coalesce((select array_agg(h / 100.0) from unnest(heights_cm) as h), '{}');

alter table public.order_items
  alter column width_m set not null;

alter table public.order_items
  alter column width_cm drop not null;
