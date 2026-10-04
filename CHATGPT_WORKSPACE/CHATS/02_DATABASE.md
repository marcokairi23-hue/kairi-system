# Database

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
