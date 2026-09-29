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

## Current branch

`codex/kairi-development`

## Known issues

- `docs/HANDOFF.md` says the latest Orders UI changes still require manual browser verification.
- The overlap between the Orders “advance” and “items” actions still needs a product decision.
- The Production Board redesign is paused pending new design direction.

## Current next action

Manually verify the documented Orders flow in the browser, then confirm the intended relationship between the “advance” and “items” actions before changing behavior.
