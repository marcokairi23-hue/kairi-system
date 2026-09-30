# Tasks

## ACTIVE

- Supervisor review of `WORKFLOW_V1.md`, repository gaps, and open decisions.

## NEXT

- Await human direction for Sprint 1; do not begin implementation automatically.
- Reconcile missing committed schema history before designing payment/workflow migrations.
- Resolve pickup closure, role representation, `pay_later`, and canonical state-code decisions.

## BLOCKED / OPEN DECISIONS

- Pickup handover and completion requirements are not defined.
- Cutter/Installer database-role strategy is not defined.
- `pay_later` is present in code but is outside the approved V1 payment-route list.
- Existing production schema cannot be reconstructed completely from committed migrations.

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
