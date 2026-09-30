# Project State Skill

## Purpose

Create and maintain a reliable `PROJECT_STATE.md` that lets a new contributor understand the verified current state without reconstructing it from chat history.

## Inputs

- Current repository branch, status, and recent history
- Approved project context and work rules
- Current task list, decisions, blockers, and test evidence
- Relevant implementation and operational documentation

## Method

1. Read the project context, work rules, task list, and decisions.
2. Verify the current branch, working-tree state, and relevant commit IDs.
3. Separate verified current state from plans, assumptions, and historical notes.
4. Record only facts supported by repository evidence or explicit decisions.
5. Link to source files instead of duplicating detailed implementation notes.
6. Record active work, next action, blockers, and pending verification distinctly.
7. Add dates only when the date itself is meaningful and verified.
8. Review the document after branch, task, blocker, release, or architecture changes.

## Recommended structure

```markdown
# Project State

## Verified baseline
## Active work
## Pending verification
## Blockers
## Next safe action
## Evidence and references
```

## Quality checks

- The branch and commit references still exist.
- “Done” items have evidence.
- “Blocked” items name the blocking condition.
- Planned work is not presented as implemented behavior.
- No secrets, personal data, machine paths, or temporary session details are included.
- Another contributor can identify the next safe action without the original chat.

## Anti-patterns

- Treating chat memory as evidence
- Copying a large backlog into project state
- Mixing desired architecture with current implementation
- Leaving temporary branch names or completed recovery states as current facts
- Recording credentials, production values, or local-only configuration
