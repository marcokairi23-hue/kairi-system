# Work Rules

- Before starting work, every domain chat must read, in order:
  1. `PROJECT_CONTEXT.md`
  2. `WORK_RULES.md`
  3. `KAIRI_GIT_BRANCH_SAFETY_PROTOCOL.md`
  4. Its own `CHATS/<domain>.md` file
- All approved KAIRI SYSTEM Sprint implementation work is performed directly on `main`, unless the human explicitly requests another Git strategy.
- Before each Sprint, run the full Git preflight in `KAIRI_GIT_BRANCH_SAFETY_PROTOCOL.md`: status, branch, fetch, `HEAD == origin/main`, no merge/rebase, and expected working-tree state.
- During a Sprint, make only Sprint-scoped changes and do not perform unrelated cleanup.
- Read `PROJECT_CONTEXT.md` before starting work.
- Do not make production Supabase changes without explicit approval.
- Do not run production migrations without explicit approval.
- Stop if local and remote Git history unexpectedly differ; do not repair divergence automatically.
- Never force-push, rebase `main`, rewrite `main` history, or run `git reset --hard` as routine recovery.
- Do not merge, rebase, reset, delete branches, or perform exceptional recovery without explicit approval.
- Reusable knowledge may be promoted to `PLAYBOOK_LIBRARY` only after review and explicit approval.

## Sprint completion gate

- Sprint completion requires every Sprint checkbox to be complete.
- Required tests/builds must pass and the full diff must be reviewed.
- `CHATGPT_WORKSPACE` must be updated to the final verified state.
- An incomplete Sprint must not be committed or pushed.
- A completed Sprint ends with one clear checkpoint commit on `main` and a non-force push to `origin/main`.
- After pushing, verify local `HEAD == origin/main` and report the checkpoint for supervisor review.

## Standard task lifecycle

`REVIEW → PLAN → APPROVAL → CHANGE → TEST → DIFF → CHECKLIST → COMMIT → PUSH → SUPERVISOR REVIEW`
