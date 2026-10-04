# Tasks

## V1 UI completion pass — current scope

UI-only user contract supersedes sprint implementation for this pass. Ten requested UI areas are prepared/preserved: payment, routing, Cutter, Office, receipt, readiness, pickup, installer, installation evidence and closure. New WorkflowUI uses existing readable orders/items/payment data. Intended ownership is distinguished from persisted owner; no automatic transitions are simulated.

CutterWork now presents UI-only drafts and does not call pending instruction RPCs. Unavailable confirmation/acceptance/closure actions are disabled. Photos are explicitly local previews only. Existing Sprint 1 UI is preserved. Ten concise backend entries are in PENDING_MIGRATIONS/UI_PASS_*.md. Earlier migration/test files are untouched by this pass.

DEFERRED: Existing Cutter browser fixture still models the earlier RPC-based screen; not changed or executed.

DEFERRED: Live operational acceptance and physical-printer verification are outside this UI-only contract. No network, Production, schema, RLS, migration or test-script work performed. Next: UI review, then separately authorized backend work. SOT checkboxes were not changed.


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


## Current task override — Sprint 1 and separate migrations sprint

- Sprint 1: 23/23 implementation boxes; three newly completed locally. Production acceptance is deferred, not passed.
- M1: collect drafts, inspect schema/recovery path, review exact revisions, approve and apply by dependency, deploy compatible UI, then run acceptance cases.
- Draft: supabase/pending_migrations/sprint1_atomic_order_creation.sql. Preflight: supabase/checks/sprint1_atomic_order_preflight_readonly.sql.
- Verify 0015 rather than rerun automatically. Correct 0016's Roman exception during Sprint 2 before M1 inclusion.
- No commit/push/deployment performed. Older ACTIVE entries below are superseded where inconsistent.


## ACTIVE

- Sprint 1 Validation B passed with no blockers; Sprint 1 is complete.
- Sprint 2 migration `0016_initial_item_routing_v1.sql` was committed and pushed for review at `06d2d9e`; it is not applied.
- Local 0016 correction and minimal UI integration are in progress on `main`; production migration remains unapplied.
- Approved production cleanup removed 50 orders before 2026-09-01; 21 later orders remain. Three active items in those retained orders still lack received payment.
- User journeys are deferred until all Sprint code and migration changes are complete.
- The corrected 0016 (SHA256 `7B473CD1DD7A530047F5812AC292CFC27446F53589977624CB8682721BB42569`) was explicitly approved for production, but remains unapplied: browser policy blocked access to the local SQL file for exact transfer. Manual execution and verification are pending.

## SPRINT 1 RUN 1.2

[x] Cash/Check orders remain non-operational until the received payment insert succeeds
[x] `CHATGPT_WORKSPACE/TEMP_ANS.md` supervisor report added
[x] Workspace state synchronized with the preparation commit and migration/test facts

## SPRINT 1 RUN 1.3

[x] Draft-to-operational transition requires an existing received payment in the database
[x] Pending-payment operational release still requires the confirmation RPC marker and a received payment
[x] Confirmation RPC order remains compatible: payment update, transaction marker, then order release
[x] Run 1.2 checkpoint `3160633` verified committed and pushed to `origin/main`
[x] Run 1.3 checkpoint `952114d` verified committed and pushed to `origin/main`

## SPRINT 1 VALIDATION B

[x] Check received-payment gate and balance verified with TEST order `#9078`
[x] Bank Transfer pending-to-Admin-confirmation flow verified with TEST order `#9079`
[x] Mixed received/pending/rejected balance counts received only
[x] Sales confirm/reject RPC calls denied with `42501`; Admin confirmation succeeds
[x] Sprint 1 Validation B passed with no blockers

## SPRINT 2 ITEM ROUTING

[x] Revalidated the production item schema and current New Order/import routing writes
[x] Defined authoritative post-payment routing state and owner per item
[x] Defined explicit Roman internal-fabric-cut exception without subtype inference
[x] Prepared and pushed migration `0016_initial_item_routing_v1.sql` for review (`06d2d9e`)
[x] Preserved Cash/Check, Office/Admin confirmation RPC, and paid-import compatibility
[x] Correct local Roman subtype checks (`רומי` is persisted) and classify legacy in-progress items separately
[x] Obtain explicit human approval for the corrected 0016 and production project
[ ] Apply the exact approved migration 0016 and verify it in production
[x] Add the Roman routing input and consume authoritative routing fields in operational UI
[x] Locally guard active unpaid/unrouted order advancement and false success history on rejected UI writes
[ ] Run post-migration routing, audit-history, permissions, and regression tests

## NEXT

- User to execute the exact approved 0016 manually in production SQL Editor and provide the result; then verify schema, data counts and routing without rerunning it.
- Run user journeys only after all Sprint code and migration changes are complete.
- Work on `main`; after a completed Sprint commit, request explicit approval before push.

## BLOCKED / OPEN DECISIONS

- Pickup handover and completion requirements are not defined.
- Cutter/Installer database-role strategy is not defined.
- Existing production schema cannot be reconstructed completely from committed migrations.

## SPRINT 1 CHECKLIST

[x] Git preflight passed on main
[x] Local main == origin/main at Sprint start
[x] Current payment implementation revalidated
[x] pay_later removed from V1 new-order flow
[x] V1 payment route type/options updated
[x] Pending payment amount preserved for card/transfer
[x] Payment status model implemented in migration
[x] Existing received payment history preserved safely
[x] Pending payment does not count toward paid balance
[x] Rejected payment does not count toward paid balance
[x] All payment/balance consumers reviewed
[x] Cash order requires deposit > 0
[x] Check order requires deposit > 0
[x] Cash creates RECEIVED payment
[x] Check creates RECEIVED payment
[x] Credit card requires requested deposit > 0
[x] Bank transfer requires requested deposit > 0
[x] Credit card creates PENDING payment request
[x] Bank transfer creates PENDING payment request
[x] Card/transfer order remains pending_payment before confirmation
[x] Quote creates no execution payment
[x] Quote items remain outside execution
[x] Office/Admin confirmation UI implemented
[x] Sales cannot confirm office payment
[x] Confirmation is enforced server-side
[x] Confirmation RPC is transactional
[x] Confirmation changes payment PENDING → RECEIVED
[x] Confirmation records actor + timestamp
[x] Confirmation advances order from pending_payment
[x] Confirmation writes order history
[x] Rejection flow implemented
[x] Rejection records reason + actor + timestamp
[x] Payment RLS reviewed and tightened only as required
[x] No Sprint 2 routing behavior implemented
[x] WORKFLOW_V1 remains consistent
[x] DECISIONS.md updated with pay_later decision
[x] PROJECT_STATE.md updated
[x] TASKS.md updated
[x] Relevant domain CHAT files updated
[x] npm run build passes
[x] Full diff reviewed
[x] No unrelated files changed
[x] Sprint 1 preparation commit `be4178b` exists on main
[x] Sprint 1 preparation commit pushed to origin/main
[x] Production migration explicitly approved
[x] Production migration applied successfully
[x] Cash use case verified
[x] Check use case verified
[x] Credit-card pending → confirmation verified
[x] Bank-transfer pending → confirmation verified
[x] Quote use case verified
[x] Balance verified with pending + received payments
[x] Final working tree reviewed
[ ] Final Sprint checkpoint committed on main
[ ] Final Sprint checkpoint pushed to origin/main
[ ] HEAD == origin/main after final push

## SPRINT 0 CHECKLIST

[x] Git preflight passed on main
[x] Local main verified against origin/main
[x] No active merge/rebase
[x] MAIN-ONLY Sprint policy documented
[x] KAIRI_GIT_BRANCH_SAFETY_PROTOCOL.md updated
[x] WORK_RULES.md updated
[x] PROJECT_CONTEXT.md revalidated and updated
[x] PROJECT_STATE.md revalidated and updated
[x] DECISIONS.md updated
[x] Current repository state revalidated
[x] WORKFLOW_V1.md created
[x] Payment states defined
[x] Order states defined
[x] Item states defined
[x] Current-owner model defined
[x] Legal transition map defined
[x] Illegal transitions defined
[x] Role/action permission matrix defined
[x] Cutter workflow defined
[x] Office/supplier workflow defined
[x] Goods Receipt skeleton defined
[x] Ready-order logic defined
[x] Pickup/track workflow defined
[x] Installation workflow defined
[x] Final closure workflow defined
[x] Logging/audit contract defined
[x] Future V1 exclusions documented
[x] No application behavior changed
[x] No migration created
[x] No production data changed
[x] Full diff reviewed
[x] Build passes

## DONE BEFORE SPRINT 0

- Order V1 Phase A order-form and execution-selection UX is merged into `main`.
- Feature-flag infrastructure and administration are documented as completed and manually verified in `docs/HANDOFF.md`.

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