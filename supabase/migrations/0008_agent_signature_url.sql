-- חתימת סוכן, במקביל לעמודת חתימת הלקוח הקיימת (signature_url).
-- אותו דפוס בדיוק: path בבאקט documents (signatures/<order_id>-agent.png).

alter table public.orders add column agent_signature_url text;

NOTIFY pgrst, 'reload schema';
