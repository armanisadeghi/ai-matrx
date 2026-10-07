# Master Plan — Prompts → Agents Migration

Read [`README.md`](./README.md) before touching anything here. Read [`INVENTORY.md`](./INVENTORY.md) for the legacy surface.

## How to read this file

- Phases are **ordered**. Do not begin a phase until its prerequisites are `complete`.
- Each phase has a dedicated doc in `./phases/phase-NN-<slug>.md`. That doc is the truth for scope and status.
- This file shows goal, prerequisites, status, and next actions. Details live in phase docs.

## Where we are (2026-04-22)

**All foundational phases are shipped to main.** The DB schema for shortcuts, content blocks, Applets, the execution config bundle, and the feature/binding renames have all landed. Live shortcuts execute end-to-end with variable resolution, context overrides, LLM overrides, bypass-gate timer, and scope/context mappings wired through.

- **Code-and-DB complete (11 phases):** 1, 2 (impl), 3, 3.5, 3.6, 5, 7 (with caveats), 8 (impl), 9, 11, 12, 13
- **Blocked on user decision (3 phases):** 4 (quick actions re-scope), 6 (code-editor agent ids), 10 (applets)
- **Partial (1 phase):** 7 — chat route shipped, community tab stubbed, keybind registry deferred
- **Gated (7 phases):** 14 → 15 → 16 → 17 → 18 → 19 → 20

**Biggest gap right now is end-to-end smoke testing**, not code. Phase 3.5 and 3.6 shipped significant behavior changes (variable resolution precedence, bypass timer, context mappings) that have not been exercised against a live browser session since landing. The Quick Code Explanation shortcut (id `863b28c4-bb94-400f-8e23-b6cf50486537` → agent `acc3b900-e4b2-4000-b0a5-4889d8d33757` v13) is the canonical verification fixture.

## Architecture anchors (apply everywhere)

- **State**: RTK only. Extend existing slices (`features/agents/redux/**`) — never create local/parallel state.
- **Shortcuts are multi-scope from day 1**: admin / user / org. `agx_shortcut` + `shortcut_categories` + `content_blocks` all carry `user_id`, `organization_id`, `project_id`, `task_id`.
- **CRUD components are shared**: built once in `features/agent-shortcuts/`, mounted by admin/user/org routes.
- **Config is unified**: every surface that customizes an agent produces the same `AgentExecutionConfig` bundle (shortcuts, Applets, tester, inline launches). See `../aidream/apps/shared/chat/src/agents/types/agent-execution-config.types.ts`.
- **Runtime is separated**: `AgentExecutionRuntime` carries per-invocation data (applicationScope, userInput, widgetHandleId, originalText) — never persisted.
- **Chat is the crown jewel**: `(a)/chat` route exists and runs on the execution-system.

## Phase list

| # | Phase | Status | Doc |
|---|---|---|---|
| 0 | Governance & docs bootstrap | ✅ complete | _this file + `README.md` + `INVENTORY.md`_ |
| 1 | Agent Shortcuts foundation (multi-scope DB + RTK + API + shared CRUD feature) | ✅ complete | `phases/phase-01-agent-shortcuts-foundation.md` |
| 2 | Content Blocks migration | ✅ implementation-complete (perf profile 2.3 outstanding, low priority) | `phases/phase-02-content-blocks.md` |
| 3 | Unified Agent Context Menu (replace 1765-LOC component) | ✅ complete | `phases/phase-03-unified-context-menu.md` |
| 3.5 | Agent Execution Config bundle (unify shortcut/app/tester config + fix variable resolution) | ✅ complete | `phases/phase-03.5-agent-execution-config.md` |
| 3.6 | Configuration unification (enabledFeatures rename, contextMappings, bypass timer) | ✅ implementation-complete | `phases/phase-03.6-configuration-unification.md` |
| 4 | Quick Actions re-scope (overlay dispatches, not agents — design decision needed) | ⏸ **needs-design-decision** (3 options documented; recommendation: `app_actions` table) | `phases/phase-04-quick-actions.md` |
| 5 | Context-menu integration sweep (notes, code editor, agent builder, SSR RPC) | ✅ complete | `phases/phase-05-integration-sweep.md` |
| 6 | Code Editor quick wrapper (keep prompt-app editing working) | ⏸ **blocked** on agent-id decision for V2/V3/compact editors | `phases/phase-06-code-editor-quick-wrapper.md` |
| 7 | `(a)/chat` — unified chat flagship route | 🟡 partially-complete (community stub; keybind registry deferred) | `phases/phase-07-chat-route.md` |
| 8 | Applets public runner (`/p/[slug]`) | ✅ implementation-complete; end-to-end smoke untested | `phases/phase-08-applets-public.md` |
| 9 | Admin Applets management UI | ✅ complete | `phases/phase-09-admin-applets.md` |
| 10 | Applets capture (parent-app-with-children + shared context slots) | ⏸ design-complete; **5 user questions blocking implementation** | `phases/phase-10-applets-capture.md` |
| 11 | Admin Shortcut management UI | ✅ complete | `phases/phase-11-admin-shortcuts-ui.md` |
| 12 | User Shortcut management UI | ✅ complete | `phases/phase-12-user-shortcuts-ui.md` |
| 13 | Org Shortcut management UI | ✅ complete | `phases/phase-13-org-shortcuts-ui.md` |
| 14 | Dual-run & parity verification behind flag | ⏳ not-started; gates the deletion phases | `phases/phase-14-dual-run.md` |
| 15 | Native Code Editor rebuild (agent tools, VSCode-style context slots) | ⏳ not-started | `phases/phase-15-native-code-editor.md` |
| 16 | Deprecate prompt routes | ⏳ not-started | `phases/phase-16-deprecate-routes.md` |
| 17 | Deprecate prompt APIs | ⏳ not-started | `phases/phase-17-deprecate-apis.md` |
| 18 | Remove prompt feature code | ⏳ not-started | `phases/phase-18-remove-features.md` |
| 19 | DB cleanup (drop prompt tables) | ⏳ not-started | `phases/phase-19-db-cleanup.md` |
| 20 | Final sweep (`aiChatSlice`, legacy `ai_agent`, doc consolidation) | ⏳ not-started | `phases/phase-20-final-sweep.md` |
| 21 | New `/code` workspace: resource pills + error inspection + unified context menu | ✅ code-complete (smoke testing pending — Problems panel + IDE-actions injection deferred) | `phases/phase-21-code-workspace-resource-pills.md` |

## Dependency graph (updated)

```
[✅ 1 ─ 2 ─ 3 ─ 3.5 ─ 3.6 ─ 5 ─ 7 ─ 8 ─ 9 ─ 11 ─ 12 ─ 13]  (shipped)
                                     │
                                     ├─▶ [⏸ 4 quick-actions]  (design decision)
                                     ├─▶ [⏸ 6 code-editor]    (agent-id decision)
                                     ├─▶ [⏸ 10 applets]       (5 user questions)
                                     └─▶ [⏳ 14 dual-run]     ← top unblocker for 15-20

Phase 14 gates everything downstream.
Phase 15 runs once Phase 14 is green.
Phases 16–19 run strictly sequentially after 14+15 green.
Phase 20 is the victory lap.
```

## Next up — actionable work

### 🟢 What I can ship right now without asking (recommended order)

1. **Phase 3.6 cleanup pass** (~4-6 hours) — optional but finishes the types story.
   - Remove 15 `@deprecated` flat fields from `ManagedAgentOptions`; update the ~28 call sites to use `config: { … }` + `runtime: { … }`.
   - Rename `ManagedAgentOptions.overrides` → `llmOverrides` (4 call sites).
   - Delete the coarse `showVariables` flag; update ~10 callers to set `showVariablePanel` / `showDefinitionMessages` explicitly.
   - Delete the `normalize-managed-options.ts` shim if it becomes a no-op after the sweep.
   - **Cost**: cosmetic, behavior-neutral. Skip if time is better spent testing.

2. **Phase 7 polish** — two small loose ends.
   - Wire the keyboard-shortcut registry so `(a)/chat` respects user keybinds.
   - Flesh out the community tab (listing of shared chats) or remove the stub.

3. **Phase 2.3 content-block perf profile** — short investigative task, documents whether we need virtualization in the picker.

### 🟡 What's productive if the user answers questions

4. **Phase 4 Quick Actions re-scope**
   - Question: keep hardcoded, introduce `app_actions` table (recommended), or polymorphic shortcut table?
   - Unblocks a cleaner Phase 5→6→10 path.

5. **Phase 6 Code Editor quick wrapper**
   - Question: which agent IDs back the V2 / V3 / Compact code editors?
   - Today the V2/V3 loader fails; users are stuck on the live prompt-app path.

6. **Phase 10 Applets capture**
   - Five design questions need answers (composite discoverability, persistence scope, child reuse, guest execution, slot gating).
   - Without answers, implementation is pure speculation.

### 🔴 What needs a browser + live data (user-driven testing)

7. **Smoke-test the execution config wiring** — the biggest gap.
   - Run the Quick Code Explanation shortcut. Verify:
     - `defaultVariables` seed the variable panel.
     - Scope-mapped `selection` / `content` override defaults.
     - `contextOverrides` populate context entries on the instance.
     - `llmOverrides` reach the request body (check Network panel).
     - `showPreExecutionGate` + `bypassGateSeconds` — timer counts down in window title, auto-submits at 0, keyboard/pointer cancels countdown.
     - `hideReasoning` / `hideToolResults` hide the expected blocks.
     - `variablesPanelStyle` renders the selected style.
   - Run `/agents/shortcuts` admin page — edit a shortcut's new fields via ShortcutForm, confirm round-trip.
   - Run `/applets` — create + publish an Applet, load `/p/[slug]` as a guest, confirm Babel sandbox + rate limit trigger both fire.

8. **Phase 7 `(a)/chat` full exercise** — multi-turn chat, tool use, conversation reuse, ephemeral mode.

9. **Phase 8 Applets end-to-end** — public runner was shipped code-complete but never exercised live.

### ⏳ Blocked on 14

10. **Phase 14 dual-run** — needs Phase 4, 6, 10 closed AND a production soak window (1-2 weeks with a feature flag toggling prompts vs agents).

## Open questions (consolidated)

| # | Phase | Question | Why it matters |
|---|-------|----------|----------------|
| 1 | 4 | Quick actions: hardcoded / `app_actions` table / polymorphic shortcut? | Unblocks 5→6→10 cleaner |
| 2 | 6 | Which agent IDs back V2 / V3 / Compact code editors? | Today V2/V3 fails at loader |
| 3 | 10 | Applet discoverability — separate list, filter on apps list, or both? | Determines app-list UX |
| 4 | 10 | Applet persistence — local, per-session, or per-user across applets? | Determines DB design |
| 5 | 10 | Child applet reuse — embed-only or standalone-too? | Determines relationship table |
| 6 | 10 | Guest execution — are applets public? | Determines `/p/[slug]` flow |
| 7 | 10 | Context-slot gating — required before run? | Determines launch-guard rules |
| 8 | 14 | Dual-run production soak window length | Determines testing confidence |

## Start here

If you have 15 minutes and want to make progress without decisions: **smoke-test the Quick Code Explanation shortcut** (item 7 above). That single test exercises most of what's shipped since Phase 3.

If you want to answer questions: **Phase 4** is the lowest-effort, highest-unblock. Ten minutes of thought → unblocks a clean Phase 5→6→10 path.

If you want more code shipped: **Phase 3.6 cleanup pass** (item 1 above). Behavior-neutral, improves the type surface, removes the `normalize-managed-options.ts` shim layer.
