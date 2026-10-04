# Project State

## Purpose

This file records verified current KAIRI SYSTEM state. Update it only from repository evidence or explicit project decisions.

## Current state

- Active development branch: `main`
- Normal Sprint strategy: MAIN-ONLY
- Sprint 0 baseline: `5b105e7bb60cd56928b5a650591f990182208611`, verified equal to `origin/main` before work
- Current phase: Sprint 1 complete; Sprint 2 initial item routing is at the migration safety gate
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

## Sprint 1 production validation state

- Preparation commit `be4178b` exists on `main` and has been pushed to `origin/main`.
- Run 1.2 checkpoint `3160633` exists on `main` and has been pushed to `origin/main`.
- Run 1.3 checkpoint `952114d` exists on `main` and has been pushed to `origin/main`.
- New-order routes are exactly Cash, Check, Credit Card, Bank Transfer, and Quote; `pay_later` is removed from new-order creation without rewriting historical data.
- Cash/Check require a positive deposit, start in non-operational `draft`, create a `received` payment, and move to `ready` only after that insert succeeds.
- Credit Card/Bank Transfer require and preserve a positive requested deposit, create a `pending` payment, and keep the order in `pending_payment`.
- Quote creates no payment and keeps all items outside execution.
- All application payment totals now count only `received` payments.
- Order Detail shows pending route, requested amount, remaining balance, and Office/Admin confirm/reject actions. Sales can view but cannot act.
- Migration `0015_payment_gate_v1.sql` adds the payment lifecycle, conservative historical backfill, server timestamps, ownership-scoped payment RLS, atomic confirmation/rejection RPCs, and database payment-gate guards.
- Run 1.3 strengthens its order trigger: `draft` cannot enter an operational status without a received payment, while `pending_payment` additionally requires the confirmation RPC transaction marker.
- The confirmation RPC remains compatible because it atomically marks the payment received before setting the marker and releasing the order.
- Migration `0015_payment_gate_v1.sql` was explicitly approved and applied exactly once to the production Supabase project on 2026-10-01.
- Production verification confirms the lifecycle columns, nullable `paid_at`, enum values, confirmation/rejection RPCs, and all three payment-gate triggers.
- Cash `#9070` and Check `#9071` reject zero deposits, persist received payments, then release to `ready`; balances are ₪900 and ₪890.
- Credit Card `#9072` and Bank Transfer `#9073` preserve pending amounts without reducing balance, then Admin confirmation records actor/time, history, and releases to `ready`.
- Quote `#9074` has no payment row, remains `quote`, and has no execution items.
- Order `0185f2c0-338f-4e23-bcbf-a35cd934319f` contains received ₪100, pending ₪200, and rejected ₪300; only ₪100 reduces its balance.
- Sales role RPC tests returned `42501` for both confirm and reject; Admin confirmation succeeded for both pending-route orders.
- Controlled TEST records were preserved for audit; browser testing produced no console warnings or errors.
- Final `npm run build` passes with the existing large-bundle advisory; the final diff is limited to the three workspace report files.
- Validation B Check `#9078` stored received ₪160 before `ready`; balance is ₪840.
- Validation B Bank Transfer `#9079` preserved pending ₪170 with full balance, then Admin confirmation recorded actor/time/history and released to `ready`.
- Mixed balance was reverified with received ₪100, pending ₪200, and rejected ₪300; only received reduces balance.
- Sales confirm/reject calls were reverified denied with `42501`; Sprint 1 has no remaining validation blocker.

## Sprint 2 item-routing safety-gate state

- Production `order_items.production_route` currently supports `internal`/`external`, is non-null with an `internal` default, and is written before payment approval by New Order and WooCommerce ingestion.
- The current schema has no explicit Roman own-fabric-cut flag, authoritative initial routing state, or routing owner; the legacy `item_status` tracks do not represent `awaiting_cut` and `awaiting_supplier_order` as a single canonical model.
- Migration `0016_initial_item_routing_v1.sql` was committed and pushed for supervisor review at `06d2d9e`; it has not been applied. It proposes an explicit Roman flag, routing state/owner, post-payment routing triggers, and per-item history.
- Local 0016 edits now recognize persisted `רומי`, reject null/non-Roman subtype for the explicit flag, and preserve progressed items as legacy rather than newly awaiting work. The corrected SQL is not committed or applied.
- Production cleanup approved by the user deleted 50 orders created before 2026-09-01 00:00 Israel time, with 94 items, 38 payments, and 503 history rows. Post-delete verification found 0 older orders and 21 retained orders; migration 0016 remains unapplied.
- The cleanup also removed payments/history, contrary to the full Sprint plan's general audit-preservation rule; it was separately authorized at the time. No further payment, history, or stock-movement cleanup is authorized.
- The user approved the corrected local 0016 (SHA256 `7B473CD1DD7A530047F5812AC292CFC27446F53589977624CB8682721BB42569`) for the production project. The 2026-10-01 read-only preflight still found no `routing_state` column and counted 21 orders, 25 items, 14 payments, and 45 history rows. Browser security blocked exact local-file transfer to the SQL Editor, so 0016 remains unapplied; manual execution/result and post-application verification are pending.
- Of the retained records, 14 active executable items remain; 3 lack a received payment (orders #9061, #9062, #9063), including 2 already progressed. These September orders were deliberately preserved by the approved cutoff. The proposed backfill keeps the progressed unpaid items `legacy_unverified` and blocks advancement pending review.
- Curtains route to `awaiting_cut`/`CUTTER`; shading routes to `awaiting_supplier_order`/`OFFICE_SUPPLIER`; Roman routes internally only when the explicit own-fabric-cut flag is true.
- Quotes, non-execution items, and unpaid orders remain `outside_execution` with no route or owner. Each item is evaluated independently after the received-payment gate.
- Cash/Check order release, Office/Admin payment confirmation, and already-paid operational imports are covered by database triggers in the proposed migration.
- Local 0016 now also blocks status advancement of active orders without a received payment or with unrouted executable items; operational UI hides unsafe actions and avoids success history when a guarded write fails. These changes remain unapplied and undeployed.
- Minimal Roman input and authoritative-route filtering are implemented locally; technical build passed. Runtime routing and user-journey tests remain outstanding. User journeys are deferred until all Sprint code/migration changes are complete.

## Verified contract gaps

- No explicit payment approval/custody state.
- No Cutter or Installer database roles; current roles are Admin, Office, Sales, and Viewer.
- Roman own-fabric routing input exists locally but is not deployed or runtime-verified.
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

The revised `0016_initial_item_routing_v1.sql` has exact-revision production approval but has not been executed. Await manual execution/result, then verify schema and backfill without rerunning it. Do not deploy UI before schema compatibility is established.

## Maintenance

Follow `WORK_RULES.md` and `KAIRI_GIT_BRANCH_SAFETY_PROTOCOL.md`. Future state claims must be checked against `main`, application code, committed migrations, and approved product decisions.

## 2026-10-01 — Approved 15-checkbox continuation checkpoint

STATUS: SAFETY_GATE; 7/15 verified (six Git checks plus exact-revision migration approval); 8 pending. Full plan now has 214 unchecked boxes.
GIT: main; fetch succeeded; HEAD = origin/main = c0b02769b030887b9dc16d79029b3f55b724655c; no merge/rebase metadata. Existing 21 modified files and untracked plan/presentation artifacts preserved; presentation work excluded from this Sprint.
APPROVAL: User authorized the proposed Sprint 2 continuation and TEST records in production. Existing exact 0016 SHA256 remains 7B473CD1DD7A530047F5812AC292CFC27446F53589977624CB8682721BB42569. Push/deployment remain separate gates.
TESTS: npm run build PASS (bundle-size warning); git diff --check PASS. Reviewed local routing SQL and UI diff; no live routing/permissions/E2E PASS claimed.
PRODUCTION: Dashboard identified kairi-os / ipcnyqkcvbvzmasmzaur / main PRODUCTION. It shows No backups. Local kairi_backup.sql is empty (0 bytes). Browser control disconnected while entering a read-only query; Run was not invoked and no query result obtained. Migration application state has NOT been reverified this turn.
FILES: Added supabase/checks/0016_preflight_readonly.sql; updated plan checkboxes and checkpoint documentation only. No application or migration SQL changes this turn.
NEXT: Restore browser access and establish a usable backup/recovery path; run read-only preflight, then continue the existing approved exact migration only if absent. No automatic rerun. Complete runtime cases and review before Sprint closure.
TEST_IDS: None created this turn. No migration, commit, push, or deployment performed.
## 2026-10-01 — Live preflight after browser recovery

Browser connection restored. Executed a read-only SQL SELECT in production project ipcnyqkcvbvzmasmzaur: routing_present=false; orders=21; items=25; payments=14; history=45. This confirms the routing column is still absent; 0016 was not executed this turn.
The Database Backups page explicitly states that the Free Plan does not include project backups. Local kairi_backup.sql remains 0 bytes. Direct connection UI requires an existing database password; local environment files currently expose only app anon configuration, with no database connection string available.
Pending user input: configure DATABASE_URL privately in ignored .env.local for a manual backup, or identify an existing current backup. No subscription upgrade or credential reset performed. Existing migration approval remains valid for the unchanged SHA256. No additional checkboxes marked complete: 7/15 verified, 214 open overall.