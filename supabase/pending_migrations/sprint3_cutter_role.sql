-- M1 only. Apply and COMMIT before sprint3_cut_instructions.sql.
-- No existing user is assigned this role automatically.
alter type public.user_role add value if not exists 'cutter';
