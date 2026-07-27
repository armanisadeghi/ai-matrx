---
status: active
updated: 2026-07-27
repos: [matrx-frontend]
vision: [features/agents/docs/AGENT_SETS.md, features/agents/docs/AGENT_SETS_ROADMAP.md]
---

# Agent Sets — Builder: Sync, Describe & Inspect

The **authoring** half of Agent Sets (the `/agents/sets/[orchestratorId]` builder). Sibling handoff `docs/handoffs/agent-sets-runtime-delegation.md` owns the **execution** half (aidream member-as-tool delegation + Run). Read both; they share one feature doc (`features/agents/docs/AGENT_SETS.md`).

---

## 1. Vision — Arman's words

**Umbrella (from the sibling handoff):** *"one agent in charge… orchestrator and then a group… create a beautiful UI… A lot of drag and drop."* Each member "fills a gap in a bigger picture."

**This slice** is about keeping the set *coherent and inspectable* with one action, and making the orchestrator a first-class, viewable thing. Verbatim:

- On the Sync action: *"We have an agent we can activate here who is designed to analyze the individual agents to make some updates and update the orchestrator agent."*
- The fields that matter are **the member's role in the set**, not the agent's global identity: *"You might be looking at the name and description instead of the things that are specifically for this purpose, which are 'Role Title' and 'The gap it fills'."*
- **Identity law:** *"What I see in the ui and what is given to the agent in xml should be identical."* → *"either we're losing data or there is a ui issue."*
- The generated listing must be clean: *"The block being created is simply wrong because it's not showing the role and the other text. It's DUPLICATING THE ID!"*
- When Sync can't run (no `<available_agents>` section), the gating is right but must not be silent: *"That's actually brilliant and it's EXACTLY how it should be. The problem? Why isn't it telling the user and then offering the user an easy way to modify that? Add a yellow button… a simple, one-click way to update their system prompt by showing them a window panel that shows the system prompt… You might even be able to get away with using the advanced settings window panel and just hiding all tabs other than the system prompt one."* (He chose: **insert the empty section automatically, then open it for review.**)
- Inspect the orchestrator like any member — plus its prompt: *"When we click on one of the regular agents, we have a few buttons… see a snapshot… see some of the core items… we don't see that at all for the orchestrator, which doesn't make any sense… it's as important or more important to be able to see the details of the orchestrator… and for the orchestrator, we need one additional item… a system prompt directly from here because the system prompt can be auto generated using some of our features."*

**The why behind the load-bearing decisions:**

- **Role/gap live on the association EDGE, not on `agent.definition`.** A member plays a *set-specific* role (its "Role title" + "The gap it fills"); the agent's own `name`/`description` are its global identity and are shared across every set. Writing role/gap to the edge (`platform.associations.label` + `metadata.gap`) is what lets the same agent be a "Researcher" in one set and a "Fact Checker" in another. (Arman corrected an earlier build that wrote to `agent.name`/`description` — that was wrong.)
- **The `<available_agents>` block is built in CODE from the persisted edges, never re-analyzed by the LLM.** This is what enforces the identity law: the XML the orchestrator receives is a deterministic render of the exact role/gap the user sees in the inspector. An LLM re-render (the old "Agent Description Generator") drifted, duplicated the id, and ignored the authored role.
- **Loud failure, never a silent fallback.** If the describe run returns nothing, change *nothing* and surface a clear error — a half-filled or fabricated prompt is worse than an error the user can retry.

---

## 2. Current state (gap analysis)

### Done — built and verified
- **Reasoning no longer leaks into any headless prompt.** `pollForCompletion` derives answer text via the canonical `deriveAnswerText` (excludes `thinking`/`reasoning` blocks) — `features/agents/redux/execution-system/thunks/launch-agent-execution.thunk.ts`. Fixes every headless `launchAgentExecution` consumer, not just sets.
- **Sync = one AI pass over the whole set → role/gap on edges → deterministic block.** `syncOrchestratorPrompt` (`features/agents/agent-sets/orchestrator/thunks.ts`): runs the **Agent Set Role Describer**, writes each member's role/gap via `saveMemberMeta`, then `buildAvailableAgentsBlock` → `injectAvailableAgents`. Block is built **only** from persisted edges (identity law holds); one clean `<agent id>` block per member (Role / Fills / Inputs / Output), no duplicated id, no `<agents>` wrapper.
- **Loud failure + bounded retry (3×).** Empty describe → retry with backoff → clear error toast carrying the run's actual failure reason. Never writes a fallback.
- **Agent Set Role Describer builtin** (`a3e9d1c4-7b62-4f08-9c5a-2d6e8f0b1a37`) — seeded by `migrations/agent_set_role_describer_builtin.sql`; outputs strict `[{id, role_title, gap}]`. Verified at 9-member scale via the AI Dream MCP `agent_run`.
- **"Enable sync" recovery.** When the orchestrator prompt has no `<available_agents>` section (`ready && !isTemplate`), the builder shows a yellow header action; one click runs `enableOrchestratorSync` → `orchestratorService.ensureAvailableAgentsSection` (idempotent insert) → opens the System-Instructions-only editor → the normal Sync action returns. Added a reusable `warning` variant to `EntityHeaderAction`.
- **Orchestrator Inspector.** Hub node hover toolbar (Quick look + "Orchestrator details") → `OrchestratorInspector.tsx`: snapshot, About, **View system prompt** (opens the System-Instructions-only editor), shared `AgentIODetails` (inputs/outputs), Open/Run. The I/O block was extracted into `AgentIODetails.tsx` and is consumed by both inspectors (no duplication).
- **New-tab fix.** The header "Orchestrator" action opens in a new tab (`newTab: true`), matching its up-right-arrow icon.
- **Content King** (Arman's real set `67408929-…`) data repaired directly (edges + prompt).

### Partial — started, unfinished
- **The headless "empty run" bug is mitigated, NOT root-caused.** In-browser, the describer sometimes returns empty `responseText` (the AI run doesn't execute) — this is what produced the original silent-corruption. Retry + loud error now handle it gracefully, but *why* the run doesn't execute is unconfirmed (suspected: v2 runtime / the API-endpoint or runtime toggles / a corrupted shared dev server). The describer itself is proven correct server-side. **Next person: reproduce on a clean runtime and read the new error toast — it names the real server error.**
- **Deployment not confirmed live.** All code is committed and was swept into release `v0.4.118` by a concurrent session, but liveness on Vercel was not verified. Confirm the deployed build serves this code.

### Not started
- **Orchestrator inspector in Grid view.** Only the Canvas hub node exposes it; `SetMemberGrid` shows members but has no orchestrator card/affordance.
- Runtime delegation live verification, live canvas highlight, pipelines/DAG — all in the sibling handoff / `AGENT_SETS_ROADMAP.md`, not here.

### Known issues / risks
- **Concurrent-session git interference is real in this repo.** During this work, files were swept into other sessions' release commits before the intended commit ran, and HEAD moved between two consecutive commands. Always `git status` + verify your files are actually committed with your message; don't assume.
- **Throwaway test agent left behind:** `8bddf72b-76d6-44f6-8feb-f5c4aa7f0214` ("ZZ Inspector Test") in the `admin@admin.com` account. Delete it (via `/agents` or SQL) — the Supabase MCP was disconnected and couldn't remove it.
- **Supabase MCP requires re-auth** (connector settings) before any live DB verification/cleanup.

---

## 3. Architecture & orientation

**Route:** `app/(core)/agents/sets/[orchestratorId]/page.tsx` → `SetBuilder`.

**A set is association edges, not a table** (`platform.associations`): a self-edge `role='matrx_set'` marks an orchestrator; `role='member'` edges carry the member's **role title in `label`** and **gap in `metadata.gap`**. Full model: `features/agents/docs/AGENT_SETS.md`.

**Where things live (all under `features/agents/agent-sets/`):**
- `components/SetBuilder.tsx` — the shell + header actions (Run / Sync / Enable sync / Orchestrator / Set settings) + owns which inspector is open.
- `components/SetBuilderCanvasImpl.tsx` — React Flow hub-and-spoke canvas; `OrchestratorNode` + `MemberNode`, each with a hover toolbar. (Heavy; behind `SetBuilderCanvas` `next/dynamic`.)
- `components/MemberInspector.tsx` / `components/OrchestratorInspector.tsx` — the two right-side inspectors (mutually exclusive).
- `components/AgentIODetails.tsx` — shared inputs/outputs block. **Reuse this; do not re-inline it.**
- `orchestrator/thunks.ts` — `syncOrchestratorPrompt`, `enableOrchestratorSync`.
- `orchestrator/orchestratorService.ts` — DB reads/writes: `ensureAvailableAgentsSection`, `injectAvailableAgents`, `buildAvailableAgentsBlock`, `systemPromptOf`.
- `orchestrator/constants.ts` — `AGENT_SET_ROLE_DESCRIBER_ID`, `ROLE_DESCRIBER_INPUT_VAR`, the `<available_agents>` markers/regex.
- `hooks/useOrchestratorPromptStatus.ts` — the `isTemplate` gate (prompt has `<available_agents>`?) that decides Sync vs Enable-sync.

**Cross-feature seams (owned elsewhere, consumed here):**
- The system-prompt editor is the shared `agentAdvancedEditorWindow` overlay opened via `useOpenAgentContentWindow({ initialTab: "system", tabs: ["system"] })` (`features/overlays/openers/agentAdvancedEditorWindow.tsx`) — restricting `tabs` to `["system"]` is what shows only System Instructions.
- The header is the shared `EntityModeHeader` template (`features/shell/components/header/templates/`) — `EntityHeaderAction` now supports `warning` and `newTab`.
- The snapshot is `AgentPeekButton` (opens `AgentPeekWindow` as a non-blocking draggable panel).

**The Sync data flow (the one to understand):**
```
members (edges) + each member's config dump
   → Agent Set Role Describer (headless launchAgentExecution, background)
   → [{id, role_title, gap}]  (parsed from responseText)
   → saveMemberMeta per member  (writes label + metadata.gap on the edge)
   → reload edges → buildAvailableAgentsBlock(persisted role/gap + declared I/O)
   → injectAvailableAgents  (replaces the <available_agents> section)
```

---

## 4. Next steps (prioritized)

1. **Confirm deployment + smoke-test on a clean runtime.** Verify `v0.4.118` (or later) is live on Vercel and serves this code. Then log in at `/login` (`admin@admin.com` / `Password1234#`), `/agents/sets` → Generate orchestrator → add 2–3 members → **Sync agent listings**. Expect: member Role titles/gaps populate, the orchestrator prompt's `<available_agents>` matches them exactly, success toast reports the count.
2. **Root-cause the headless empty-run bug.** If Sync ever returns the "role describer produced no output" error on a healthy runtime, that toast now carries the real server error — chase it (likely v2 `/v2/ai/agents/{id}` behavior or a runtime/endpoint toggle). Entry point: `pollForCompletion` and the execute path in `launch-agent-execution.thunk.ts`; the run is `displayMode:"background", isEphemeral:true`.
3. **Add the orchestrator inspector to Grid view.** `SetMemberGrid` currently has no orchestrator affordance. Add a hub tile/button that calls the same `onOpenOrchestrator` path `SetBuilder` already wires for the canvas.
4. **Delete the throwaway agent** `8bddf72b-…` once the Supabase MCP is re-authorized.

---

## 5. Gotchas & context

- **Never write role/gap to `agent.definition.name`/`description`.** Set-specific role/gap belong on the member **edge** (`label` + `metadata.gap`) via `saveMemberMeta`. This was an explicit correction.
- **Never build the `<available_agents>` block from anything but the persisted edges.** No `agent.name`/`description` fallback, no LLM re-render. The block must equal what the inspector shows (identity law). If the describe fails, inject nothing and error loudly.
- **`isTemplate` is `AVAILABLE_AGENTS_RE.test(systemPrompt)`** — the Sync button correctly disappears when the prompt has no `<available_agents>` section. That is intended; the recovery is the yellow "Enable sync" action, not un-gating.
- **The describer's headless output must exclude reasoning.** It runs with reasoning summaries on; `deriveAnswerText` (not a raw render-block join) is the only correct way to read `responseText`. A raw join re-introduces the chain-of-thought-in-prompt bug.
- **The Role Describer reuses the UUID first seeded as "Agent Namer."** Same id `a3e9d1c4-…`, re-purposed to output `{id, role_title, gap}`. The live agent and `migrations/agent_set_role_describer_builtin.sql` agree — keep them in lockstep if you change the prompt.
- **Colors:** the yellow pill uses the semantic `bg-warning` / `text-warning-foreground` tokens, not raw amber.
- **Browser-verify with refs, not pixels.** Canvas node hover toolbars are `opacity-0` until hover and small; drive them via `read_page` refs (`"Orchestrator details"`, `"View system prompt"`), not coordinates.
- Touch any of this → update `features/agents/docs/AGENT_SETS.md` (the system of record) in the same change, and groom/delete this handoff when its Remaining work is empty.
