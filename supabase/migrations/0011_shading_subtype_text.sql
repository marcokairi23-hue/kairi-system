-- SPEC §4.5 (הרחבה, 11.08.2026): הופך את order_items.subtype מ-enum קשיח לטקסט
-- חופשי, כדי לאפשר לאדמין להוסיף/לערוך/למחוק "סוג מוצר הצללה" מעמוד ההגדרות —
-- בדיוק כמו sewing_type. הערך הנשמר הופך להיות הטקסט העברי עצמו (לא slug אנגלי),
-- כך שכל התצוגות הקיימות (SHADING_LABELS[x] ?? x) ממשיכות לעבוד ללא שינוי קוד:
-- ה-lookup פשוט לא ימצא את המפתח העברי ויחזור לערך המקורי — שהוא כבר הטקסט הנכון.
-- ה-enum shading_subtype עצמו לא נמחק (לא בשימוש עוד ע"י אף עמודה) — נשאר קיים,
-- לא מזיק, לפי אותה גישה הדרגתית שננקטה במעבר יחידות המטר (0010).

alter table public.order_items
  alter column subtype type text using subtype::text;

update public.order_items
   set subtype = case subtype
     when 'zebra' then 'זברה'
     when 'venetian' then 'ונציאני'
     when 'roman' then 'רומי'
     when 'roller' then 'גלילה'
     else subtype
   end
 where subtype is not null;

insert into public.settings (key, value)
values ('shading_subtypes', '["זברה","ונציאני","רומי","גלילה"]'::jsonb)
on conflict (key) do nothing;
