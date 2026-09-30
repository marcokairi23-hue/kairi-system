# Control Tower

## Purpose

`CONTROL_TOWER` owns coordination, priorities, approvals, task routing, and project status. It does not directly own implementation code.

## Responsibilities

- Confirm scope, priority, approvals, and current project state.
- Route implementation work to the appropriate domain chat.
- Track cross-domain dependencies and blockers.
- Keep `PROJECT_STATE.md`, `TASKS.md`, and `DECISIONS.md` aligned with verified outcomes.
- Enforce `WORK_RULES.md` and `KAIRI_GIT_BRANCH_SAFETY_PROTOCOL.md`.

## Domain routing

- Orders → `CHATS/01_ORDERS.md`
- Database → `CHATS/02_DATABASE.md`
- Authentication, RLS, and permissions → `CHATS/03_AUTH_RLS.md`
- PDF and document workflows → `CHATS/04_PDF.md`
- UI and usability → `CHATS/05_UI.md`

## Boundary

Implementation remains owned by the relevant domain chat. Cross-domain work returns to `CONTROL_TOWER` for coordination and approval routing.
