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

Versioned SQL is under `supabase/migrations/`; the repository includes migrations through `0014_woocommerce_order_ingest.sql`. Phase A made no schema, migration, RLS, RPC, or production-data changes.

## Open issues

- The current payments table treats every row as received and cannot represent pending collection or physical custody.
- Phase B requires `payment_status`, `custody_status`, `recorded_by`, `office_received_by`, `office_received_at`, and nullable `paid_at`.
- Phase B requires a transactional submission/finalization RPC and an office-only `התקבל במשרד` RPC.
- Phase B RLS must restrict sales writes to owned orders and office receipt confirmation to office/admin.
- Historical rows require conservative backfill; custody must remain unknown when evidence is absent.
- `docs/DEFECTS_MAP.md` and `docs/PERMISSIONS_MAP.md` contain database and integrity findings that must be revalidated before work begins.

## Decisions

- No database or production change may be made without explicit approval.
- All Phase B fields, RPCs, RLS changes, and backfill listed above are requirements only and are **not implemented**.

## Next action

Review and approve the exact Phase B migration/RPC SQL, then test it safely before any production application.
