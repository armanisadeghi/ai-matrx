---
status: active
updated: 2026-08-17
repos: [matrx-frontend, aidream]
vision: []
---

# Surface ↔ Agent AI binding — from AI-mapped bindings to AI-built surface agents

## Vision — Arman's words (2026-08-17, condensed)

- Step 1: an agent that "automatically does the full binding by getting the list of context values and all of the page's capabilities and then the agent the user wants to map, and returns the full configurations" — a tab with a button that runs it and shows resulting configs "that you can either accept, edit, or just do it manually still."
- Step 2: "very much like our agent build new using AI" — a button ON the surface where the user describes what they want and a specialist agent **builds a custom agent for this surface**, given all surface values and especially the write targets (the things that get triggered on the surface). "I'm guessing this agent would actually be an orchestra / conductor": one member builds the agent definition, another defines the output schema and creates a kind via the content-IR system, another creates the shape (custom results component). The result is available immediately.
- Step 3: trigger **Assists** from this system — auto-detect the need for new agents for the user, or that existing mapped agents' configurations need reconsidering.
- The problem underneath all of it: "users do not use context slots a lot, and if context slots are used properly it allows the agent to instantly have visibility for the things it needs to see, and it can also help remove things we don't want the agent to see… expose and utilize all of those advanced techniques, which users are currently not using because it's complicated even for me."

## Phase 1 — AI-mapped bindings (SHIPPED 2026-08-17)

- DB agent **Surface Binding Mapper** `1cc19e9f-189d-43f6-b902-3c692346cab1` (builtin, structured output; created via `agent_author`). Slot **`surfaces_client.binding_mapper`** declared in aidream `services/agent_slots/client_slots.py` (merged, aidream PR #88) and seeded live in `agent.slot_definition`.
- FE: `features/surfaces/utils/binding-suggestions.ts` (pure payload/parse/convert core, referential validation against declared names), `features/surfaces/components/bind/BindingSuggestionsTab.tsx` (run → review rows with confidence + plain-language reasons → accept into the manual editor), tabbed step 2 in `SurfaceAgentBindPanel` ("AI map" default for new binds / "Map manually"). Accepted write-policy suggestions layer over prior-tier stored policies at save.
- The agent's DB prompt carries the **context-slot doctrine**: context slots are mapped aggressively to rich values (visibility), variables conservatively; `typical_char_count` guards context bloat; `unmapped` is used deliberately to keep noise away from the agent.

Remaining polish candidates: per-row accept/reject (today it's accept-all-then-edit); feed `agent_surface` role bindings the same treatment; a compact rerun affordance inside the manual tab.

## Phase 2 — "Build me an agent for this page" (NOT STARTED)

Entry: a second action in the surface Agents chrome panel (`SurfaceAgentsPanelImpl`) — "Create an agent for this page". User describes what they want in plain language; an orchestrated builder produces a ready-to-run, already-bound agent.

- Reuse, do not fork: the trained builder behind `agent_author` / the agent-creation-studio (see `common-docs/systems/agent-creation-studio/`), the Orchestra/conductor primitives (`features/agents` orchestras; `orchestras.role_describer` slot is a live client exemplar), the content-IR kind seeding recipe (`workflow-io-kinds` skill; `features/content-ir/` + `kind_surface`/`kind_component` assets and the `shape-system` skill for the results component).
- Suggested decomposition (Arman's): conductor + three members — (1) surface-agent definition builder (input: surface values + write targets + user's description; output: full agent definition with **context slots first-class**), (2) output-schema + kind creator (registers the kind so results render canonically), (3) shape/component creator (`kind_component` asset). Then auto-bind via the Phase-1 mapper and `bindAgentToSurface`.
- Every generated definition must follow agent-slots / hardcoded-prompt law: definitions live in the DB; the client holds slot keys and ids only.

## Phase 3 — Assists producers (NOT STARTED)

- Producer A: detect surfaces the user runs agents on with empty/never-supplied context slots or heavily `prompt_user`-mapped bindings → assist chip "Let AI remap this agent to the page" → opens the Phase-1 tab pre-run.
- Producer B: detect repeated manual patterns on a surface with no bound agent → assist chip "Create an agent for this page" → Phase-2 flow.
- Follow `features/assists/FEATURE.md` producer contract (`dedupe_key`, `assist_priority(band, rank)`, intentional-action law). Server-side sweeps belong in aidream `services/suggestion_sweeps/`-style producers.

## Known blockers / risks

- Platform bug `fd99a0cf-43d3-4eb8-8eab-9105a84659d4`: `agent_author`-created agents never enter `agent.card`, so a Phase-2-generated agent would not LIST on the surface (menu_surface joins agent.card) except for its creator, and global/org binds are refused. Must land before Phase 2 ships to non-admins.
- Slot seeding: `surfaces_client.binding_mapper` was mirror-seeded in the DB matching the declaration; the next aidream boot re-syncs code-owned columns (expected no-op). The seed agent is `builtin` but MCP-created — if the system-agent sweep flags ownership, promote via `agx_duplicate_agent(p_as_system=>true)` and repin.

## Resources

- Quick-bind chain: `features/surfaces/FEATURE.md` Change Log 2026-08-16/17 entries.
- Slot system SoR: `common-docs/systems/agent-slots/FEATURE.md`; variable binding SoR: `common-docs/systems/agent-variable-binding/FEATURE.md`.
- Mapper agent run cost observed: ~$0.012 / proposal (gemini-3.1-pro, ~4.3k tokens).
