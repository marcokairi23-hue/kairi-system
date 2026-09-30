# Orders

## Scope

- Order creation and editing
- Order items and accessories
- Payments
- Order and item status flows

## Startup

Before starting work, read `../PROJECT_CONTEXT.md`, `../WORK_RULES.md`, `../KAIRI_GIT_BRANCH_SAFETY_PROTOCOL.md`, and this file.

## Current context

Sprint 1 New Order + Payment Gate code is prepared on `main` and is stopped before production migration application.

- New-order routes are exactly `cash`, `check`, `credit_card`, `bank_transfer`, and `quote`; `pay_later` is no longer offered.
- Cash/Check require a positive deposit and create a received payment.
- Card/Transfer require and preserve a positive requested deposit, create a pending request, and leave the order in `pending_payment`.
- Quote creates no payment and sets all items outside execution.
- Pending Order Detail shows request facts to Sales and explicit confirm/reject actions only to Office/Admin.
- Generic received-payment entry is limited to Cash/Check; pending card/transfer confirmation uses the authoritative RPC.
- Every displayed paid/remaining total uses received payments only.

## Pending gate

- Migration `0015_payment_gate_v1.sql` is not applied to production.
- End-to-end use-case verification must wait for explicit migration approval and successful application.
- Do not commit/push the Sprint checkpoint until every Sprint 1 checklist item is complete.

## Next action

Review and approve migration `0015`, then verify all five new-order routes and received-only balance behavior. Do not begin Sprint 2 routing.
