# Playbook Library

`PLAYBOOK_LIBRARY/` is the reusable cross-project knowledge layer.

- `SKILLS/` — reusable methods
- `WORKFLOWS/` — end-to-end repeatable processes
- `AUDITS/` — repeatable verification and check procedures
- `TEMPLATES/` — reusable structures or document formats
- `FEATURES/` — reusable product or implementation patterns
- `PROMPTS/` — reusable agent prompts

Project-specific state stays in `CHATGPT_WORKSPACE/`. Reusable knowledge belongs in `PLAYBOOK_LIBRARY/` only after review and explicit approval.

## Initial assets

- `SKILLS/PROJECT_STATE_SKILL.md`
- `WORKFLOWS/SAFE_GIT_BRANCH_WORKFLOW.md`
- `AUDITS/GIT_PREFLIGHT_AUDIT.md`
- `TEMPLATES/PROJECT_CONTEXT_TEMPLATE.md`
- `FEATURES/SCREEN_MANAGEMENT_PATTERN.md`
- `PROMPTS/CODEX_SAFE_BRANCH_PROMPT.md`

## CANDIDATE BACKLOG

| Name | Suggested category | Evidence / relevant files | Why it may be reusable |
|---|---|---|---|
| `ORDER_STATUS_HISTORY_LEDGER` | `FEATURES` | `supabase/migrations/0001_initial_schema.sql`, `supabase/migrations/0009_history_rls_ownership.sql`, status-changing files under `src/pages/orders/` and `src/pages/items/` | Models order- and item-level transitions with actor, time, before/after status, notes, and ownership-aware access. |
| `ATOMIC_ORDER_NUMBER_ALLOCATION` | `FEATURES` | `allocate_order_number` in `supabase/migrations/0001_initial_schema.sql`, `src/pages/orders/NewOrder.tsx`, `supabase/migrations/0014_woocommerce_order_ingest.sql` | Moves sequential number allocation into the database and supports transactional callers; reusable after concurrency and repeated-call behavior are reviewed. |
| `CLIENT_DRAFT_IDEMPOTENCY` | `WORKFLOWS` | Unique `orders.client_draft_id` in `supabase/migrations/0001_initial_schema.sql`; idempotent import use in `supabase/migrations/0014_woocommerce_order_ingest.sql` | A client-supplied unique key can prevent duplicate creation during retries or offline synchronization. No implemented UI autosave pattern was found, so autosave is not included in this candidate. |
| `DOCUMENT_SNAPSHOT_AND_LIVE_COPY` | `WORKFLOWS` | Order snapshot columns in `supabase/migrations/0001_initial_schema.sql`, `supabase/migrations/0007_order_pdf_original_url.sql`, `src/lib/uploadOrderPdf.ts`, `src/pages/orders/NewOrder.tsx`, `src/pages/orders/OrderDetail.tsx` | Separates an original frozen document from a refreshable live copy while retaining shareable storage URLs. |
| `OWNERSHIP_AWARE_SUPABASE_RLS` | `AUDITS` | RLS policies in `supabase/migrations/0001_initial_schema.sql` and `supabase/migrations/0009_history_rls_ownership.sql`; `docs/PERMISSIONS_MAP.md` | Provides a repeatable review pattern for admin/office access, owner-scoped sales access, and policy alignment across related tables. |
| `PAYMENT_LEDGER_AND_DERIVED_BALANCE` | `FEATURES` | `payments` table in `supabase/migrations/0001_initial_schema.sql`, `src/pages/orders/PaymentModal.tsx`, payment aggregation in order/dashboard views | Records payments as separate events and derives paid/remaining totals instead of overwriting a single balance field. |
| `COMPOSITE_OPERATIONAL_ACTIVITY_FEED` | `FEATURES` | `src/pages/activity/ActivityLog.tsx`, `order_status_history` and `payments` tables | Merges independently stored status and payment events into one chronological, filterable operational feed. |

Role-based screen access and database-backed feature flags are already captured in `FEATURES/SCREEN_MANAGEMENT_PATTERN.md`, so they are not duplicated in the backlog.
