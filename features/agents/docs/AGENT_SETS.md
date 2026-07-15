# Agent Sets (Orchestrators)

A **set** = one **orchestrator agent** presiding over **member agents**, each filling a gap in a bigger picture. Built entirely on the canonical `platform.associations` system — **there is no `agent_set` table.**

## Data model — zero new tables

`agent` is a registered entity token (`platform.entity_types` → `agent.definition`). A set is two kinds of association edge, written ONLY through the canonical chokepoint (`associationsService` → `assoc_add`/`assoc_remove`/`assoc_set_targets`):

| Edge | source → target | role | Carries |
|---|---|---|---|
| **Marker** | `agent:X` → `agent:X` (self-edge) | `matrx_set` | Set config in `metadata` (`accent`, `tagline`, `orchestratorPos`) + `label`. Its existence = "X is an orchestrator" (lets an **empty set persist**). |
| **Member** | `agent:X` → `agent:Y` | `member` | role title in the `label` column; `position` (order) + `metadata` (`gap` — the authored "what it does in this set" — and saved `pos`). |

**Direction is fixed: orchestrator = source, member = target.** This matches `assoc_set_targets` (operates from the source) and the org-auth gate in `assoc_add` (resolves org from the source agent's `organization_id`). The `(source, target, role)` unique key keeps the marker and member edges from ever colliding, and makes every write an idempotent upsert.

**The one read the assoc_* family lacks:** `agent_set_list()` (SECURITY DEFINER, `iam.has_org_access`-gated; `migrations/agent_sets_list_rpc.sql`) enumerates the caller's sets (marker rows) + member counts. A single set's full state loads via `associationsService.listForSources('agent', [orchId], 'agent')`, split by role.

The set's name/description ARE the orchestrator agent's — no duplicated identity. Tokens live in `agent-sets/constants.ts` (`AGENT_TOKEN`, `SET_MARKER_ROLE`, `MEMBER_ROLE`).

## Surfaces

- `/agents/sets` — list of all sets (the savior list view). Entry from `/agents/all` ("Sets") and the per-agent **Add to set** card action.
- `/agents/sets/[orchestratorId]` — the **builder**: library rail (drag/click to add) + a **React Flow hub-and-spoke canvas** (orchestrator hub, member spokes, animated edges; drag to reposition — positions persist) **or** a `@dnd-kit` sortable **Grid** view + a **member inspector** (author each member's role/gap).

## Generating an orchestrator (for users without one)

Most users won't already have an orchestrator agent. The flow is **create-then-build**, NOT a modal full of agents (agent selection belongs on the builder's canonical rail, never a cramped picker):

1. **Name it.** `/agents/sets` → **Generate orchestrator** → `GenerateOrchestratorDialog` is a QUICK name + accent prompt only. `useCreateOrchestrator` then **copies the "Agent Orchestrator" template** (`b06689e3…`) via `agx_create_agent_from_template` (POST `/api/agents/templates/[id]/use`) — a new agent owned by the caller, shipping the template's **empty `<available_agents>` placeholder** — renames it, creates the (empty) set, and opens the builder. Org: the copy is created org-less but the DB `_stamp_org_default` trigger backfills the caller's personal org (accessible) — the flow never overrides it (members can be shared/foreign-org).
2. **Add agents in the builder** on the canonical rail (search / Mine-Shared-All tabs / category-tag filters / peek / drag-drop) — the same system as `/agents/all`.
3. **Sync the prompt.** The builder detects a **template orchestrator** (`useOrchestratorPromptStatus`: its prompt has the `<available_agents>` markers) and shows a **Sync agent listings** action — with an amber pulse when the listed agent ids **differ from the current members**. It runs the Agent Description Generator (builtin `62d56534…`, HEADLESS via `launchAgentExecution` — ephemeral, `displayMode:"background"`, `autoRun:true`, vars in `runtime.variables`) on a `{id,name,description,output_schema,variable_definitions}` dump of the **current members** → `<agent>` blocks → injects them into `<available_agents>` (`syncOrchestratorPrompt`, marker-pre-checked before the slow LLM run).

Agents load ONCE across the whole surface via `useEnsureAgentsLoaded` (the canonical TTL-guarded `initializeChatAgents`) — **never** `fetchAgentsList` directly (that refetches every mount). Files: `agent-sets/orchestrator/{constants,orchestratorService,thunks,useCreateOrchestrator}.ts` + `hooks/{useEnsureAgentsLoaded,useOrchestratorPromptStatus}.ts`.

**Injection invariants (load-bearing):** the marker is `<available_agents>…</available_agents>` (`AVAILABLE_AGENTS_RE`). NEVER replace it with a plain string — LLM output contains `$`, which `String.replace` interprets (`$&`/`$1`/`$$`); use a **function replacer**. `extractAgentBlocks` strips markdown fences / `<agents>` wrappers / stray `<available_agents>` tags so re-sync stays idempotent. Absent marker → **loud failure**, never write a malformed prompt.

**Future — auto-add agents (documented, NOT built):** when a user creates a member agent FROM a template, auto-generate that agent's `<agent>` entry and append it to every orchestrator whose set it joins. See [`AGENT_SETS_ROADMAP.md`](./AGENT_SETS_ROADMAP.md).

## Runtime delegation — member-as-tool supervisor (P0+P1)

Running an orchestrator makes it **call its members as tools** and weave their outputs into one answer (the industry supervisor/worker pattern). This reuses aidream's EXISTING agent-as-tool pipeline end-to-end — no bespoke executor.

- **Server (aidream `services/agent_sets/`)** — `read_orchestrator_set()` resolves the set from `platform.associations` (marker + ordered members) via the ORM under `acting_as_user(ctx)`; `build_orchestrator_member_specs(agent_id, ctx)` returns one `AgentToolSpec(result_mode="inline")` per member (description = `role_title — gap`), or `[]` for a normal agent / empty set / non-`supervisor` mode. `prepare_agent_run` (`ai_execution/agent_run.py`) calls it right before `apply_unified_tools` and concatenates the specs onto `request.tools`. From there it's the standard `agent_projection.resolve_agent_specs` → `executor.py` `ToolType.AGENT` → nested child run → `inline` result path, with the existing recursion guard + cost spine. See `aidream/services/agent_sets/FEATURE.md`.
- **The orchestrator must be a tool-CALLING supervisor**, not the template's planner (which only emits a JSON dispatch plan and never delegates). So the **Generate orchestrator** flow overwrites a generated agent's messages with `ORCHESTRATOR_SUPERVISOR_PROMPT` + `ORCHESTRATOR_USER_TEMPLATE` (`orchestrator/constants.ts`, applied by `setOrchestratorMessages` in `useCreateOrchestrator`). The supervisor prompt keeps the `<available_agents>` marker so **Sync agent listings** still fills it. The user's template `b06689e3` is left untouched.
- **FE — Run.** A **Run** entry on the builder header (`SetBuilder`) + set-card hover row (`AgentSetCard`) routes to the canonical runner `/agents/:id/run` — no bespoke run surface (roadmap P1: "reuse the agent runner/chat").
- **Not yet built:** the live member-highlight on the canvas (light up the active member node during a run) — Phase 1's last bullet. Requires a run co-mounted with the canvas (or highlight on the runner); see the roadmap.
- **Deploy gate:** the aidream half ships in commit `153ad4291` but is **only live after aidream deploys**. The AI Dream MCP `agent_run` tool can smoke-test an orchestrator once deployed.

## Files

- `agent-sets/service/agentSetsService.ts` — thin service over the association chokepoint + `agent_set_list()`. **Owns no new mutation path.**
- `agent-sets/orchestrator/` — the "generate an orchestrator" flow (template copy + headless description-generator run + `<available_agents>` injection + set wiring; `GenerateOrchestratorDialog` is its UI).
- `agent-sets/redux/{slice,thunks,selectors}.ts` — `agentSets` read-model (list + per-set member/config cache; optimistic writes reconcile on error).
- `agent-sets/components/` — `SetBuilder` (shell), `SetBuilderCanvas` (+ `…Impl`), `AgentLibraryRail`, `SetMemberGrid`, `MemberInspector`, `AgentRoleCard`, `AgentSetCard`, `AddToSetMenu`, `CreateSetDialog`, `SetSettingsDialog`, `accents.ts`.
- `agent-sets/hooks/` — `useAgentSetsList`, `useAgentSet`.

## Invariants

- **No `agent_set` table, ever.** Membership is association edges. New write → reuse `associationsService`, never a bespoke RPC.
- **React Flow (`@xyflow/react`) lives ONLY in `SetBuilderCanvasImpl.tsx`**, reached via the `SetBuilderCanvas` `next/dynamic({ ssr:false })` wrapper. A static import anywhere else is a build-time leak — guarded by `reactFlowStaticImportBan` in `eslint.config.mjs`. See the `code-splitting` skill.
- **`agent` is a curated `ASSOCIATION_TARGET_TYPES` member** (`features/scopes/types.ts`) so agent→agent is a permitted edge.
- **Runtime delegation (P0+P1) is BUILT** (member-as-tool supervisor) — see the section below. Pipelines/DAG (Phase 2+) are still designed-for via `role`/`metadata`, not built. The full prioritized path is in [`AGENT_SETS_ROADMAP.md`](./AGENT_SETS_ROADMAP.md).
- **The library rail reuses the canonical agent filter** (`useAgentConsumer` + `makeSelectFilteredOwned/SharedAgents` + `<DesktopFilterPanel>`), never a bespoke list. Peek is **non-blocking**: `AgentPeekButton` opens `AgentSneakPeekContent` in a draggable `WindowPanel` (`AgentPeekWindow`, `dynamic()`-imported so `WindowPanel` stays behind the lazy boundary) — never a blocking modal. The inspector lazy-loads the full definition (`fetchFullAgent`) to show inputs + output type.
- **The canvas uses React Flow's own `useNodesState`** (a drag mutates only the dragged node — never re-derive the whole node list from a position-override map, which re-renders every node per drag tick); external changes reconcile via a `sig`-keyed effect. Click/drag bumps a monotonic `zIndex` so the active/expanded node rises above the rest. Controls are themed for dark mode in `set-builder-canvas.css`.
