## SPRINT 1 — RUN 1.2

STATUS:
Ready for commit review; no commit, push, or migration application performed.
CHECKBOXES:
Cash/Check safety, supervisor report, and workspace sync completed.
FILES:
`NewOrder.tsx`, `TASKS.md`, `PROJECT_STATE.md`, `TEMP_ANS.md`.
TESTS:
`npm run build` PASS; `git diff --check` PASS; `git status` reviewed.
RESULT:
Cash/Check release occurs only after a received payment is stored.
DECISIONS:
Use `draft` as the temporary non-execution state; no full creation RPC.
BLOCKERS:
Migration 0015 is not applied; end-to-end payment tests remain pending.
RISKS:
New Order remains a multi-write flow; failures can leave a safe partial draft.
NEXT:
Review Run 1.2 for commit; migration approval and E2E tests remain separate.

## SPRINT 1 — RUN 1.3

STATUS:
Ready for commit review; no commit, push, or migration application performed.
CHECKBOXES:
Database guard, bypass protection, RPC compatibility, and workspace sync completed.
FILES:
`0015_payment_gate_v1.sql`, `TASKS.md`, `PROJECT_STATE.md`, `TEMP_ANS.md`.
TESTS:
`npm run build` PASS; `git diff --check` PASS; migration diff reviewed.
RESULT:
Draft/pending orders cannot enter operations without a received payment.
DECISIONS:
Pending release also retains the transaction-local confirmation RPC marker.
BLOCKERS:
Migration 0015 is not applied; end-to-end tests remain pending.
RISKS:
SQL is statically reviewed only until an approved database application/test.
NEXT:
Review Run 1.3 for commit; migration approval and E2E tests remain separate.

## SPRINT 1 — FINAL VALIDATION

STATUS:
Production migration applied; all required Sprint 1 use cases passed.
CHECKBOXES:
Migration, Cash, Check, Card, Transfer, Quote, balance, and authorization verified.
MIGRATION:
`0015_payment_gate_v1.sql` applied exactly once; schema, RPCs, and guards verified.
TESTS:
Orders `#9070`–`#9074`; Sales confirm/reject denied with `42501`; browser errors none.
Received-only balance passed with received ₪100, pending ₪200, rejected ₪300.
RESULT:
Payment gate holds in production; only received payments release/reduce balance.
FILES:
`TASKS.md`, `PROJECT_STATE.md`, `TEMP_ANS.md`.
BLOCKERS:
None for final commit review.
RISKS:
Controlled TEST records remain in production for audit; New Order is still multi-write.
NEXT:
Supervisor review and explicit approval for final commit/push; do not start Sprint 2.

## SPRINT 1 — VALIDATION A

MIGRATION:
0015 APPLIED; required columns, RPCs, and triggers verified in production.
CASH:
PASS — positive deposit enforced; received ₪140, `paid_at` set, ready, balance ₪860.
CREDIT CARD:
PASS — pending ₪150 preserved with balance ₪1,000; Admin confirmation produced received/ready and history.
QUOTE:
PASS — no payment row, status `quote`, all items outside execution.
TEST ORDER IDS:
Cash `aed31baf-c3ad-44b9-a10d-7fd44fd9326d`; Card `1102ef61-c5fd-41b8-9b79-d4130841b539`.
Quote `938248b2-a522-4123-a019-26241c33f931`.
RESULT:
VALIDATION A PASS.
BLOCKER:
None.
NEXT:
Supervisor review; Check, Bank Transfer, and mixed Balance remain outside this validation.

## SPRINT 1 — VALIDATION B

CHECK:
PASS — received ₪160 stored before ready; `paid_at` set; balance ₪840.
BANK TRANSFER:
PASS — pending ₪170 kept full balance; Admin confirmation recorded actor/time/history and ready.
BALANCE:
PASS — received ₪100 reduced balance; pending ₪200 and rejected ₪300 did not.
PERMISSIONS:
PASS — Sales confirm/reject denied with `42501`; Admin confirmation succeeded.
TEST ORDER IDS:
Check `71740a12-1a66-4d39-8d0a-e9f2bc5b0243`; Transfer `578c72d9-4a96-4a01-9574-3e4e121676af`.
RESULT:
SPRINT 1 VALIDATION B PASS; SPRINT 1 COMPLETE.
BLOCKERS:
None.
NEXT:
Proceed to Sprint 2 initial item-routing analysis; stop at migration safety gate if required.

## SPRINT 2 — ITEM ROUTING

STATUS:
Migration safety gate; implementation stopped before application.
ROUTING MODEL:
Curtains → awaiting cut/CUTTER; shading → awaiting supplier order/OFFICE_SUPPLIER, per item after received payment.
ROMAN EXCEPTION:
Internal only with an explicit KAIRI-owned-fabric-cut flag; never inferred from subtype alone.
FILES:
`0016_initial_item_routing_v1.sql`, `TASKS.md`, `PROJECT_STATE.md`, `TEMP_ANS.md`.
TESTS:
Static migration review; `npm run build` PASS; `git diff --check` PASS. No runtime migration tests.
MIGRATION:
0016 created and NOT applied.
RESULT:
Authoritative DB routing design prepared with audit history and payment-gate compatibility.
BLOCKERS:
Explicit approval/application of 0016 is required before UI work and runtime validation.
RISKS:
Legacy status consumers remain until the approved migration and follow-up UI integration.
NEXT:
Supervisor migration review; do not apply, commit, push, or continue Sprint 2.

## SPRINT 2 — MIGRATION REVIEW

STATUS:
0016 pushed for review at `06d2d9e`; not applied. Sprint 2 continuation approved.
CHECKBOXES:
Roman subtype and legacy backfill reviewed statically; correction remains open.
FILES:
`0016_initial_item_routing_v1.sql`, `0011_shading_subtype_text.sql`, current order form and workspace reports.
TESTS:
Static code/schema review only; no migration execution or runtime tests.
RESULT:
`רומי` is stored, but 0016 checks `roman`; prior in-progress items may be labeled as awaiting work.
DECISIONS:
Revise 0016 and review data compatibility before application approval.
User-journey tests run after all Sprint code/migration changes.
BLOCKERS:
Separate approval required to apply corrected 0016.
RISKS:
Current 0016 must not be applied as reviewed.
NEXT:
Correct SQL and UI on `main`; perform technical checks before the migration gate.

## SPRINT 2 — IMPLEMENTATION CHECKPOINT

STATUS:
Local SQL/UI corrections on `main`; Sprint 2 incomplete; 0016 not applied.
CHECKBOXES:
Roman flag, per-item routing, legacy classification and operational filtering implemented locally.
FILES:
0016, order forms/details, item queues, routing helper, TASKS.md and PROJECT_STATE.md.
TESTS:
`npm run build` PASS; `git diff --check` PASS. No user journeys or migration execution.
RESULT:
31 active executable legacy items lack received payment and require reconciliation.
DECISIONS:
User journeys deferred until all Sprint code/migration changes are complete.
BLOCKERS:
Separate approval required before applying corrected 0016; runtime tests remain.
RISKS:
Deploy UI only with compatible schema; historical unverified items stay out of execution.
NEXT:
Review migration/data impact, then request explicit application approval.

## SPRINT 2 — PRODUCTION DATA CLEANUP

STATUS:
User-approved cleanup completed; 0016 not applied; Sprint 2 incomplete.
SCOPE:
Orders created before 2026-09-01 00:00 Israel time only.
DELETED:
50 orders, 94 items, 38 payments, 503 history rows; no other linked rows found.
VERIFIED:
0 older orders/linked rows remain; all 21 later orders remain.
REMAINING RISK:
3 active items in retained orders #9061–#9063 lack received payment; 2 progressed.
NEXT:
Review corrected 0016 and preserved September exceptions before migration approval.

## SPRINT 2 — PRE-APPLICATION REVIEW

STATUS:
Corrected 0016 remains local and unapplied; Sprint 2 incomplete.
CHECKS:
Reviewed workflow, order/payment writes, legacy backfill, Roman flag and route guards.
The order guard reads payment/items with fixed search_path and definer privileges.
RESULT:
Closed nullable route/owner CHECK gap; cancellation remains non-operational.
New item inserts now require `item_status=new` and no assigned worker, even before payment.
Active unpaid/unrouted orders cannot advance; operational UI fails closed on rejected writes.
TESTS:
`npm run build` PASS; `git diff --check` PASS. Runtime journeys deferred.
RISKS:
Orders #9061–#9063 remain without received payment; 2 items already progressed.
NEXT:
Explicit review and separate approval required before applying corrected 0016.
Local 0016 SHA256: `7B473CD1DD7A530047F5812AC292CFC27446F53589977624CB8682721BB42569`.

## SPRINT 2 — APPLICATION GATE

STATUS: Approved exact 0016 for production; not applied.
CHECKS: SHA256 unchanged; no DELETE/TRUNCATE; production `routing_state` absent.
BASELINE: 21 orders, 25 items, 14 payments, 45 history rows.
BLOCKER: Browser policy blocked exact local-file transfer; manual SQL execution needed.
AUDIT: Prior approved cleanup deleted 38 payments and 503 history rows; no further cleanup.
NEXT: Receive execution result, verify schema/backfill once; no rerun, commit or push.

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