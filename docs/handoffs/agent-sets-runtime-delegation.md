---
status: active
updated: 2026-07-28
repos: [matrx-frontend, aidream]
vision: [features/agents/docs/AGENT_SETS.md, features/agents/docs/AGENT_SETS_ROADMAP.md]
---

# Agent Sets — Runtime Delegation

The **execution** half of Agent Sets. Sibling handoff `docs/handoffs/agent-sets-sync-and-inspect.md`
owns the **authoring** half (builder / Sync / inspectors). Both share one feature doc
(`features/agents/docs/AGENT_SETS.md`).

## Vision — Arman's words

> "one agent that the other ones associate with… having one agent in charge… orchestrator and then a group, I think it's perfect… create a beautiful UI… A lot of drag and drop."

> "We need to have a feature where you can generate an orchestrator agent… copy the template but with their user id… trigger the creation of the agents xml section… allow the user to select all the ones they want or drag and drop."

> "Yes Runtime Delegation.. but you have to look at the code first… Work in a loop with your sights set on making every part of my vision a reality. Make improvements and enhancements when you see the opportunity. Apply all best practices. Finally, use adversarial agents to check all of your work."

The endgame: click **Run** on a set and the orchestrator visibly delegates to its members (each
"filling a gap in a bigger picture"), weaving their outputs into one answer, with the canvas lighting
up live as each member runs.

## Resources

- **FE feature docs (system of record):** `features/agents/docs/AGENT_SETS.md` ("Runtime delegation") + `AGENT_SETS_ROADMAP.md`.
- **aidream service:** `aidream/aidream/services/agent_sets/` (`set_reader.py`, `member_tools.py`, `models.py`) + its `FEATURE.md`. Injection seam: `aidream/aidream/services/ai_execution/agent_run.py` — `build_orchestrator_member_specs` at `:500` (new conversation, in `prepare_agent_run`) and `:837` (continue path). Only `mode="supervisor"` injects.
- **Contracts reused (verify still true — code moves daily):** `AgentToolSpec` in `packages/matrx-ai/matrx_ai/tools/specs.py`; `Associations` ORM in `aidream/db/models/platform.py`; dispatch `packages/matrx-ai/matrx_ai/tools/agent_tool.py#execute_agent_tool`.
- **FE set state:** `features/agents/redux/agent-sets/{slice,selectors,thunks}.ts` (its `status` is a *load* status, not a run status).
- **FE run/stream selectors (for the live highlight):** `active-requests` slice — `selectPrimaryRequest`, `selectActiveTools`, `selectSubAgentResults`, `selectConversationTree`; `process-stream.ts` handles `sub_agent` + `tool_delegated`. War Room live-watch reference: `features/war-room/redux/watchSlice.ts` + `MasterWatchLayer.tsx`.
- **FE highlight seam:** `SetBuilderCanvasImpl.tsx` MemberNode (~`:132-155`) currently overlays a *static* accent ring from set config; `MemberData` has no status field. Swap for a status-driven ring read via a selector **inside** MemberNode (never through node `data`, which would touch the reconcile `sig`).
- **Test:** `/login` (`admin@admin.com` / `Password1234#`) → `/agents/sets` → Generate orchestrator → add flashcard members (org `3e790542`) → **Sync agent listings** → **Run**. Flashcard agent ids: `features/education/docs/LIVE_AGENTS.md`.
- **Backend smoke test:** AI Dream MCP `agent_run` on an orchestrator agent id.

## Remaining work

1. **Verify the aidream half live — still nothing is verified end to end.** The server code shipped in aidream `153ad4291` + `ce852fcaa` (2026-07-15) and aidream has released ~120 times since (origin/main at v0.1.674), so it **is deployed** — the old "inert until deploy" blocker is gone and nobody has run the check. Run an orchestrator (MCP `agent_run` or the FE Run button) and confirm: members appear as tools, get called, sub-runs nest, the recursion guard holds, cost is attributed.
2. **Live member highlight on the canvas** (the one open Phase-1 piece). Blocked on the mount-model decision below. Once decided: an `agentSetRun` selector layer (does not exist today) mapping the orchestrator run's active tool / sub-agent results → member `agentId` → an idle/running/done ring on MemberNode.
(`AGENT_SETS_ROADMAP.md` Phase 3 still-open items: dangling-member GC, cycle prevention, versioned runs via `member_version_id`, cross-org shared-set auth.)

## Done

- Shared-member hydration (2026-08-08): `loadAgentSet` now diffs member agentIds against the `agentDefinition` slice and parallel-`fetchFullAgent`s the missing ones (dedupe via module-level in-flight set) — shared-with-you members no longer render the fallback "Agent" (`agent-sets/thunks.ts::hydrateMissingMemberAgents`).
- Server set reader + member-as-tool projection on BOTH the new-conversation and continue paths (turn 2+ re-injects) — `aidream/aidream/services/agent_sets/` + the two `agent_run.py` seams; deployed.
- Supervisor prompt on generated orchestrators (`ORCHESTRATOR_SUPERVISOR_PROMPT` in `agent-sets/orchestrator/constants.ts:56` via `orchestratorService.setOrchestratorMessages`) + Run entries on builder header & set card.
- Builder UI, canonical rail, non-blocking peek, generate-orchestrator + Sync agent listings — see `AGENT_SETS.md` and the sibling handoff.

## Decisions needed

**Live-highlight mount model.**
- Situation: clicking Run navigates to the standalone runner `/agents/:id/run`; the set builder canvas is not mounted during the run, so a canvas highlight would never be seen. The run state does live in Redux (`active-requests`) and is findable, but nothing renders the set while running.
- Decide: (a) embed a run panel INSIDE the builder so the existing canvas lights up in place, or (b) render a compact member-status view ON the runner beside the conversation. (a) is more faithful to the drag-drop canvas vision; (b) is less code and works with the canonical runner as-is.

**Planner-vs-supervisor paradigm — RESOLVED, flagged for awareness.** The "Agent Orchestrator" template `b06689e3` is a *planner* (emits a JSON dispatch plan, never calls tools), which cannot drive member-as-tool delegation. Resolved non-destructively: generated orchestrators get a supervisor prompt; your template is untouched. If you'd rather the *template itself* be a supervisor, say so and it can be updated in `agent.template`.
