# Tasks

## ACTIVE

- Review and explicitly approve `supabase/migrations/0015_payment_gate_v1.sql` for production application.
- Review Sprint 1 Run 1.3 changes; do not commit, push, or apply the migration in this run.

## SPRINT 1 RUN 1.2

[x] Cash/Check orders remain non-operational until the received payment insert succeeds
[x] `CHATGPT_WORKSPACE/TEMP_ANS.md` supervisor report added
[x] Workspace state synchronized with the preparation commit and migration/test facts

## SPRINT 1 RUN 1.3

[x] Draft-to-operational transition requires an existing received payment in the database
[x] Pending-payment operational release still requires the confirmation RPC marker and a received payment
[x] Confirmation RPC order remains compatible: payment update, transaction marker, then order release
[x] Run 1.2 checkpoint `3160633` verified committed and pushed to `origin/main`
[x] Migration remains unapplied and Sprint 1 remains incomplete

## NEXT

- After explicit approval, apply migration `0015`, run all Sprint 1 payment-route and balance use cases, review the final tree, then create the Sprint checkpoint.
- Do not begin Sprint 2.

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
[ ] Production migration explicitly approved
[ ] Production migration applied successfully
[ ] Cash use case verified
[ ] Check use case verified
[ ] Credit-card pending → confirmation verified
[ ] Bank-transfer pending → confirmation verified
[ ] Quote use case verified
[ ] Balance verified with pending + received payments
[ ] Final working tree reviewed
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
