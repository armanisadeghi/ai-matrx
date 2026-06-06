# Agent Battle

Multi-agent side-by-side comparison page at `/agents/battle`.

Run unlimited agents (or versions of the same agent) in parallel columns,
hit "Submit All", and persist the result as a **comparison set** for
later review or judging.

---

## Status

**Phase 1 — UI + persistence (current).** Page, columns, dnd reorder,
resize/collapse, submit-all, save/load comparison sets, shared Context
and Runs floating windows.

**Phase 2 — Judge model (future).** Reuse `cmp_comparison_sets.metadata`
+ a future `cmp_judgments` table; no schema change to the entry rows.

---

## Where it lives

| Concern | Path |
|---|---|
| Route shim | [app/(a)/agents/battle/page.tsx](../../app/(a)/agents/battle/page.tsx) |
| Page shell | [components/BattlePage.tsx](./components/BattlePage.tsx) |
| Single column | [components/BattleColumn.tsx](./components/BattleColumn.tsx) |
| Toolbar | [components/BattleToolbar.tsx](./components/BattleToolbar.tsx) |
| Shared windows | [components/SharedContextWindow.tsx](./components/SharedContextWindow.tsx), [components/SharedRunsWindow.tsx](./components/SharedRunsWindow.tsx) |
| Loader dialog | [components/ComparisonSetLoaderDialog.tsx](./components/ComparisonSetLoaderDialog.tsx) |
| Redux | [redux/battleSlice.ts](./redux/battleSlice.ts), [redux/selectors.ts](./redux/selectors.ts), [redux/thunks.ts](./redux/thunks.ts) |
| Supabase CRUD | [service/comparisonSetsService.ts](./service/comparisonSetsService.ts) |
| Tables | `public.cmp_comparison_sets`, `public.cmp_comparison_entries` (see [migrations/cmp_comparison_sets.sql](../../migrations/cmp_comparison_sets.sql)) |

---

## Reused primitives — DO NOT recreate

| Used for | Imported from |
|---|---|
| Per-column UI (display + variables + input + streaming) | `AgentConversationColumn` |
| Conversation lifecycle (create instance, mint id, init slices) | `createManualInstance` from `features/agents/redux/execution-system/thunks/create-instance.thunk` |
| Triggering a run | `launchConversation` thunk |
| Per-column tab content (Context, Session) | `ContextSlotsTab`, `SessionStatsPanel` (imported from `run-controls/`) |
| Agent + version dropdowns | `AgentListDropdown` + `SearchableSelect` (pattern lifted from `AgentComparisonPage`) |
| Resizable horizontal split (N panels) | `ResizablePanelGroup` / `ResizablePanel` / `ResizableHandle` wrappers |
| Horizontal reorder | `@dnd-kit/sortable` with `horizontalListSortingStrategy` |
| Floating windows | `WindowPanel` from `features/window-panels` |

---

## Behavior — the load-bearing flows

### Adding a column
- `addBattleColumn` thunk: mint a fresh `columnId` + `conversationId`, push
  the column with `agentId=null, agentVersion=null`. No execution-system
  state created yet (no agent picked).

### Picking an agent on a column
- `setColumnAgent` thunk:
  - If the column already had a conversation initialized, destroy it
    (`destroyInstance`) and mint a new `conversationId` so the new
    snapshot is clean.
  - `fetchFullAgent` + `fetchAgentVersionHistory` for the dropdowns.
  - `createManualInstance({ agentId, conversationId, apiEndpointMode: "agent" })`
    seeds all per-instance slices (variables, context, user input, UI state).
  - Default version: `"current"`.

### Picking a version
- If `"current"`, no extra fetch.
- Otherwise, `fetchAgentVersionSnapshot` populates `state.agentDefinition.agents`
  with the version snapshot (synthetic id). For Phase 1 we re-snapshot the
  instance against the live agent record — version-pinned execution comes
  with the shortcut/surface path in a later phase.

### Submit All
- `submitAllBattleColumns` thunk:
  - Snapshot every column where `agentId != null` AND the per-conversation
    input has either `text` or `userValues` set.
  - For each, dispatch `launchConversation({ identity.surfaceKey: SURFACE_KEY,
    engine: { kind: "agent", agentId }, routing.apiEndpointMode: "agent",
    inputs: { userInput, variables }, origin.sourceFeature: "agent-battle" })`.
  - `Promise.allSettled` so one bad column doesn't abort the rest.
  - If `activeSetId` is set, upsert per-entry `cmp_comparison_entries`
    rows after all settle.

### Shared Context window
- Renders `ContextSlotsTab` for the **first** column.
- A toolbar checkbox `Apply to all columns` (default ON) wraps every
  `setContextEntry` / `removeContextEntry` dispatch into a fan-out via
  the `broadcastContextEntry` / `broadcastRemoveContextEntry` thunks
  (each loops `state.battle.columns` and dispatches per `conversationId`).
- The instance-context slice itself is untouched — no schema change.

### Shared Runs window
- Read-only. Renders one compact `SessionStatsPanel` per column inside
  one `<WindowPanel>`. Each panel keys off its own `conversationId`.

### Save / Load
- **Save** (toolbar): if `activeSetId` is null, prompt for a name; INSERT
  one `cmp_comparison_sets` row, then bulk INSERT `cmp_comparison_entries`
  for every column whose `conversationId` has been initialized (i.e. has
  an `agentId` set). On re-save: UPDATE the set, DELETE+INSERT entries.
- **Load** (toolbar): list user's sets in a dialog. Selecting one resets
  `state.battle.columns` to match the entries (in `display_order`), creates
  manual instances for each `conversation_id`, and calls `loadConversation`
  to stream message history into Redux.

---

## Surface key

`SURFACE_KEY = "agent-battle"`. All columns share the same surface key —
focus events and pending-navigation intents are unused on this page
(each column manages its own conversation; no fork/retry routing here).

---

## Source feature

`sourceFeature = "agent-battle"`. Set on each `createManualInstance` and
on the `launchConversation` invocation so the conversation record is
attributable to this page in analytics.

---

## Doctrine compliance

- Reused, did not recreate: `AgentConversationColumn`, `launchConversation`,
  `createManualInstance`, `ContextSlotsTab`, `SessionStatsPanel`, the
  agent+version dropdown pair (pattern from `AgentComparisonPage`), the
  resizable wrappers, dnd-kit (pattern from `OptionsEditor.tsx`),
  `WindowPanel`. All glue, no parallel primitives.
- New primitive promoted to feature: the per-conversation fan-out
  (`broadcastContextEntry` / `broadcastRemoveContextEntry`). If a second
  feature needs the same pattern (e.g. shared sysprompt override across N
  runs), lift these into a generic helper under
  `features/agents/redux/execution-system/`.
- `cmp_comparison_sets` and `cmp_comparison_entries` are intentionally
  generic — the future judge feature will write its scores into
  `cmp_comparison_sets.metadata` (or a sibling table) without changing
  the entry schema.
- No emojis, no `window.confirm` (uses `ConfirmDialog` / `TextInputDialog`
  / `sonner` toasts), no `useMemo`/`useCallback`/`React.memo` (React
  Compiler is on), no new admin-gate primitive, all selectors via
  `createSelector`.

---

## Change Log

- 2026-06-05 — **De-forked the per-column results display.** `shared/BoundColumn`
  (the single body used by all 8 battle surfaces — model, settings, tools,
  tuning, system-prompt, request-mod, variations, open battle) was a parallel
  reimplementation of the canonical `AgentConversationColumn` and had drifted
  (unconditional Creator Panel, missing `PendingAsksZone`/`TaskPanelChip`/
  landing transition, separate scroll scaffolding). `BoundColumn` is now a thin
  wrapper that delegates to `AgentConversationColumn`, layering only two deltas:
  the `ResponseFeedbackBar` (via a new generic `afterMessages` scroll slot) and
  `hideInput` for locked-input modes. `AgentConversationColumn` gained three
  additive, default-safe props (`hideInput`, `hideCreatorPanel`, `afterMessages`)
  — `/run`, `/build`, `/chat` are unchanged. Any future change to the results
  display now reaches every battle mode automatically; no second display system
  to keep in sync.
- 2026-05-17 — Initial scaffold (Phase 1).
- 2026-05-24 — Added **Variations** mode (`/agents/battle/variations`): start
  from a template agent, edit the FULL agent definition per variation in a
  tabbed floating editor window (reuses the Agent Builder's `AgentBuilderLeftPanel`),
  run the same test input against all via the manual endpoint, nothing
  persisted. Includes a "Save as new agent" promote path and full-snapshot
  save/load. Hardened the agent-definition save thunks (`saveAgent`,
  `saveAgentField`) to structurally reject synthetic `cmp-` ids — canonical
  helper now at `features/agents/redux/agent-definition/synthetic-id.ts`
  (re-export removed from `forkAgentForVariant.ts`; System Prompt / Tools /
  Tuning updated to import from source). Mode catalog + mechanics in
  [MODES.md](./MODES.md).
- 2026-05-26 — **Critical fix:** stop the synthetic `cmp-` agent id from
  leaking into the `/ai/manual` request body. `assembleManualRequest` in
  `execute-manual-instance.thunk.ts` was setting `agent_id = parentAgentId ?? id`
  for synthetics (which have `parentAgentId: null`), so the cmp- string landed
  on the wire and crashed any server-side consumer expecting a uuid. The
  thunk now omits `agent_id` and `is_version` entirely when the agent is
  synthetic — fix protects all 4 synthetic-fork modes (Variations + System
  Prompt + Tools + Tuning).
- 2026-05-26 — Added **pause/resume per variation** in Variations mode. A
  `paused` flag on `VariationColumn` (default false on add) toggled from the
  column header; paused variations are skipped by Submit All (counted in the
  "skipped" tally) but stay editable. Persisted in the comparison set's
  per-entry metadata. Visual: column body dims with a "PAUSED — SKIPPED ON
  SUBMIT ALL" notice; editor-window tab gets a pause icon + italic label.
