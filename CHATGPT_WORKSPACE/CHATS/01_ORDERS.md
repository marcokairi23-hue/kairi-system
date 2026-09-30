# Orders

## Scope

- Order creation
- Order editing
- Order items
- Accessories
- Payments
- Order and item status flows

## Startup

Before starting work, read `../PROJECT_CONTEXT.md`, `../WORK_RULES.md`, `../KAIRI_GIT_BRANCH_SAFETY_PROTOCOL.md`, and this file.

## Current context

Order V1 Phase A is implemented on `codex/order-page-layout` and remains uncommitted. New/edit forms provide `מלא הכל` and `מלא חלקי`; selected items determine item total, wall width, and a suggested but editable `final_total`. The selection dialog preserves every unselected item while marking it outside current execution.

New-order routing uses stable frontend codes. Cash/check create the existing received-payment row and enter the operational flow through internal `ready`. Credit card, bank transfer, and pay later use `pending_payment` without creating a fake received payment. Quote items are preserved with `for_execution = false`. The duplicate submission-time execution selection was replaced by a short confirmation.

## Open issues

- Manual mobile, desktop, and RTL verification of Phase A is pending.
- Pending deposit requests and cash/check custody require Phase B schema support.
- The office `pending_payment` flow still needs Phase B alignment with automatic routing after confirmed collection.
- The long-term relationship between “advance” and “items” is undecided.

## Decisions

- Full/partial execution selection is canonical for Phase A.
- `final_total` remains semi-automatic and manually editable.
- Accessories remain order-level and outside partial selection.

## Next action

Human-review new/edit order behavior and routing, then implement the approved Phase B payment/custody model.
