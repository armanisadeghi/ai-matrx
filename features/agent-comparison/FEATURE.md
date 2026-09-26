# Agent Battle

Cross-repo proposed plan: `/Users/armanisadeghi/code/common-docs/systems/mandates/REGISTER.md` — read it before adding the proposed Mandate-aware Battle mode or mounting Battle inside an individual Mandate workspace. It has no implementation authority until Arman approves it.

Multi-agent side-by-side comparison page at `/agents/battle`.

Run unlimited agents (or versions of the same agent) in parallel columns,
hit "Submit All", and persist the result as a **comparison set** for
later review or judging.

## Conversation Battle

State lives in the `agentComparisonConversation` slice (source, forks, saved battle). The battle is
saved as soon as forks exist (`mode: "conversation"`, entries = the forks, `metadata.source` = the
forked conversation) and reopens at `/agents/battle/conversation/<id>`; reopening loads each fork
as it is now and never re-forks. It is a mounted mode, so the rank picker compares its forks. It has
no Submit all (each fork sends its own turn), so the header omits Submit all and Blind test.

`/agents/battle/conversation` starts from one existing conversation and creates
each contender with the canonical server-backed conversation fork. The source
conversation is never used as a battle column and remains untouched. Every fork
is loaded through the normal conversation bundle and rendered with `BoundColumn`
without `hideInput`, so each column gets the canonical chat composer and may
diverge through its own message text, attachments, resources, variables,
context, voice input, and later turns.

Removing a column or starting a new battle only clears the local battle view;
the durable fork remains available in chat history. The source picker is the
same conversation-history surface used elsewhere in the product, and every
source/fork header retains the canonical conversation doors.

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
| Routes | `app/(core)/agents/battle/<mode>/page.tsx` (new battle) + `<mode>/[setId]/page.tsx` (one saved battle); Open mode is the root, its battles at `open/[setId]` |
| Route table | [shared/battleRoutes.ts](./shared/battleRoutes.ts) — `battleUrl`, `battleModeBasePath` |
| URL ↔ screen sync | [shared/useBattleRoute.tsx](./shared/useBattleRoute.tsx) — also declares the mounted mode |
| Header (every mode) | [shared/BattleHeader.tsx](./shared/BattleHeader.tsx) + mode nav in [shared/ModePicker.tsx](./shared/ModePicker.tsx) |
| Save path (every mode) | [shared/battlePersistence.ts](./shared/battlePersistence.ts) — `createBattlePersistence` |
| Battle-wide Alchemy | [shared/BattleAlchemy.tsx](./shared/BattleAlchemy.tsx) over [shared/battleSnapshot.ts](./shared/battleSnapshot.ts) |
| Open-mode page / toolbar / column | [components/BattlePage.tsx](./components/BattlePage.tsx), [components/BattleToolbar.tsx](./components/BattleToolbar.tsx), [components/BattleColumn.tsx](./components/BattleColumn.tsx) |
| Shared windows | [components/SharedContextWindow.tsx](./components/SharedContextWindow.tsx), [components/SharedRunsWindow.tsx](./components/SharedRunsWindow.tsx) |
| Open a saved battle | [components/ComparisonSetLoaderDialog.tsx](./components/ComparisonSetLoaderDialog.tsx) |
| Redux | [redux/battleSlice.ts](./redux/battleSlice.ts), [redux/selectors.ts](./redux/selectors.ts), [redux/thunks.ts](./redux/thunks.ts); one slice per mode under `modes/<mode>/redux/` |
| Supabase CRUD | [service/comparisonSetsService.ts](./service/comparisonSetsService.ts) |
| Tables (certified canonical, 2026-09-26) | `agent.cmp_comparison_sets` (token `comparison_set`), `agent.cmp_comparison_entries` (`cmp_entry`, component of the set), `agent.cmp_response_feedback` (`cmp_feedback`) |

## Battle identity — the invariants

- **A battle IS its `cmp_comparison_sets` row; its URL is `battleUrl(mode, id)`.** Every mode's first
  Submit all creates the row BEFORE the runs start (`persist<Mode>Battle`), and `useBattleRoute`
  replaces the URL. Opening a battle URL loads it through that mode's own `load<Mode>BattleSet`; a
  battle saved in another mode is redirected to that mode's URL.
- **Every write goes through `createBattlePersistence`** — create, or update metadata AND entries.
  It refuses to write a battle with no columns. A save failure never blocks the run; it comes back as
  `persistError` and `reportBattleSubmit` shows it.
- **Each mode builds its own metadata and entries.** What a mode holds constant goes on the set row
  (`metadata.locked`, including `resolved_variables` — what the run used, defaults included); what
  varies goes on each entry. Never flatten this into a shared shape: the modes are different experiments.
- **Request Mod saves `lastRequest`, never the emptied composer.** A composer clears the moment it
  sends; `modes/request-mod/columnRequest.ts` picks the request that actually ran. A loaded column that
  already ran does NOT get its request back as a draft (Submit all would send it twice).
- **Shared surfaces read the MOUNTED mode** (`agentComparison.mountedMode`, set by `useBattleRoute`):
  `selectActiveBattleColumns` and `selectMountedBattleSetId`. Every mode's slice survives navigation, so
  "the first slice with columns" is wrong — it put Settings' columns in Model's runs table and filed
  every mode's ratings under Open mode's battle.
- **`entries` are upserted, then the stale ones deleted** (`replaceEntries`), so a failed write keeps
  the previous columns.

## Reused primitives — DO NOT recreate

| Used for | Imported from |
|---|---|
| Per-column UI (display + variables + input + streaming) | `AgentConversationColumn` |
| Conversation lifecycle (create instance, mint id, init slices) | `createManualInstance` from `features/agents/redux/execution-system/thunks/create-instance.thunk` |
| Triggering a run | `launchConversation` thunk |
| Shared locked-mode request composer | `SharedBattleInput` + `copyInstanceRequestDraft` |
| Per-column tab content (Context, Session) | `ContextSlotsTab`, `SessionStatsPanel` (imported from `run-controls/`) |
| Agent + version dropdowns | `AgentListDropdown` + `SearchableSelect` (pattern lifted from `AgentComparisonPage`) |
| Resizable horizontal split (N panels) | `ResizablePanelGroup` / `ResizablePanel` / `ResizableHandle` wrappers |
| Horizontal reorder | `@dnd-kit/sortable` with `horizontalListSortingStrategy` |
| Floating windows | `WindowPanel` from `features/window-panels` |
| Agent identity doors in Master Input and comparison metrics | `EntityRef` with state-preserving new-tab navigation |

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
  - Snapshot every configured column where `agentId != null`. Typed text is
    optional; variables, resources, context, tools, or the agent definition
    itself may be the complete request.
  - For each, dispatch `launchConversation({ identity.surfaceKey: SURFACE_KEY,
    engine: { kind: "agent", agentId }, routing.apiEndpointMode: "agent",
    inputs: { userInput, variables }, origin.sourceFeature: "agent-battle" })`.
  - `Promise.allSettled` so one bad column doesn't abort the rest.
  - If `activeSetId` is set, upsert per-entry `cmp_comparison_entries`
    rows after all settle.

### Locked-mode shared requests

- **Every shared-request mode mounts `SharedBattleInput`** against a dedicated
  cache-only execution instance: Model, Settings, System Prompt, Tools, Tuning,
  and Variations. Hand-built variable fields and chat textareas are banned.
- The composer therefore keeps the normal file picker, paste/drop uploads,
  voice input, variable UI, context, resource chips, and run controls.
- Every mode's Submit All thunk calls `copyInstanceRequestDraft` before
  launching each column. It copies text/message parts, variables and resource
  policies, files/resources, context, run settings, and client tools while
  preserving the mode's per-column varied axis.

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

### Master Input window
- Configured agent labels are canonical `EntityRef` doors that open the agent
  in a new tab, preserving the comparison and mapping state in this window.
- Unconfigured columns remain inert, and Quick Look stays disabled in this
  floating-window context.

### Known gaps (2026-09-26)

- **Attachments on a shared request are not saved** — `metadata.locked` holds message and variables
  only; the files live in each column's conversation history.
- **Six near-copies of `LockedInputSection`** (one per locked mode) remain; consolidating them is
  a separate, state-sensitive change.

### Save / Load
- **First Submit all** creates the battle (automatic name `<agent> · <Mode> battle · <date>`) and the
  URL gains its id. **Save battle / Save changes** runs the same persist path; **Rename battle…** and
  **Save a copy…** (`save<Mode>BattleAs`) act on the saved row. **Start a new battle** empties the page;
  the battle stays saved and the URL returns to the mode's base path.
- **Open a saved battle** lists the person's battles (this mode first, "All modes" for the rest); every
  row is a link to its battle URL. Deleting the battle on screen detaches it; the page keeps its content
  as a new, unsaved battle.
- A hydrated server row is a continuation even when it has zero messages; resubmitting it must never
  assert `is_new`.

---

## Surface key

Open mode: `BATTLE_SURFACE_KEY = "agent-comparison"`; each locked mode has its own
(`MODEL_SURFACE_KEY = "agent-comparison-model"`, …). All columns of a mode share it —
focus events and pending-navigation intents are unused on this page
(each column manages its own conversation; no fork/retry routing here).

---

## Source feature

`sourceFeature = "agent-comparison"`. Set on each `createManualInstance` and
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
- Multi-run request fan-out uses the generic execution-system
  `copyInstanceRequestDraft`; no Battle mode maintains a parallel text-only
  request shape. `pnpm check:agent-submit-content` blocks hand-built shared
  Battle request textareas and missing full-draft fan-out.
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

- 2026-09-26 — **Ratings and ranks survive a reload.** A reopened conversation now carries its run
  history (`fetchConversationBundle` reads `chat.request`/`user_request` when the bundle RPC omits
  them), so the feedback bar and run numbers come back; feedback is keyed by the server's run id
  (`serverRequestId`), never the live `req_*` id. Ratings saved before this under `req_*` ids do not
  reappear.

- 2026-09-26 — **Conversation mode joins the battle system:** slice, saved battle + URL, mounted
  mode (fork ranking works), shared header without Submit all. **Every non-Model mode is the
  `matrx-user/agent-battle` surface** (`BattleSurfaceRuntime`, scope = `buildBattleSnapshot`), so
  "Prepare this page" and header agents see the battle. `BattleHeader` makes Submit all optional.

- 2026-09-26 — **Every battle has a URL and one header.** All nine modes mount `BattleHeader` (name
  left, mode nav center, actions in "…", blind test, battle-wide Alchemy, Submit all); Conversation mode
  joined the nav. Battles are created on first Submit all and live at `/agents/battle/<mode>/<id>`.
  Fixed: re-save dropped every change to the locked setup (metadata was never rewritten); Request Mod
  saved the emptied composer after every run; ratings were filed under Open mode's battle in every
  mode; shared runs table/feedback read the first non-empty mode slice (Variations missing); server
  run durations are seconds but were formatted as milliseconds ("6ms" for a 6 s run) and reloaded
  runs carried milliseconds in the seconds field; an unpicked Model column now says it runs on the
  agent's default model. Tables certified canonical.

Model mode at `/agents/battle/model` has the dedicated UI surface
`matrx-user/agent-comparison-model`. Its mounted runtime exposes the locked
agent/version, shared request and inputs, per-column outcomes, existing feedback
rubric and scores, and comparison state. Unrevealed blind sessions omit model
identities, column/conversation IDs, detailed provider errors, and run metrics.
The comparison's native model runs do not receive this helper surface context.
Its two approval-required write targets stage shared text or declared variables;
they never submit, change models, or alter outcomes. Writes are refused during
submission or an active model run. No judging agent or mandate is created by
this wiring.
- 2026-09-19 — Model mode uses the canonical route header and mode navigation,
  a collapsible shared request, and horizontally scrollable readable columns.
  The dedicated Model Battle surface supplies comparison inputs and evidence
  for future helpers. Shared chat rendering now retains submitted first-turn
  variables and hydrates server-reserved user messages after persistence,
  preventing complete user turns from appearing as empty-message diagnostics.
- 2026-08-29 — **Every Agent Battle composer now uses the full Smart Agent
  Input system.** Settings, System Prompt, Tools, Tuning, and Variations joined
  Model on `SharedBattleInput` backed by a cache-only execution instance. Submit
  All now fans out complete multimodal/resource-bearing request drafts through
  `copyInstanceRequestDraft`; the five hand-built variable grids and text-only
  message inputs were deleted.
- 2026-08-28 — Loaded Request Mod conversations with an existing server row
  now continue by row identity even when no message persisted, preventing
  duplicate-id start requests after an empty or failed first turn.
- 2026-08-28 — **Submit All never requires typed user input.** Open Battle and
  all locked-axis modes launch every configured column; Request Mod no longer
  misclassifies image/file-only columns as empty, and the obsolete empty-input
  preflight was deleted. A blocking release check rejects the known content-
  gating patterns.
- 2026-08-28 — Request Mod columns now inherit the shared Smart Agent Input's
  content-only textarea measurement, preventing the last/focused column from
  opening with an empty 200px composer while its siblings remain compact.
- 2026-08-25 — Comparison metric headers and Master Input labels now preserve
  blind-test anonymity while opening configured agents through canonical
  `EntityRef` doors; unconfigured labels remain inert.
- 2026-08-12 — Master Input mapping rows now open configured agents through
  the canonical `EntityRef` in a new tab while preserving unconfigured labels
  and all mapping controls.
- 2026-07-24 — **Model comparisons now use the full Smart Agent Input.** Replaced
  the locked mode's bespoke variable fields + text-only textarea with the
  canonical `SmartAgentInput` on a dedicated cache-only draft instance. The new
  reusable `copyInstanceRequestDraft` execution primitive fans the complete
  request (including uploaded/pasted files and other resources) into every
  model column while preserving each column's model override. Also removed the
  blind-state identity selector that made this route emit a React-Redux
  memoization warning on every render.
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
- 2026-06-07 — **Model mode baseline column:** picking a locked agent auto-adds the first column pre-filled with that agent's default model (via instance `baseSettings`, not a redundant override). `ModelColumnHeader` baseline column falls back to the agent model in the picker; `SmartModelSelect` accepts `priorityValues` to pin the default at the top of the dropdown.
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
