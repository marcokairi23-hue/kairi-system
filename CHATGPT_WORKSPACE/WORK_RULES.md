# Work Rules

- Before starting work, every domain chat must read, in order:
  1. `PROJECT_CONTEXT.md`
  2. `WORK_RULES.md`
  3. `KAIRI_GIT_BRANCH_SAFETY_PROTOCOL.md`
  4. Its own `CHATS/<domain>.md` file
- Before any Git branch, rebase, reset, merge, or recovery action, read `KAIRI_GIT_BRANCH_SAFETY_PROTOCOL.md`.
- Never work on `main`.
- Always check `git status` and the current branch before changes.
- Read `PROJECT_CONTEXT.md` before starting work.
- Do not commit without approval.
- Do not push without approval.
- Do not merge without approval.
- Do not rebase without approval.
- Do not run `git reset --hard` without approval.
- Do not make production Supabase changes without approval.
- Do not run production migrations without approval.
- Stop if local and remote Git history unexpectedly diverge.
- Reusable knowledge should be promoted to `PLAYBOOK_LIBRARY` only after review and explicit approval.

## Standard task lifecycle

`REVIEW → PLAN → APPROVAL → CHANGE → TEST → DIFF → COMMIT`
