# Database

## Scope

Supabase schema, migrations, storage, database functions, and data integrity.

## Current context

Versioned SQL is under `supabase/migrations/`; the repository currently includes migrations through `0014_woocommerce_order_ingest.sql`.

## Open issues

- `docs/DEFECTS_MAP.md` and `docs/PERMISSIONS_MAP.md` contain database and integrity findings that must be revalidated before work begins.

## Decisions

- No database or production change may be made without explicit approval.

## Next action

Identify the specific approved database task and validate its current schema and migration state before proposing changes.
