# Codex Safe Branch Prompt

```text
Perform a Git safety preflight and create a development branch only if every condition passes.

Rules:
- Do not modify project files.
- Do not commit, push, merge, rebase, reset, clean, or delete anything.
- Do not repair failed conditions automatically.
- Preserve all unrelated tracked and untracked files.

Inputs:
- Stable branch: <stable-branch>
- New branch: <new-branch>
- Remote: <remote>

Preflight:
1. Run git status and git branch --show-current.
2. Confirm the current branch is <stable-branch> and the working tree is clean.
3. Run git fetch <remote>.
4. Compare git rev-parse HEAD with git rev-parse <remote>/<stable-branch>.
5. Confirm no merge, rebase, cherry-pick, or revert is active.
6. Confirm <new-branch> does not exist locally or remotely.

Stop-on-failure behavior:
- If any check fails, stop immediately.
- Do not pull, reset, rebase, merge, delete metadata, or otherwise repair the repository.
- Report exactly which condition failed and the next safe action requiring approval.

Branch creation:
- If every check passes, create <new-branch> directly from <remote>/<stable-branch>.
- Do not configure it to track the stable branch.
- Verify the new branch HEAD equals <remote>/<stable-branch> and the working tree remains clean.

After creation:
- Do not commit, push, or merge without separate explicit approval.

Return:
STATUS: PASS / FAIL
Current branch:
Working tree clean:
Branch base commit:
Remote stable commit:
Base matches:
Failure reason:
Next safe action:
```
