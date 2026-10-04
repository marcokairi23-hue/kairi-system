# PDF

## Current update — Part 2 locally implemented

Sprint 3: 12/18 implementation items; total original checklist 66/203 marked, 137 open. User explicitly chose activation AFTER printing by a separate confirmation. Draft creation/printing does not lock items; activation revalidates the snapshot and atomically locks selected items and writes audit. Pending cut is represented by order_items.cut_instruction_id, leaving legacy item_status unchanged until Part 3.

New scoped Cutter queue/UI and role draft, immutable instruction snapshots, server locks, same-instruction retry, popup failure handling and draft reopening are implemented. PostgreSQL/PGlite and mocked local-browser component tests passed. See TEMP_ANS.md for evidence and limitations. No Production changes, commit, push or deployment.

M1 must commit sprint3_cutter_role.sql before sprint3_cut_instructions.sql, after corrected 0016. No users were assigned the new role. Complete Part 3 actual-meters confirmation before operational deployment; Part 2 intentionally provides no unlock/advance operation.


## Scope

- PDF generation
- Storage
- Document consistency
- Sharing, email, and WhatsApp

## Startup

Before starting work, read `../PROJECT_CONTEXT.md`, `../WORK_RULES.md`, `../KAIRI_GIT_BRANCH_SAFETY_PROTOCOL.md`, and this file.

## Current context

Core files include `src/lib/generateOrderPdf.ts`, `src/lib/uploadOrderPdf.ts`, `src/lib/uploadSignature.ts`, `src/pages/orders/printOrder.ts`, and `src/pages/items/printWork.ts`.

## Open issues

- The latest work-order printing path from the Orders item dialog still needs the manual verification recorded in `docs/HANDOFF.md`.

## Decisions

- No new PDF behavior decision is recorded here.

## Next action

Verify generated customer and work-order PDFs against the documented order flow before changing implementation.
