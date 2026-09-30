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
