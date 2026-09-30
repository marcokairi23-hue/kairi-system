# Database

## Scope

- Supabase schema
- Migrations
- RPCs
- Transactions
- Data integrity

## Startup

Before starting work, read `../PROJECT_CONTEXT.md`, `../WORK_RULES.md`, `../KAIRI_GIT_BRANCH_SAFETY_PROTOCOL.md`, and this file.

## Current context

Versioned SQL is under `supabase/migrations/`; the repository currently includes migrations through `0014_woocommerce_order_ingest.sql`.

## Open issues

- `docs/DEFECTS_MAP.md` and `docs/PERMISSIONS_MAP.md` contain database and integrity findings that must be revalidated before work begins.

## Decisions

- No database or production change may be made without explicit approval.

## Next action

Identify the specific approved database task and validate its current schema and migration state before proposing changes.
