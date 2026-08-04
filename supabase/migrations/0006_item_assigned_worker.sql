ALTER TABLE order_items ADD COLUMN assigned_worker uuid REFERENCES profiles(id);

NOTIFY pgrst, 'reload schema';
