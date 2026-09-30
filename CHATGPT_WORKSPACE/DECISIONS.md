# Decisions

| Date | Decision | Reason | Impact |
|---|---|---|---|
| 2026-09-30 | Keep ChatGPT working context under `CHATGPT_WORKSPACE/` on `codex/kairi-development`. | Separate AI working notes from application code and protect `main`. | Documentation-only files are added to the development branch; application behavior is unchanged. |
| 2026-09-30 | Use `מלא הכל` / `מלא חלקי` as the Phase A execution selection. | Give agents one clear, non-duplicated decision point. | Selected items drive item total, width, and execution flags; unselected data is preserved. |
| 2026-09-30 | Keep `final_total` semi-automatic and manually editable. | Agents need a suggested total without losing field discretion. | Full/partial selection populates a value but never locks the field. |
| 2026-09-30 | Cash/check move selected items directly into the operational flow from the user's perspective. | Customer payment has been accepted in the field. | Existing `ready` may remain only as the internal technical entry state; `in_production` is not used prematurely. |
| 2026-09-30 | Defer payment custody tracking to Phase B. | Current payments schema cannot distinguish agent-held funds from office receipt. | Phase A does not fake custody with existing fields. |
| 2026-09-30 | Preserve quote item data but keep quote items outside execution. | Measurements may be needed later without starting production. | Quote items are saved with `for_execution = false`. |
| 2026-09-30 | Keep accessories at order level in V1. | Accessory linkage is outside the approved workflow scope. | Accessories remain outside the partial-selection dialog and continue contributing to suggested total. |
