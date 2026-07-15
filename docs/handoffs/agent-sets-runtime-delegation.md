---
status: active
updated: 2026-07-15
repos: [matrx-frontend, aidream]
vision: [features/agents/docs/AGENT_SETS.md, features/agents/docs/AGENT_SETS_ROADMAP.md]
---

# Agent Sets — Runtime Delegation

## Vision — Arman's words

> "one agent that the other ones associate with… having one agent in charge… orchestrator and then a group, I think it's perfect… create a beautiful UI… A lot of drag and drop."

> "We need to have a feature where you can generate an orchestrator agent… copy the template but with their user id… trigger the creation of the agents xml section… allow the user to select all the ones they want or drag and drop."

> "Yes Runtime Delegation.. but you have to look at the code first… Work in a loop with your sights set on making every part of my vision a reality. Make improvements and enhancements when you see the opportunity. Apply all best practices. Finally, use adversarial agents to check all of your work."

The endgame: click **Run** on a set and the orchestrator visibly delegates to its members (each "filling a gap in a bigger picture"), weaving their outputs into one answer, with the canvas lighting up live as each member runs.

## Resources

- **FE feature docs (system of record):** `features/agents/docs/AGENT_SETS.md` (see the **Runtime delegation** section) + `AGENT_SETS_ROADMAP.md`.
- **aidream service:** `aidream/services/agent_sets/` (`set_reader.py`, `member_tools.py`, `models.py`) + its `FEATURE.md`. Injection seam: `aidream/services/ai_execution/agent_run.py` (search `build_orchestrator_member_specs`, right before `apply_unified_tools`).
- **Contracts reused (verify still true — code moves daily):** `AgentToolSpec` in `packages/matrx-ai/matrx_ai/tools/specs.py`; `Associations` ORM in `aidream/db/models/platform.py`; dispatch `packages/matrx-ai/matrx_ai/tools/agent_tool.py#execute_agent_tool`.
- **FE run/stream selectors (for the live highlight):** `active-requests` slice — `selectPrimaryRequest`, `selectActiveTools`, `selectSubAgentResults`, `selectConversationTree`; `process-stream.ts` handles `sub_agent` + `tool_delegated`. War Room live-watch reference: `features/war-room/redux/watchSlice.ts` + `MasterWatchLayer.tsx`.
- **FE highlight seam:** `SetBuilderCanvasImpl.tsx` MemberNode accent ring (~line 134) — swap for a status-driven ring read via a selector INSIDE MemberNode (never through node `data`, which would touch the reconcile `sig`).
- **Test:** log in at `/login` (`admin@admin.com` / `Password1234#`), go to `/agents/sets` → Generate orchestrator → add flashcard members (they live in org `3e790542`) → **Sync agent listings** → **Run**. Flashcard agent ids: `features/education/docs/LIVE_AGENTS.md`.
- **Smoke-test the backend once deployed:** AI Dream MCP `agent_run` on an orchestrator agent id.

## Remaining work

1. **Verify the aidream half live (after deploy).** The server code ships in aidream commit `153ad4291` but is inert until aidream deploys. Run an orchestrator (MCP `agent_run` or the FE Run button) and confirm: members appear as tools, get called, sub-runs nest, recursion guard holds, cost is attributed. This is the real proof — nothing above is verified end-to-end yet.
2. **Live member highlight on the canvas** (the one open Phase-1 piece). Blocked on a mount-model decision (see Decisions). Once decided: new `agentSetRun` selector layer mapping the orchestrator run's active tool / sub-agent results → member `agentId` → an "idle/running/done" ring on MemberNode. Highlight goes inside MemberNode via a selector, NOT node data.
3. **Shared-member hydration** (Phase 3, cheap win): a member shared-with-you (not in your owned slice) shows a fallback name. Batch-fetch missing member ids on set load. `features/agents/docs/AGENT_SETS_ROADMAP.md` Phase 3.

## Done

- Server set reader + member-as-tool projection on BOTH the new-conversation and continue paths (turn 2+ re-injects — adversarial-review HIGH fix) — `aidream/services/agent_sets/` + the `agent_run.py` seams (commits `153ad4291` + `ce852fcaa`, live after deploy).
- Supervisor prompt on generated orchestrators (`ORCHESTRATOR_SUPERVISOR_PROMPT` via `setOrchestratorMessages`) + Run entries on builder header & set card — matrx-frontend HEAD.
- Builder UI, canonical rail, non-blocking peek, generate-orchestrator + Sync agent listings — see `AGENT_SETS.md`.

## Decisions needed

**Live-highlight mount model.**
- Situation: clicking Run navigates to the standalone runner `/agents/:id/run`; the set builder canvas is not mounted during the run, so a canvas highlight would never be seen. The run state does live in Redux (`active-requests`) and is findable, but nothing renders the set while running.
- Decide: (a) embed a run panel INSIDE the builder so the existing canvas lights up in place, or (b) render a compact member-status view ON the runner beside the conversation. (a) is more faithful to the drag-drop canvas vision; (b) is less code and works with the canonical runner as-is.

**Planner-vs-supervisor paradigm — RESOLVED, flagging for awareness.** The "Agent Orchestrator" template `b06689e3` is a *planner* (emits a JSON dispatch plan, never calls tools), which cannot drive member-as-tool delegation. Resolved non-destructively: generated orchestrators get a supervisor prompt; your template is untouched. If you'd rather the *template itself* be a supervisor, say so and it can be updated in `agent.template`.
