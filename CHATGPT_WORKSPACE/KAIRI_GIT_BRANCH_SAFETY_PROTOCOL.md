# Kairi Git Branch Safety Protocol

## Previous branch incident

The temporary `codex/project-context` branch entered a confusing state: local `main` was behind `origin/main`, the local and remote temporary branch histories had diverged, and an empty `.git/rebase-merge` directory made Git report an active rebase. Recovery required preserving `main`, removing only verified-stale rebase metadata, deleting the temporary branch locally and remotely, and then explicitly aligning local `main` with `origin/main`.

## Root cause

Branch and rebase activity occurred without completing a clean fetch-and-verify preflight. This allowed local and remote references to represent different starting histories. Stale rebase metadata then obscured the real repository state.

## Mandatory preflight: FETCH → VERIFY → BRANCH

Before creating any development branch:

1. Run `git status` and `git branch --show-current`.
2. Confirm the current branch is `main` and the working tree is clean.
3. Run `git fetch origin`.
4. Record `git rev-parse HEAD` and `git rev-parse origin/main`.
5. Confirm local `main` exactly matches `origin/main`.
6. Check `git branch -a` and confirm the proposed branch name does not already exist.
7. Check that no merge or rebase is active.
8. Stop without repair if any condition fails; report the exact failure and request approval for recovery.

## Branch creation rules

- Never develop directly on `main`.
- Create a new branch only after the mandatory preflight passes.
- Create the branch directly from the verified `origin/main` commit.
- Prefer `git switch --no-track -c <branch-name> origin/main` for a new local branch.
- Verify the new branch HEAD equals `origin/main` before editing files.
- Do not reuse, overwrite, force-update, or delete an existing branch without explicit approval.
- Do not push a new branch until its changes, tests, and diff have been reviewed and push approval is given.

## Codex and agent Git safety rules

- Read this protocol and `PROJECT_CONTEXT.md` before Git operations.
- Report the current branch, working-tree state, and relevant commit IDs before risky Git actions.
- Do not commit, push, merge, rebase, reset, force-push, or delete branches without explicit approval.
- Do not pull as a substitute for understanding divergence.
- Do not modify `main` history or move `main` unless the exact action is explicitly approved.
- Do not combine recovery with unrelated cleanup or code changes.
- Preserve unrelated tracked and untracked files.
- Stop when local and remote history unexpectedly diverge.
- After every approved Git action, verify the branch, status, refs, and resulting history.

## `.claude/` local-only handling

- Keep `.claude/` local and untracked.
- Exclude it through `.git/info/exclude`; do not modify repository `.gitignore` solely for this machine-local configuration.
- Never stage or commit `.claude/settings.local.json`.
- Treat its tool permissions, absolute paths, tokens, webhook URLs, and other account data as sensitive.
- If a credential is exposed, revoke or rotate it and remove the sensitive value from local configuration.
- Do not delete or edit `.claude/` during unrelated Git cleanup.

## Recovery rules

- Stop all writes and inspect `git status`, the current branch, recent history, refs, and operation metadata.
- Record the commit IDs of `HEAD`, `main`, `origin/main`, and affected branches before recovery.
- Never merge, rebase, pull, reset, or force-push merely to make warnings disappear.
- Never reset `main` without explicit approval and a verified target commit.
- Remove rebase or merge metadata only when it is proven stale and the exact metadata removal is approved.
- Delete local or remote branches only when the exact branch is identified and deletion is approved.
- Never delete unrelated untracked files as part of recovery.
- Verify after recovery that `main` is preserved or explicitly aligned as approved, the working tree has the expected state, and no unintended refs changed.

## Standard workflow

`FETCH → VERIFY → BRANCH → WORK → TEST → DIFF → COMMIT → PUSH → REVIEW → PR → MERGE`

1. **FETCH** — Update remote references with `git fetch origin`.
2. **VERIFY** — Confirm branch, clean status, matching base commits, and no active Git operation.
3. **BRANCH** — Create a uniquely named development branch from `origin/main`.
4. **WORK** — Make only approved, scoped changes.
5. **TEST** — Run relevant checks and record results.
6. **DIFF** — Review all changed and untracked files for scope, secrets, and accidental edits.
7. **COMMIT** — Commit only after approval.
8. **PUSH** — Push only after approval; never force-push unless separately and explicitly approved.
9. **REVIEW** — Review the pushed diff and test evidence.
10. **PR** — Open a pull request with scope, risks, and verification notes.
11. **MERGE** — Merge only after approval and required checks; verify `main` afterward.
