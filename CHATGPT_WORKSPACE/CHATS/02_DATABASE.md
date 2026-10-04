# Database

## Current update — Part 2 locally implemented

Sprint 3: 12/18 implementation items; total original checklist 66/203 marked, 137 open. User explicitly chose activation AFTER printing by a separate confirmation. Draft creation/printing does not lock items; activation revalidates the snapshot and atomically locks selected items and writes audit. Pending cut is represented by order_items.cut_instruction_id, leaving legacy item_status unchanged until Part 3.

New scoped Cutter queue/UI and role draft, immutable instruction snapshots, server locks, same-instruction retry, popup failure handling and draft reopening are implemented. PostgreSQL/PGlite and mocked local-browser component tests passed. See TEMP_ANS.md for evidence and limitations. No Production changes, commit, push or deployment.

M1 must commit sprint3_cutter_role.sql before sprint3_cut_instructions.sql, after corrected 0016. No users were assigned the new role. Complete Part 3 actual-meters confirmation before operational deployment; Part 2 intentionally provides no unlock/advance operation.


## Current update — Part 1 / Sprint 2 locally verified

Sprint 2 implementation: 16/16; full original checklist 56/203 marked and 147 open. No production completion claimed. All shading routes to Office, including Roman. Removed the obsolete Roman flag from form types, creation/editing, order details and print mapping. Revised 0016 has no Roman exception and includes atomic migration boundaries and backfill audit.

Paid still-new legacy items route by family; progressed items with a conflicting historical route remain legacy_unverified without rewriting their work status. M1 must review these records and the exact backfill before application.

Validation: npm run build PASS (existing bundle warning); scripts/test-sprint1.mjs <PGlite module> --routing PASS with five payment routes, Office confirmation for card/transfer, Sales denial, mixed item ownership, non-execution items, historical Roman backfill, per-item audit and isolated edits. Sprint 1 SQL now explicitly casts production_route to its database enum; fixture mirrors that enum. Tests use local PostgreSQL only, no Supabase/Production or browser verification claimed.

M1: verify live production_route enum/schema, 0015 state, backup/recovery, corrected 0016 and atomic-creation draft. Approve/apply exact versions before compatible UI deployment. No migration, commit, push or deployment performed. Previous notes calling the current local 0016 stale are superseded; remote/previous copies remain unapproved.

Next authorized part to discuss: Part 2 (Cutter work instructions). No Sprint 3 implementation was performed in this part.


## Current override — migrations sprint M1

All production migrations are deferred to one separate sprint. Sprint 1 SQL is prepared in supabase/pending_migrations/sprint1_atomic_order_creation.sql, not applied. Local tests pass with explicit fixtures for orders.notes and order_items.production_route; live assumptions require preflight. Correct 0016's Roman exception before inclusion. Do not rerun 0015 automatically or reuse an old approval for new SQL.


## Scope

- Supabase schema and migrations
- RPCs and transactions
- Data integrity

## Startup

Before starting work, read `../PROJECT_CONTEXT.md`, `../WORK_RULES.md`, `../KAIRI_GIT_BRANCH_SAFETY_PROTOCOL.md`, and this file.

## Current context

Versioned SQL is under `supabase/migrations/`. Sprint 1 migration `0015_payment_gate_v1.sql` was applied and verified in production. Sprint 2 migration `0016_initial_item_routing_v1.sql` was pushed for review at `06d2d9e` and has not been applied.

Migration `0015` prepares:

- `payment_status` enum: `pending`, `received`, `rejected`;
- stable `payment_route` codes and payment actor/timestamp/rejection fields;
- nullable `paid_at` for pending/rejected rows;
- conservative backfill of every historical row to `received` without guessing route or custody;
- server-side timestamp/default trigger and lifecycle constraints;
- ownership-scoped payment SELECT/INSERT RLS with no direct client UPDATE policy;
- `confirm_pending_payment_v1` transactional RPC;
- `reject_pending_payment_v1` transactional RPC;
- an order trigger requiring pending-payment exit through the confirmation RPC; and
- an item trigger preventing operational item advancement before payment approval.

## Sprint 2 safety gate

- `0016` has not been applied to production.
- Static review found that `0016` checks `roman` while migration 0011 and the current form persist `רומי`; the Roman exception is therefore broken in the reviewed SQL.
- Existing in-progress items are backfilled into initial awaiting states based only on route; review this data impact before application.
- Local SQL execution is unavailable because neither `psql` nor the Supabase CLI is installed; static review and application build pass.
- Rollback after production traffic is not a simple down migration; use a reviewed forward correction or maintenance-window rollback plan.

## Known schema risk

The older committed migration chain still does not fully declare every production column/status referenced by current code. Migration `0015` uses only columns proven by the committed chain through `0014`, including `assigned_worker` from `0006`.

## Next action

Approval to resume Sprint 2 correction/UI work, followed by review and separate explicit approval before applying the corrected `0016` to the exact Supabase project.
