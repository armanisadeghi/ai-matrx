# Legacy System Decommission — tracker

> Live, concise tracker for retiring the old systems whose DB tables were deleted in the 2026 reorg.
> One line per item. Status: ⬜ todo · 🔄 in progress · ✅ done · ⏸️ needs-user · ⚠️ careful.
> Companion: [project_db_reorg_health_audit] memory, [DB_TRANSITION_PENDING.md](./DB_TRANSITION_PENDING.md).

## Directives (from user — do not lose)
- **Old prompt system** → mostly GONE. But: (a) refs inside NEW modules usually mean "still on old prompt system → switch to agent system"; (b) some prompt **components are the best we have** — DON'T drop; transition into the agent system (run a list by user first); (c) AI integrations using an old **prompt ID / prompt shortcut** = EASY: the same UUID exists as an agent / agent-shortcut, just point usage at the agent system.
- **Old workflow system** → deprecated but **KEEP INTACT**; goal: get it to at least **render** (we love the UI; will rebuild the new system from it). Do NOT delete.
- **Old entities system (MASSIVE)** → **COMPLETE REMOVAL**, coordinated: slices, utilities, components, and the giant TS types (they slow the IDE). Ensure it does not sneak back in anywhere.
- Use small Sonnet subagents; adversarially double/triple-check; loop until verified nothing remains.

## Systems overview
| System | Disposition | DB tables | Status |
|---|---|---|---|
| Entities system | DELETE entirely (coordinated) | n/a (FE construct) | 🔄 mapping |
| Prompt system | Mostly delete; preserve best components → agent system; UUID-swap integrations | prompts/prompt_apps/prompt_versions/prompt_builtins/prompt_shortcuts (deleted) | 🔄 mapping |
| Brokers | Classify: new-module usage → agent/context; else delete | broker_values/data_broker (deleted) | 🔄 mapping |
| Workflow | KEEP, get rendering | workflow (graveyard) | 🔄 mapping |
| Recipe / automation / registered_function | DELETE (dead) | recipe*/automation_*/registered_function (deleted) | ⬜ |
| Dead DB legacy CRUD fns (~131) | DROP after FE cleanup | — | ⬜ |

## Easy UUID-swap items (prompt ID / shortcut → agent / agent-shortcut)
_(populate from discovery — these are quick wins)_
- ⬜ TBD

## Preserve-then-transition (best prompt/UI components → agent system) — NEEDS USER LIST
- ⏸️ TBD (compile list, confirm with user before moving/deleting)

## Entities system removal inventory
_(populate: slices, hooks, utils, components, types, routes; mark imported-by-new vs pure-legacy)_
- ⬜ TBD

## Open questions for user
- ⬜ TBD

## Change log
- 2026-06-27: tracker created; discovery agents dispatched.
