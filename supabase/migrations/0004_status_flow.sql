ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'picked_by_installer' AFTER 'ready_for_install';

NOTIFY pgrst, 'reload schema';
