# Project Context

## Project purpose

Kairi System supports the business workflow around customer orders, fabrics, production items, payments and activity, users, and feature-controlled screens.

## Tech stack

- React 18, TypeScript, and Vite
- Tailwind CSS
- Supabase authentication, database, storage, RLS, and edge functions
- React Router
- `pdf-lib` and `html2canvas` for PDF workflows
- Cloudflare Pages deployment documented in `README.md`

## Main modules

- Authentication and role-aware routing
- Dashboard and feature flags
- Orders, order items, payments, and status progression
- Fabrics
- Production/items
- Activity log
- Users and settings
- PDF generation, storage, printing, sharing, and signatures

## Project chat hierarchy

### CONTROL_TOWER

- Owns coordination, priorities, approvals, task routing, and project status.
- Does not directly own implementation code.

### 01_ORDERS

- Order creation
- Order editing
- Order items
- Accessories
- Payments
- Order and item status flows

### 02_DATABASE

- Supabase schema
- Migrations
- RPCs
- Transactions
- Data integrity

### 03_AUTH_RLS

- Authentication
- Profiles
- Roles
- RLS
- Feature flags
- Permissions

### 04_PDF

- PDF generation
- Storage
- Document consistency
- Sharing, email, and WhatsApp

### 05_UI

- Layout
- RTL
- Forms
- Responsive behavior
- Usability

## Important files

- `src/App.tsx` — application routes and feature gates
- `src/lib/auth.tsx` — authentication context
- `src/lib/supabase.ts` — Supabase client
- `src/lib/featureFlags.tsx` — feature evaluation and administration
- `src/pages/orders/` — order workflows
- `src/pages/items/` — item and production workflows
- `src/lib/generateOrderPdf.ts` — PDF generation
- `supabase/migrations/` — database migrations
- `docs/HANDOFF.md`, `docs/SPEC.md`, `docs/BUSINESS.md`, `docs/DEFECTS_MAP.md` — project source documents

## Reusable knowledge

- Reusable patterns are staged under `CHATGPT_WORKSPACE/PLAYBOOK/`.
- `PLAYBOOK_CREATOR` is responsible for identifying reusable candidates.

## Workspace layers

- `PLAYBOOK_LIBRARY` → reusable cross-project knowledge
- `CHATGPT_WORKSPACE` → Kairi System-specific context and state
- `CONTROL_TOWER` → coordination and routing
- Domain chats → execution by area

## Current branch

`codex/order-page-layout`

## Known issues

- Order V1 Phase A is implemented but remains uncommitted and requires manual browser verification.
- Pending credit-card/bank-transfer deposit amounts cannot be persisted safely until Phase B adds payment state.
- Cash/check custody cannot be tracked until Phase B adds custody fields and office-confirmation support.
- The overlap between the Orders “advance” and “items” actions still needs a product decision.
- The Production Board redesign is paused pending new design direction.

## Current next action

Manually verify Order V1 Phase A on mobile and desktop, review the uncommitted diff, then plan the approved Phase B payment/custody migration and RPCs.
