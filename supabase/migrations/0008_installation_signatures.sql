ALTER TABLE orders ADD COLUMN install_customer_signature_url text;
ALTER TABLE orders ADD COLUMN install_installer_signature_url text;

NOTIFY pgrst, 'reload schema';
