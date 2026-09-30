# Project State

## Purpose

This file records verified current KAIRI SYSTEM state. Update it only from repository evidence or explicit project decisions.

## Current state

- Active development branch: `main`
- Normal Sprint strategy: MAIN-ONLY
- Sprint 0 baseline: `5b105e7bb60cd56928b5a650591f990182208611`, verified equal to `origin/main` before work
- Current phase: Run 1.2 is committed and pushed; Run 1.3 database payment-gate strengthening awaits commit review
- Authoritative workflow: `CHATGPT_WORKSPACE/WORKFLOW_V1.md`
- Task queue/checklist: `CHATGPT_WORKSPACE/TASKS.md`
- Decision record: `CHATGPT_WORKSPACE/DECISIONS.md`
- Coordination: `CHATGPT_WORKSPACE/CONTROL_TOWER.md`

Historical branches `codex/kairi-development` and `codex/order-page-layout` remain as refs but are not the current work location. The order-page work from `codex/order-page-layout` is already merged into `main`.

## Current implemented baseline

- Order creation/editing includes order number display, item controls, width validation, city, full/partial execution selection, live summaries, and semi-automatic editable `final_total`.
- Frontend payment-route codes exist. Cash/check currently enter the order into the active flow, credit card/bank transfer wait in `pending_payment`, and quotes save items outside execution.
- Item-level internal/external routing exists: new curtain items are internal and shading items external.
- Item and production screens provide order grouping, subset selection, printing, bulk progression, worker assignment, and history inserts.
- Current internal item track is `new → cut → sewing → ready`; current external track is `new → ordered_from_supplier → arrived → ready`.
- Activity combines order/item history with payment records.
- Installer name and two installation signature URL fields exist; order completion is suggested after both signatures.
- Sprint 0 validation: `npm run build` passes; Vite reports the existing large-bundle advisory (main JS chunk exceeds 500 kB after minification).

## Sprint 1 migration-ready state

- Preparation commit `be4178b` exists on `main` and has been pushed to `origin/main`.
- Run 1.2 checkpoint `3160633` exists on `main` and has been pushed to `origin/main`.
- New-order routes are exactly Cash, Check, Credit Card, Bank Transfer, and Quote; `pay_later` is removed from new-order creation without rewriting historical data.
- Cash/Check require a positive deposit, start in non-operational `draft`, create a `received` payment, and move to `ready` only after that insert succeeds.
- Credit Card/Bank Transfer require and preserve a positive requested deposit, create a `pending` payment, and keep the order in `pending_payment`.
- Quote creates no payment and keeps all items outside execution.
- All application payment totals now count only `received` payments.
- Order Detail shows pending route, requested amount, remaining balance, and Office/Admin confirm/reject actions. Sales can view but cannot act.
- Migration `0015_payment_gate_v1.sql` adds the payment lifecycle, conservative historical backfill, server timestamps, ownership-scoped payment RLS, atomic confirmation/rejection RPCs, and database payment-gate guards.
- Run 1.3 strengthens its order trigger: `draft` cannot enter an operational status without a received payment, while `pending_payment` additionally requires the confirmation RPC transaction marker.
- The confirmation RPC remains compatible because it atomically marks the payment received before setting the marker and releasing the order.
- `npm run build` passes with the existing large-bundle advisory.
- The migration has not been applied to production and no live data has been changed.
- End-to-end payment verification is not complete and remains pending migration approval and application.
- Sprint 1 is incomplete; no production migration has been applied.

## Verified contract gaps

- No explicit payment approval/custody state.
- No Cutter or Installer database roles; current roles are Admin, Office, Sales, and Viewer.
- No Roman own-fabric routing input.
- No pending-cut lock, cut-instruction entity, or actual-meters confirmation.
- No required supplier confirmation action tied to an item.
- No Goods Receipt entity or confirmation flow.
- Order readiness is suggested rather than automatic and authoritative.
- No pickup Track Cutting Report.
- No multi-order Installer print/accept action with page-per-order output.
- No installation photo upload.
- Final closure is not fully restricted to Office/Admin.
- Existing state and history writes are separate client operations rather than one atomic boundary.
- Current history does not satisfy the full structured immutable event contract.
- Committed migrations do not fully reconstruct the production-route/status schema currently referenced by application code.

## Risks

- Existing payment rows cannot distinguish requested, confirmed, rejected, or custody states.
- Historical payment custody cannot be inferred safely.
- Current client-side multi-write flows can partially succeed.
- Role/UI/RLS behavior does not yet match the V1 permission matrix.
- Designing new migrations before reconciling missing schema history could break clean deployments or live data.
- Pickup closure remains a product decision and must not be guessed during implementation.

## Next action

Human review and explicit approval of `supabase/migrations/0015_payment_gate_v1.sql`. After approval: apply the migration, verify Cash, Check, Credit Card confirmation, Bank Transfer confirmation, Quote, and mixed pending/received balance behavior, then complete the remaining Sprint 1 gates. Do not begin Sprint 2.

## Maintenance

Follow `WORK_RULES.md` and `KAIRI_GIT_BRANCH_SAFETY_PROTOCOL.md`. Future state claims must be checked against `main`, application code, committed migrations, and approved product decisions.
