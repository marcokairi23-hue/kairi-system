# Auth and RLS

## Scope

- Authentication and profiles
- Roles and permissions
- RLS and feature access

## Startup

Before starting work, read `../PROJECT_CONTEXT.md`, `../WORK_RULES.md`, `../KAIRI_GIT_BRANCH_SAFETY_PROTOCOL.md`, and this file.

## Sprint 1 payment authorization

Migration `0015_payment_gate_v1.sql` replaces the broad payment policies with:

- Admin/Office: read all required payments and insert valid V1 Cash/Check received rows or Card/Transfer pending rows.
- Sales: read and insert payment rows only for orders where `orders.agent_id = auth.uid()`.
- Sales received inserts: Cash/Check only, with the actor recorded as recorder and receiver.
- Sales pending inserts: Credit Card/Bank Transfer only, with no receiver or paid timestamp.
- No normal-role direct payment UPDATE/DELETE policy.
- Pending confirmation/rejection only through security-definer RPCs that re-check an active Admin/Office role.
- A database order-status trigger prevents direct advancement from `pending_payment`; a separate item trigger blocks item-status/worker advancement while payment is unapproved.

The UI mirrors these rules: Sales can see the pending request but cannot see confirmation/rejection controls. UI hiding is not the authority; the RPC and database guards are.

## Pending gate

The migration is not applied to production. Authorization and E2E behavior must be verified after explicit approval and migration application.

## Next action

Review the exact RLS/RPC SQL in migration `0015`, then test Office/Admin success and Sales denial against the live schema after approval.
