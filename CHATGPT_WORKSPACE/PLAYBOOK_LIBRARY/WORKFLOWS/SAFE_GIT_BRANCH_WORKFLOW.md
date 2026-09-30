# Safe Git Branch Workflow

Source pattern: `CHATGPT_WORKSPACE/KAIRI_GIT_BRANCH_SAFETY_PROTOCOL.md`.

## Goal

Create and deliver isolated branch work without silently changing the stable branch, hiding divergence, or broadening an approved Git action.

## Workflow

`FETCH → VERIFY → BRANCH → WORK → TEST → DIFF → COMMIT → PUSH → REVIEW → PR → MERGE`

### 1. FETCH

- Start from the repository’s stable branch.
- Confirm the working tree is clean.
- Run `git fetch origin`; do not use pull to hide or combine histories.

### 2. VERIFY

- Record the current branch and `HEAD`.
- Compare the stable branch with its remote reference.
- Check local and remote branch names.
- Confirm no merge or rebase is active.
- Stop if the tree is dirty, history diverges unexpectedly, or an operation is active.

### 3. BRANCH

- Use a unique, approved branch name.
- Create it directly from the verified remote stable-branch commit.
- Verify the new branch starts at that exact commit.

### 4. WORK

- Make only scoped changes.
- Preserve unrelated tracked and untracked files.
- Keep production and external-system writes within explicit approval.

### 5. TEST

- Run checks proportional to the change.
- Record failures and unresolved verification honestly.

### 6. DIFF

- Review staged, unstaged, and untracked files.
- Check for scope creep, generated files, secrets, credentials, and accidental edits.

### 7. COMMIT

- Commit only after approval.
- Stage explicit paths, verify the staged file list, and use the approved message.

### 8. PUSH

- Push only the current development branch after approval.
- Set its upstream if needed.
- Verify remote branch HEAD equals local HEAD.

### 9. REVIEW

- Review the remote diff and test evidence.
- Confirm the stable branch was not modified.

### 10. PR

- Open a pull request that states scope, risks, tests, and remaining questions.

### 11. MERGE

- Merge only after explicit approval and required checks.
- Verify the stable branch and remote state afterward.

## Stop conditions

Stop without automatic repair when any precondition fails, history is unexpected, the target branch already exists ambiguously, unrelated changes appear, or approval is missing. Report the exact state and request direction.
