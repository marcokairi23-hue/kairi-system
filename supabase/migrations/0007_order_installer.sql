ALTER TABLE orders ADD COLUMN installer_name text;
INSERT INTO settings (key, value) VALUES ('installers', '[]'::jsonb) ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
