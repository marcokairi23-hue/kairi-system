# PDF

## Scope

Order PDF generation, work-order printing, storage uploads, sharing, and signatures.

## Current context

Core files include `src/lib/generateOrderPdf.ts`, `src/lib/uploadOrderPdf.ts`, `src/lib/uploadSignature.ts`, `src/pages/orders/printOrder.ts`, and `src/pages/items/printWork.ts`.

## Open issues

- The latest work-order printing path from the Orders item dialog still needs the manual verification recorded in `docs/HANDOFF.md`.

## Decisions

- No new PDF behavior decision is recorded here.

## Next action

Verify generated customer and work-order PDFs against the documented order flow before changing implementation.
