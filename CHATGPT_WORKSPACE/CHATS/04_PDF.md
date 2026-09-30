# PDF

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
