-- תיקון נתונים היסטוריים: production_route היה תמיד 'internal' (ברירת המחדל של העמודה)
-- כי אף קוד לא קבע אותו במפורש. מתקנים לפי family: וילון = internal, הצללה = external.
UPDATE order_items SET production_route = 'external' WHERE family = 'shading' AND production_route = 'internal';

NOTIFY pgrst, 'reload schema';
