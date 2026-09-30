# Database

## Scope

- Supabase schema and migrations
- RPCs and transactions
- Data integrity

## Startup

Before starting work, read `../PROJECT_CONTEXT.md`, `../WORK_RULES.md`, `../KAIRI_GIT_BRANCH_SAFETY_PROTOCOL.md`, and this file.

## Current context

Versioned SQL is under `supabase/migrations/`. Sprint 1 adds the unapplied migration `0015_payment_gate_v1.sql` after the existing `0014` chain.

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

## Safety gate

- The migration file may be reviewed and edited, but it has not been applied to production.
- Production data has not changed.
- Local SQL execution is unavailable because neither `psql` nor the Supabase CLI is installed; static review and application build pass.
- Rollback after production traffic is not a simple down migration because payment lifecycle data and events may exist; use a reviewed forward correction or maintenance-window rollback plan.

## Known schema risk

The older committed migration chain still does not fully declare every production column/status referenced by current code. Migration `0015` uses only columns proven by the committed chain through `0014`, including `assigned_worker` from `0006`.

## Next action

Human review and explicit approval before applying `0015` to the live Supabase project.
