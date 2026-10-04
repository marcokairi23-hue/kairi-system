# Orders

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


## Current override — Sprint 1 local implementation

NewOrder calls create_order_v1 for atomic creation including accessories/history. Balance excludes missing/unknown status. Tests and build pass locally. SQL and live acceptance are deferred to M1 by user instruction. Do not deploy before the RPC is installed. Earlier status notes below are historical.


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
