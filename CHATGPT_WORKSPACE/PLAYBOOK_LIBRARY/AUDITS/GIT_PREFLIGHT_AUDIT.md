# Git Preflight Audit

## Purpose

Verify that a repository is safe for an approved branch operation before any branch is created, moved, rebased, reset, merged, or recovered.

## Read-only checks

```text
git status
git branch --show-current
git log --oneline -5
git branch -a
git rev-parse HEAD
git rev-parse origin/<stable-branch>
```

After approval to update remote references, run `git fetch origin`, then repeat the relevant comparisons.

Also check repository metadata for an active merge, rebase, cherry-pick, or revert. Do not remove metadata during the audit.

## Pass conditions for new branch creation

- Current branch is the expected stable branch.
- Working tree is clean.
- Local stable HEAD exactly matches the verified remote stable HEAD.
- No merge, rebase, cherry-pick, or revert is active.
- Proposed branch name does not already exist locally or remotely.
- No unexpected divergence is present.

## Failure behavior

If any condition fails:

1. Stop.
2. Do not pull, reset, rebase, merge, clean, delete, or repair automatically.
3. Report the failed condition, relevant refs, and affected paths.
4. Preserve unrelated files and branch history.
5. Request explicit approval for a narrowly defined recovery action.

## Audit output

```text
STATUS: PASS / FAIL
Current branch:
Working tree:
Local stable HEAD:
Remote stable HEAD:
Heads match:
Active Git operation:
Target branch exists:
Failure reason:
Next safe action:
```
