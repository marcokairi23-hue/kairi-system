# Project Context

## Project purpose

KAIRI SYSTEM supports customer orders, item-level production and supplier routing, payments, installation, documents, activity, users, and feature-controlled screens.

The V1 objective is a stable end-to-end replica of the current operational workflow with minor improvements and minimum new complexity. `WORKFLOW_V1.md` is the authoritative workflow contract.

## Tech stack

- React 18, TypeScript, and Vite
- Tailwind CSS
- Supabase authentication, PostgreSQL, storage, RLS, and Edge Functions
- React Router
- `pdf-lib` and `html2canvas` for PDF workflows
- Cloudflare Pages deployment documented in `README.md`

## Main modules

- Authentication, profiles, and role-aware feature routing
- Dashboard and feature flags
- Orders, order items, payments, and status progression
- Production board and item work lists
- Fabrics
- Activity/history
- Users and settings
- PDF generation, storage, printing, sharing, and signatures

## Authoritative V1 workflow

`NEW ORDER → PAYMENT GATE → ITEM ROUTING → CUTTER / OFFICE → PRODUCTION → GOODS RECEIPT → READY → PICKUP / INSTALLATION → SIGNATURES → OFFICE/ADMIN CLOSURE`

The contract requires separate payment, order, item, owner, permission, timestamp, and immutable event dimensions. See `WORKFLOW_V1.md` for states, transitions, permissions, exclusions, evidence, and open decisions.

## Project chat hierarchy

### CONTROL_TOWER

- Owns coordination, priorities, approvals, task routing, and project status.
- Does not directly own implementation code.

### 01_ORDERS

- Order creation and editing
- Order items and accessories
- Payment gate and payment routes
- Order/item workflow and closure

### 02_DATABASE

- Supabase schema and migrations
- RPCs, transactions, and data integrity
- RLS and append-only audit enforcement

### 03_AUTH_RLS

- Authentication, profiles, roles, and permissions
- Feature flags and screen access

### 04_PDF

- PDF generation and storage
- Work instructions, receipts, reports, and installation print batches
- Sharing, email, and WhatsApp

### 05_UI

- Layout, RTL, forms, responsive behavior, and usability
- Workflow dialogs and prominent activity milestones

## Important files

- `CHATGPT_WORKSPACE/WORKFLOW_V1.md` — authoritative V1 operational contract
- `src/App.tsx` — routes and feature gates
- `src/lib/auth.tsx` — authentication context
- `src/lib/statusHelpers.ts` — current frontend status/routing helpers
- `src/pages/orders/` — current order/payment/installation flows
- `src/pages/items/` — current item and production flows
- `src/pages/activity/ActivityLog.tsx` — current merged status/payment activity view
- `supabase/migrations/` — committed database migration evidence
- `docs/HANDOFF.md`, `docs/SPEC.md`, `docs/BUSINESS.md`, and `docs/DEFECTS_MAP.md` — historical/product source documents

## Git workflow

- Normal approved Sprint work is MAIN-ONLY and occurs directly on `main`.
- Sprint branches are not used.
- Every Sprint follows `FETCH → VERIFY MAIN → WORK → TEST → DIFF → CHECKLIST → COMMIT → REQUEST PUSH APPROVAL → PUSH → SUPERVISOR REVIEW`.
- Historical `codex/kairi-development` and `codex/order-page-layout` refs may still exist, but they are not the active development location and must not be presented as current state.

## Verified repository baseline

- Sprint 0 started from clean `main` at `5b105e7bb60cd56928b5a650591f990182208611`, matching `origin/main` after fetch.
- The order-page V1 UX commit is already merged to `main`.
- Current code partially supports item routing, production tracks, activity, installer assignment, and two installation signatures.
- Major workflow gaps are documented in `WORKFLOW_V1.md`; Sprint 0 intentionally does not implement them.
- The committed migration chain does not fully declare every production column/status currently referenced by code, so migration reconciliation is required before schema implementation.

## Reusable knowledge and workspace layers

- `PLAYBOOK_LIBRARY` → reusable cross-project knowledge
- `CHATGPT_WORKSPACE` → KAIRI SYSTEM-specific context and state
- `CONTROL_TOWER` → coordination and routing
- `CHATS/` → domain execution context
- Promote reusable patterns to `PLAYBOOK_LIBRARY` only after review and explicit approval.

## Current next action

Review and explicitly approve `supabase/migrations/0015_payment_gate_v1.sql` for production application. Sprint 1 code is prepared but must not be committed, pushed, or treated as complete until the migration is approved, applied, and all payment-route use cases are verified end to end.
