# Orchestras — Roadmap to Full Runtime Delegation

Status of the base system: **structure + builder UI shipped** (see [`ORCHESTRAS.md`](./ORCHESTRAS.md)). An Orchestra is an conductor agent + `platform.associations` edges; you can build/arrange/annotate one, but the conductor does **not yet run its members**. This doc is the prioritized path to make it real — written so another developer can pick up any phase cold.

**Mimic what already works.** The runtime target is the industry supervisor/worker pattern: OpenAI Swarm (handoffs), LangGraph (supervisor + state graph), CrewAI (sequential + hierarchical crews), AutoGen (group chat). Don't invent a new orchestration paradigm — implement one of these well. Recommended first: **member-as-tool supervisor** (cheapest to build on our existing agent-run + tool-call machinery).

---

## The load-bearing gap: the server can't read an Orchestra — CLOSED ✅

- **P0 — server-side Orchestra reader (aidream). DONE** (commit `153ad4291`, live after aidream deploys). `aidream/services/orchestras/orchestra_reader.py#read_orchestra(conductor_id, ctx)` reads the `orchestra` marker (mode/config) + ordered `member` edges via the `platform.associations` ORM under `acting_as_user(ctx)` → `Orchestra`. No RPC needed — the ORM + RLS cover it.

---

## Phase 1 — Runtime delegation MVP (member-as-tool supervisor) — DONE (optional items deferred)

Goal: run the conductor; it can call its members as tools and weave their outputs into one answer.

- **aidream — member-as-tool. DONE** (commit `153ad4291`). `build_conductor_member_specs` projects one `AgentToolSpec(result_mode="inline")` per member onto `request.tools` at the `apply_unified_tools` seam — reusing the EXISTING agent-as-tool pipeline (`resolve_agent_specs` → `executor.py` `ToolType.AGENT` → nested child run → recursion guard + cost spine). NO bespoke executor was needed; sub-runs nest with history/observability for free. `mode` gate: only `supervisor` (default) injects; `sequential`/`parallel`/`dag` reserved for Phase 2.
- **Supervisor prompt. DONE.** The template `b06689e3` is a PLANNER (emits a JSON dispatch plan, never calls tools) — incompatible with member-as-tool. Generated conductors get `CONDUCTOR_SUPERVISOR_PROMPT` (tool-calling supervisor, keeps `<available_agents>` marker) via `setConductorMessages`. User's template untouched.
- **FE — "Run the Orchestra". DONE.** Run entry on the builder header (`OrchestraBuilder`) + Orchestra-card hover (`OrchestraCard`) → canonical runner `/agents/:id/run`. No new run surface.
- **FE — live member highlight. DONE** (mount model chosen: **(a) embedded run panel inside the builder** — the real canvas lights up). Desktop Run opens `orchestras/run/OrchestraRunPanel` (embedded `AgentRunnerPage`, surfaceKey `orchestra-builder:${id}`) beside the canvas; `sub_agent` init/completion events (child `conversation_id` in init metadata → `initial_agent_id` lookup) drive per-member running/done/failed rings on the canvas + dots on the Grid. Mobile keeps the full-runner route. Details: `ORCHESTRAS.md` § Runtime delegation.
- **Optional (deferred):** per-member edge `metadata.handoff` / `member_version_id` (pin a version for reproducible runs). `AgentToolSpec` already supports `handoff` + `reference`/`inline_once` result modes for future use.

**Done when:** clicking Run on the flashcard Orchestra produces one orchestrated answer that visibly delegates to members (verifiable once aidream deploys — smoke-test via the AI Dream MCP `agent_run`), with each member's sub-run nested in the run history. Live-highlight is a separate follow-up.

---

## Phase 2 — Pipelines & routing (beyond a flat member list)

Today membership is flat (`conductor → member`). Real orchestration needs shape.

- **Relationship kinds.** Add `member → member` edges for pipelines/DAGs (deterministic output→input chaining) and conditional edges. Store the kind in edge `metadata` (`{ kind: 'sequential' | 'parallel' | 'conditional', order, condition }`); keep `role='member'` as the base. Register new roles only if a query needs to filter by them.
- **Orchestra modes. DONE (D-36, 2026-08-15).** `sequential` (pipeline, each member fed the original request + the previous member's output), `parallel` (fan-out + an conductor synthesis step), `dag` (per-member edge `metadata.depends_on` positions + `metadata.when`), `supervisor` (P1 member-as-tool). Stored on the marker (`OrchestraConfig.mode`, "How members run" picker in settings); compiled modes execute server-side as an AgentPlan → normal workflow run (aidream `services/orchestras/mode_compiler.py` + `plan_execution.py`). Remaining FE: an editor for member-edge `depends_on`/`when` (dag is server-ready; today the metadata must be authored via the association write path).
- **Input mapping editor (FE).** The inspector already shows each member's `variable_definitions` + output schema (built in the UI pass). Add an editor to map *sources* (conductor output field / a prior member's output field / an Orchestra-level variable / user input) → this member's variables. Persist in edge `metadata.inputMapping`.
- **Canvas edges become editable.** Let the user draw member→member connections on the React Flow canvas to define a pipeline (React Flow `onConnect`); today edges are read-only (conductor→member, `nodesConnectable={false}`).
- **aidream — DAG executor.** Execute members per mode + mapping; topological order for sequential/DAG, gather for parallel.

---

## Phase 3 — Correctness & hardening

- **Dangling members.** If a member agent is deleted/archived, the edge orphans. Confirm `_gc_entity_associations` cleans it, and render a "missing member" node instead of a blank card. (KNOWN: verify the GC trigger fires on `agent.definition` soft-delete.)
- ~~**Shared-member hydration.**~~ DONE 2026-08-08 — `loadOrchestra` diffs member ids against the `agentDefinition` slice and parallel-`fetchFullAgent`s the missing ones (`redux/orchestras/thunks.ts::hydrateMissingMemberAgents`; in-flight dedupe, fire-and-forget).
- **Cycle prevention.** Define rules for an conductor that is itself a member elsewhere, or a member pointing back at its conductor. Reject cycles at add time (FE guard + a server check when running).
- **Versioned runs.** Honor `member_version_id` so an Orchestra run is reproducible even as member agents evolve.
- **Auth.** `orchestra_list()` is org-gated (`iam.has_access`). Define cross-org shared-Orchestra behavior; confirm a run can execute members the caller can access but doesn't own.

---

## Phase 4 — Polish, sharing, analytics

- **Richer list cards.** `orchestra_list()` returns `member_count` only; the list cards show decorative dots. Extend the RPC (or a companion) to return the first N member ids/names/accents so cards show real member avatars.
- **Sharing an Orchestra.** Share the conductor + ensure members are reachable by the grantee (reuse `features/sharing/`). Define what "sharing an Orchestra" grants.
- **Orchestra-level context.** Scopes/variables shared across all members at run time (reuse `features/scopes/` + `features/agent-context/`).
- **Templates / duplicate.** "Save as Orchestra template" + clone-an-Orchestra (duplicate the conductor + re-create edges).
- **Mobile builder.** The canvas is desktop; the Grid view is the mobile builder — make sure add/reorder/inspect all work on the Grid path.
- **Bulk add.** "Add all filtered" / multi-select in the library rail.
- **Analytics.** Per-Orchestra run history, per-member success/cost, surfaced on the Orchestra detail (ties into `agent_run`).

---

## Shipped — Generate an conductor (template → descriptions → injection → Orchestra)

Users without an conductor get one generated: copy the "Agent Conductor" template, run the Orchestra Role Describer on the selected agents, inject the `<agent>` blocks into `<available_agents>`, wire the Orchestra. Details + injection invariants in [`ORCHESTRAS.md`](./ORCHESTRAS.md) ("Generating an conductor"). A **Sync prompt** builder action keeps the prompt in step with membership.

**Future — auto-add agents (NOT built).** The inverse automation: when a user creates a member agent (esp. FROM a template), auto-produce that agent's `<agent>` XML entry and **append it to every conductor set the agent joins**, instead of a full re-generate of all members. Design notes:
- Reuse `runAgentDescriptionGenerator` but for a SINGLE agent → one `<agent>` block; splice it into the conductor's `<available_agents>` (append, not replace) via a new `appendAvailableAgent(conductorId, block)` alongside the existing `injectAvailableAgents`.
- Trigger points: `addAgentToOrchestra` (a member joined → append its block) and the agent-create-from-template flow (a new specialist → offer to add it to an Orchestra).
- Keep a per-member marker (`data-agent-id`) in each `<agent>` block so append/remove can target one member without a full regenerate — the durable path once sets get large.
- Idempotency: dedupe by agent id before appending; on member removal, strip that agent's block.

## Cross-repo apply order (any phase touching the DB or backend)

Same discipline as the rest of the platform: **Supabase MCP `apply_migration` → `pnpm db-types` → aidream `python db/generate.py` → both repos commit.** Most of P1–P2's data changes are jsonb `metadata` shape (no DDL). The real backend work is aidream's executor + the server-side Orchestra reader (P0).

## Anchors

- FE service (mirror for the server reader): `features/agents/orchestras/service/orchestrasService.ts`
- Canvas (member highlight + editable edges): `features/agents/orchestras/components/OrchestraBuilderCanvasImpl.tsx`
- Inspector (input-mapping editor lives here): `features/agents/orchestras/components/MemberInspector.tsx`
- Association RPCs + enumeration: `assoc_add/remove/set_targets/for_sources`, `orchestra_list()` (`migrations/agent_sets_list_rpc.sql`)
- Reuse, don't fork: agent run/stream ([`/Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/CLIENT-RUNTIME.md`]/Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/CLIENT-RUNTIME.md)), tool calls ([`/Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/RESUME-AND-RECOVERY.md`]/Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/RESUME-AND-RECOVERY.md)), invocation ([`/Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/INVOCATION-CONTRACT.md`]/Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/INVOCATION-CONTRACT.md)), versioning ([`AGENT_VERSIONING.md`](./AGENT_VERSIONING.md)), live-watch ([[project_war_room]]).
