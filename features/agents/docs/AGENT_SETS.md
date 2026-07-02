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

Most users won't already have an orchestrator agent. The **Generate orchestrator** flow (`/agents/sets` header + empty-state CTA → `GenerateOrchestratorDialog`) builds one from a template. Pick the specialist agents to coordinate, name it, Generate. `useOrchestratorGenerator` then:

1. **Runs the Agent Description Generator** (builtin `62d56534…`, HEADLESS via `launchAgentExecution` — ephemeral, `displayMode:"background"`, `autoRun:true`, vars in `runtime.variables`) on a JSON dump (`{id,name,description,output_schema,variable_definitions}`) of the selected agents → the `<agent>` XML blocks.
2. **Copies the "Agent Orchestrator" template** (`b06689e3…` in `agent.template`) via `agx_create_agent_from_template` (POST `/api/agents/templates/[id]/use`) — a new agent owned by the caller.
3. **Names + wires it:** the template copy is created **org-less** (the RPC inserts `organization_id=NULL`), but the DB `_stamp_org_default` BEFORE-INSERT trigger backfills the caller's **personal org** (accessible), so `assoc_add`'s org gate passes. The flow deliberately does **not** override that org with a member's — members can be **shared** agents in a foreign org the caller can't access, which would break the set with no recovery. Renames it, then **injects** the generated blocks into the system prompt's `<available_agents>` section.
4. **Builds the set:** `createAgentSet` + `addAgentToSet` per member, then opens the builder.

The builder's **Sync prompt** action (`syncOrchestratorPrompt`) re-runs the generator + re-injects, so `<available_agents>` never drifts from the set's members — it **pre-checks the marker** before the slow LLM run. Files: `agent-sets/orchestrator/{constants,orchestratorService,thunks,useOrchestratorGenerator}.ts`.

**Injection invariants (load-bearing):** the marker is `<available_agents>…</available_agents>` (`AVAILABLE_AGENTS_RE`). NEVER replace it with a plain string — LLM output contains `$`, which `String.replace` interprets (`$&`/`$1`/`$$`); use a **function replacer**. `extractAgentBlocks` strips markdown fences / `<agents>` wrappers / stray `<available_agents>` tags so re-sync stays idempotent. Absent marker → **loud failure**, never write a malformed prompt.

**Future — auto-add agents (documented, NOT built):** when a user creates a member agent FROM a template, auto-generate that agent's `<agent>` entry and append it to every orchestrator whose set it joins. See [`AGENT_SETS_ROADMAP.md`](./AGENT_SETS_ROADMAP.md).

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
- **Phase 1 = structure + UI.** Runtime delegation (the orchestrator actually invoking members) is designed-for via `role`/`metadata` and lands later as an aidream contract — not built yet. The full prioritized path (P0 server-side set reader → member-as-tool supervisor → pipelines/DAG → hardening → polish) is in [`AGENT_SETS_ROADMAP.md`](./AGENT_SETS_ROADMAP.md).
- **The library rail reuses the canonical agent filter** (`useAgentConsumer` + `makeSelectFilteredOwned/SharedAgents` + `<DesktopFilterPanel>`), never a bespoke list. Peek is **non-blocking**: `AgentPeekButton` opens `AgentSneakPeekContent` in a draggable `WindowPanel` (`AgentPeekWindow`, `dynamic()`-imported so `WindowPanel` stays behind the lazy boundary) — never a blocking modal. The inspector lazy-loads the full definition (`fetchFullAgent`) to show inputs + output type.
- **The canvas uses React Flow's own `useNodesState`** (a drag mutates only the dragged node — never re-derive the whole node list from a position-override map, which re-renders every node per drag tick); external changes reconcile via a `sig`-keyed effect. Click/drag bumps a monotonic `zIndex` so the active/expanded node rises above the rest. Controls are themed for dark mode in `set-builder-canvas.css`.
