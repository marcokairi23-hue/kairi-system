# Kairi Git Safety Protocol

## Authoritative normal workflow: MAIN-ONLY

By explicit human decision, approved KAIRI SYSTEM Sprint work is performed directly on `main`. Sprint branches are not used.

Normal Sprint lifecycle:

`FETCH → VERIFY MAIN → WORK → TEST → DIFF → CHECKLIST → COMMIT → REQUEST PUSH APPROVAL → PUSH → SUPERVISOR REVIEW → NEXT SPRINT`

1. **FETCH** — Update remote references with `git fetch origin`.
2. **VERIFY MAIN** — Confirm branch, commit identity, working-tree state, and absence of an active Git operation.
3. **WORK** — Make only the approved Sprint-scoped changes.
4. **TEST** — Run every check required by the Sprint and record the result.
5. **DIFF** — Review all changed and untracked files for scope, secrets, and accidental edits.
6. **CHECKLIST** — Complete every Sprint checkbox and update `CHATGPT_WORKSPACE`.
7. **COMMIT** — Create one clear Sprint checkpoint commit only after all required checks pass.
8. **REQUEST PUSH APPROVAL** — Report the commit and ask the human for explicit push approval.
9. **PUSH** — Only after approval, push `main` to `origin/main` without force.
10. **SUPERVISOR REVIEW** — Report the checkpoint commit, validation evidence, risks, and open decisions.
11. **NEXT SPRINT** — Do not begin until directed by the human.

## Mandatory preflight before every Sprint

Run and verify, in order:

1. `git status`
2. `git branch --show-current`; the normal target is `main`.
3. `git fetch origin`.
4. Record `git rev-parse HEAD`.
5. Record `git rev-parse origin/main`.
6. Confirm `HEAD == origin/main`.
7. Confirm no merge is active.
8. Confirm no rebase is active.
9. Confirm the working tree has the expected state, normally clean at Sprint start.

If the current branch is not `main`, switch only when the working tree is clean and there is no unique unmerged work. Otherwise stop and report the exact state. If local `main` and `origin/main` differ or diverge unexpectedly, stop; do not repair automatically.

## Rules during a Sprint

- Work directly on `main` unless the human explicitly requests another strategy.
- Keep changes inside the approved Sprint scope; do not combine unrelated cleanup.
- Preserve unrelated tracked and untracked files.
- Do not pull, merge, rebase, reset, or rewrite history to make a warning disappear.
- Do not use force operations.
- Recheck status and operation metadata if repository state changes unexpectedly.

## Checkpoint commit and push gate

A Sprint may be committed and pushed only when:

- every Sprint checkbox is complete;
- all required tests and builds pass;
- the complete diff and changed-file list have been reviewed;
- only intended Sprint files changed; and
- `CHATGPT_WORKSPACE` records the final verified state.

Each completed Sprint ends with one clear checkpoint commit on `main`. After verifying that commit, request explicit human approval before pushing. Only after approval, push `main` to `origin/main`, refresh the remote ref, and verify local `HEAD == origin/main`.

Never:

- force-push;
- run `git reset --hard` as routine recovery;
- rebase `main`;
- rewrite `main` history;
- silently repair divergence; or
- commit or push an incomplete Sprint.

## Exceptional branch or recovery work

Branches are exceptional, not the normal Sprint workflow. Create, reuse, delete, or publish a branch only when the human explicitly requests that exact strategy.

The previous `codex/project-context` incident remains the recovery lesson: local and remote histories differed and stale `.git/rebase-merge` metadata obscured the repository state. For recovery work:

- Stop all writes and record `HEAD`, `main`, `origin/main`, relevant branch refs, status, and operation metadata.
- Preserve unique commits and all uncommitted work.
- Never merge, rebase, pull, reset, force-push, delete a branch, or remove operation metadata without explicit approval for the exact action.
- Remove merge/rebase metadata only after proving it is stale.
- Keep recovery separate from application or documentation changes.
- Verify branch, status, refs, and history after every approved action.

## `.claude/` local-only handling

- Keep `.claude/` local and untracked.
- Exclude it through `.git/info/exclude`; do not modify repository `.gitignore` solely for local machine configuration.
- Never stage or commit `.claude/settings.local.json`.
- Treat tool permissions, absolute paths, tokens, webhook URLs, and account data as sensitive.
- If a credential is exposed, revoke or rotate it and remove the sensitive value from local configuration.
- Do not delete or edit `.claude/` during unrelated Git cleanup.
