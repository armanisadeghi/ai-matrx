# Agent Sets (Orchestrators)

A **set** = one **orchestrator agent** presiding over **member agents**, each filling a gap in a bigger picture. Built entirely on the canonical `platform.associations` system — **there is no `agent_set` table.**

## Data model — zero new tables

`agent` is a registered entity token (`platform.entity_types` → `agent.definition`). A set is two kinds of association edge, written ONLY through the canonical chokepoint (`associationsService` → `assoc_add`/`assoc_remove`/`assoc_set_targets`):

| Edge | source → target | role | Carries |
|---|---|---|---|
| **Marker** | `agent:X` → `agent:X` (self-edge) | `matrx_set` | Set config in `metadata` (`accent`, `tagline`, `orchestratorPos`) + `label`. Its existence = "X is an orchestrator" (lets an **empty set persist**). |
| **Member** | `agent:X` → `agent:Y` | `member` | `position` (order) + `metadata` (`roleTitle`, `gap` — the authored "what it does in this set" — and saved `pos`). |

**Direction is fixed: orchestrator = source, member = target.** This matches `assoc_set_targets` (operates from the source) and the org-auth gate in `assoc_add` (resolves org from the source agent's `organization_id`). The `(source, target, role)` unique key keeps the marker and member edges from ever colliding, and makes every write an idempotent upsert.

**The one read the assoc_* family lacks:** `agent_set_list()` (SECURITY DEFINER, `iam.has_org_access`-gated; `migrations/agent_sets_list_rpc.sql`) enumerates the caller's sets (marker rows) + member counts. A single set's full state loads via `associationsService.listForSources('agent', [orchId], 'agent')`, split by role.

The set's name/description ARE the orchestrator agent's — no duplicated identity. Tokens live in `agent-sets/constants.ts` (`AGENT_TOKEN`, `SET_MARKER_ROLE`, `MEMBER_ROLE`).

## Surfaces

- `/agents/sets` — list of all sets (the savior list view). Entry from `/agents/all` ("Sets") and the per-agent **Add to set** card action.
- `/agents/sets/[orchestratorId]` — the **builder**: library rail (drag/click to add) + a **React Flow hub-and-spoke canvas** (orchestrator hub, member spokes, animated edges; drag to reposition — positions persist) **or** a `@dnd-kit` sortable **Grid** view + a **member inspector** (author each member's role/gap).

## Files

- `agent-sets/service/agentSetsService.ts` — thin service over the association chokepoint + `agent_set_list()`. **Owns no new mutation path.**
- `agent-sets/redux/{slice,thunks,selectors}.ts` — `agentSets` read-model (list + per-set member/config cache; optimistic writes reconcile on error).
- `agent-sets/components/` — `SetBuilder` (shell), `SetBuilderCanvas` (+ `…Impl`), `AgentLibraryRail`, `SetMemberGrid`, `MemberInspector`, `AgentRoleCard`, `AgentSetCard`, `AddToSetMenu`, `CreateSetDialog`, `SetSettingsDialog`, `accents.ts`.
- `agent-sets/hooks/` — `useAgentSetsList`, `useAgentSet`.

## Invariants

- **No `agent_set` table, ever.** Membership is association edges. New write → reuse `associationsService`, never a bespoke RPC.
- **React Flow (`@xyflow/react`) lives ONLY in `SetBuilderCanvasImpl.tsx`**, reached via the `SetBuilderCanvas` `next/dynamic({ ssr:false })` wrapper. A static import anywhere else is a build-time leak — guarded by `reactFlowStaticImportBan` in `eslint.config.mjs`. See the `code-splitting` skill.
- **`agent` is a curated `ASSOCIATION_TARGET_TYPES` member** (`features/scopes/types.ts`) so agent→agent is a permitted edge.
- **Phase 1 = structure + UI.** Runtime delegation (the orchestrator actually invoking members) is designed-for via `role`/`metadata` and lands later as an aidream contract — not built yet.
