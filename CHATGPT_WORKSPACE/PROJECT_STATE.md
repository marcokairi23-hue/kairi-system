# Project State

## Purpose

This file records verified, current Kairi System project state. Update it only from repository evidence or explicit project decisions.

## Current state

- Project workspace: `CHATGPT_WORKSPACE/`
- Development branch: `codex/order-page-layout`
- Current phase: Order V1 Phase A implemented, uncommitted, awaiting human UI review.
- Task queue: `TASKS.md`
- Decision record: `DECISIONS.md`
- Coordination and routing: `CONTROL_TOWER.md`
- Domain execution context: `CHATS/`

## Phase A implemented

- Order-number display, centered add-item controls, width validation, split toggle, required city, and simplified new-order actions.
- Full/partial execution controls with selected count, width, fabric, and price summaries.
- Semi-automatic, manually editable `final_total`.
- Stable frontend payment-route codes; Bit removed from new-order choices.
- Cash/check route selected items through internal `ready`; quote items are saved as non-execution; other routes remain `pending_payment`.
- Duplicate submission-time item selection removed; build passes.

## Pending and blockers

- Manual mobile, desktop, and RTL browser verification is pending.
- Phase B payment/custody persistence is blocked on an approved migration and RPC implementation.
- Pending card/transfer deposit requests are not persisted in Phase A because the current schema would misclassify them as received.

## Current risks

- Existing payment rows have no payment-status or custody distinction.
- Historical cash/check custody cannot be inferred safely.
- The current client-side save sequence is not transactional.

## Next action

Complete human review of Phase A, then implement and validate the Phase B migration, RLS, balance filtering, and transactional RPCs.

## Phase B dependencies

- `payment_status`, `custody_status`, `recorded_by`, `office_received_by`, and `office_received_at` on payments.
- Nullable `paid_at`, conservative historical backfill, payment ownership RLS, and office-only custody confirmation.
- Transactional submission/finalization and office-receipt RPCs.

## Maintenance

Review this file when branch, task, blocker, or project status changes. Follow `WORK_RULES.md` and `KAIRI_GIT_BRANCH_SAFETY_PROTOCOL.md` before taking action.
