# Agent Comparison — Modes Architecture

This feature hosts every flavor of side-by-side agent comparison. Each
**mode** locks a different set of dimensions and varies one. The shared
core never knows what's locked vs free — it just renders columns of
conversations + telemetry + feedback for whatever the mode hands it.

---

## Mode catalog

| Mode | Locked | Free per column | Route | Slice |
|---|---|---|---|---|
| **Open** ("anything goes") ✅ | nothing | agent, version, variables, message, settings, context, tools | `/agents/battle` | `agentComparison` |
| **Variations** ✅ | nothing but the shared test input (variables + user message) | the ENTIRE editable agent definition per variation (full Builder, tabbed editor window) | `/agents/battle/variations` | `agentComparisonVariations` |
| **Model** ✅ | agent, version, variables, message, settings, system prompt, tools | model id only (server normalizes settings) | `/agents/battle/model` | `agentComparisonModel` |
| **Tuning** ✅ | source agent, version, variables, message, system prompt, tools | model id + full agent settings (via Builder UI) | `/agents/battle/tuning` | `agentComparisonTuning` |
| **Settings** ✅ (legacy/quick) | agent, version, variables, message | model, temperature, top_p, max output tokens, reasoning effort, thinking level | `/agents/battle/settings` | `agentComparisonSettings` |
| **System Prompt** ✅ | source agent, version, variables, message, settings, tools | system prompt text | `/agents/battle/system-prompt` | `agentComparisonSystemPrompt` |
| **Tools** ✅ | source agent, version, variables, message, system prompt, settings | tools list (built-in + custom + MCP) | `/agents/battle/tools` | `agentComparisonTools` |
| **Request Modification** ✅ | agent, version | per-column variables + user message | `/agents/battle/request-mod` | `agentComparisonRequestMod` |

### Model vs Tuning vs Settings — when to use which

- **Model** uses `apiEndpointMode: "agent"` + the per-conversation
  `instanceModelOverrides` slice. Each column writes a single `model`
  override; the Python server normalizes equivalent settings across
  models so the user doesn't have to think about reasoning_effort vs
  thinking_level vs temperature scales. Best for "GPT-5 vs Claude 4.6
  vs Gemini 3" head-to-heads where you want the agent's defaults to
  carry through.
- **Tuning** uses `apiEndpointMode: "manual"` + the synthetic-agent
  pattern. Each column owns a `cmp-<uuid>` clone of the locked agent;
  the user opens the same `AgentSettingsModal` the Agent Builder uses
  per column, getting the full model-aware settings UI (right inputs
  for the right model). Best for fine-grained "same model, different
  knobs" comparisons.
- **Settings** is the original locked-axis mode and predates the
  Tuning rework. It uses `instanceModelOverrides` like Model but
  exposes a narrow custom override editor for the legacy knob set
  (temperature/top_p/etc.). Slated for cleanup once
  `instanceModelOverrides` and its editor catch up to the modern
  model-aware shape; until then, both coexist.

### The synthetic-agent pattern (used by System Prompt, Tools, Tuning, and Variations modes)

System Prompt and Tools mode both vary properties of the *agent definition*
(system message, tools[]). To avoid a per-request override channel, both
modes use the existing manual API path — the same one the Agent Builder
uses to test mid-edit agents — and "hijack" it by cloning the locked
source agent into a per-column SYNTHETIC `AgentDefinition` record with
a `cmp-<uuid>` id. The clone lives entirely in `state.agentDefinition.agents`
(memory only — never persisted to the DB). The executor's manual path
reads the agent definition LIVE from that slice via
`state.agentDefinition.agents[sourceId]`, so per-column edits to the
synthetic flow through with no special routing.

Why `cmp-` prefix: the agent-definition save thunks (`saveAgent`,
`saveAgentField`) structurally early-return on these ids, so a synthetic can
never reach `supabase.from('agx_agent')` (and server-side, `agx_agent.id` is
`uuid` only, so even if the gate slipped, PostgREST would reject the id
format). Canonical helpers live in
`features/agents/redux/agent-definition/synthetic-id.ts` —
`isSyntheticAgentId(id)` and `SYNTHETIC_AGENT_ID_PREFIX`. `shared/forkAgentForVariant.ts`
adds `forkAgentForVariant(dispatch, state, sourceId)`, which returns a fresh
synthetic id.

This is how the System Prompt mode "hijacks" the existing
`SystemMessage` editor and the Tools mode "hijacks" the existing
`AgentToolsManager` / `AgentToolsModal` — both take `agentId: string`
as props and dispatch field-setter actions keyed by that id, so
pointing them at the synthetic agent id just works.

### Variations — full builder from a template

The broadest synthetic-fork mode. Where System Prompt / Tools / Tuning each
vary ONE axis, **Variations varies the ENTIRE editable agent definition per
column**. It reuses the Agent Builder's whole left panel
(`AgentBuilderLeftPanel`) — model, settings, system prompt, seed messages,
variables, context slots, tools, MCP — pointed at each column's synthetic
agent id. Because the full builder panel is large, the per-variation editors
live as TABS inside one floating `WindowPanel` (one tab per variation,
`VariationsEditorWindow`) instead of inline in each column; the run columns
stay compact for side-by-side response comparison. `apiEndpointMode: "manual"`.

Extras unique to this mode:
- **Count picker** — the empty state spawns N variations at once
  (`addVariationColumns`), matching "pick how many variations you want".
- **Promote** — `promoteVariationToAgent` calls the real `createAgent` to
  save a winning variation as a brand-new agent. This is the ONLY path from
  this mode to the DB; the variations themselves never persist.
- **Full-snapshot save/load** — each saved entry's `metadata.agent` carries
  the variation's complete editable definition (`VariationAgentSnapshot`),
  re-applied to a fresh synthetic on load via the agent-definition field
  setters.

### Request Modification — no synthetic agent

Request Mod is the simplest mode in the family because every column
runs the SAME real agent. There's no synthetic clone — each column
just owns its own `conversationId` with its own per-instance
`instanceUserInput` + `instanceVariableValues`. SmartAgentInput already
manages both, so the per-column body is just `BoundColumn` without
`hideInput`. Submit All skips columns that are empty (no text and no
filled vars) rather than failing them.

Cross-mode UX shipped in addition to the modes:
- **ModePicker** (`shared/ModePicker.tsx`) — mounted at the top of every
  comparison page; click-to-switch nav across all modes. Active mode is
  highlighted; deferred modes render as disabled chips with a "soon" tag.
- **PresetMenu** (`modes/settings/components/PresetMenu.tsx`) — one-click
  templates for the most common Settings-mode comparisons (reasoning
  effort sweep, thinking level sweep, temperature sweep, top-p sweep, max
  tokens sweep). Loading a preset replaces the variant list; locked input
  is preserved.
- **Mode badges** in `ComparisonSetLoaderDialog` — every saved set
  displays its mode (open/settings/tools/...) as a colored badge so the
  user can identify cross-mode sets at a glance.

The slice can be **shared** across simpler modes that have the same
column shape (a `conversationId` + some mode-specific overrides). Modes
with materially different shapes get their own slice — that's cleaner
than a mode-aware mega-slice.

---

## What's shared vs mode-specific

### Shared (mode-agnostic — Mode 2+ imports these as-is)

| File | Purpose |
|---|---|
| `components/ResponseFeedbackBar.tsx` | Per-response multi-metric rating widget |
| `components/RunsComparisonTable.tsx` | Side-by-side metrics table (server + client + context + feedback) |
| `components/SharedRunsWindow.tsx` | Floating window hosting the runs table |
| `components/SharedContextWindow.tsx` | Shared context broadcast UI |
| `components/SharedRunSettingsWindow.tsx` | Shared advanced settings broadcast |
| `components/ComparisonSetLoaderDialog.tsx` | Save/load comparison sets (generic) |
| `components/SubmitAllPreflightDialog.tsx` | Empty-input warning + shared follow-up |
| `service/comparisonSetsService.ts` | `cmp_comparison_sets` + `cmp_comparison_entries` CRUD |
| `service/responseFeedbackService.ts` | `cmp_response_feedback` CRUD |
| Inside `redux/battleSlice.ts`: `feedbackRanks`, `feedbackByConversation`, `activeSetId`, `activeSetName` cache fields |
| Inside `redux/thunks.ts`: `submitAllBattleColumns`, `broadcastContextEntry`, `broadcastRunSettings`, `applyMasterFieldsToColumns`, `saveBattleAs`, `loadBattleSet`, persistence | All take a column list — agnostic to how columns were configured |

### Open-mode-specific (don't import from a different mode's page)

| File | Why it's open-mode only |
|---|---|
| `components/BattlePage.tsx` | Open-mode page shell (toolbar + dnd + N-panel split) |
| `components/BattleColumnHeader.tsx` | Per-column agent + version picker |
| `components/BattleColumn.tsx` | Per-column body — wraps `BoundColumn` + the open-mode header |
| `components/BattleToolbar.tsx` | Has open-mode-specific buttons (Add agent, Master input mapping) |
| `components/MasterInputWindow.tsx` | Per-column variable mapping is open-mode (other modes share one input) |
| `components/BattleAddColumnTile.tsx` | Open-mode side rail (other modes may not need it the same way) |
| Inside `redux/battleSlice.ts`: `masterFields[]` (open-mode-only — other modes have a single locked-input section) |
| Inside `redux/thunks.ts`: `setColumnAgent`, `setColumnVersion`, `reconcileMasterFieldMappings`, master-fields helpers |

### Conversation primitive — extract before Mode 2

`BattleColumn.tsx` currently inlines `BoundColumn` (the
`AgentConversationDisplay + CreatorRunPanel + SmartAgentInput` composite).
This is the single piece of UI every mode renders per-column. Before
adding Mode 2, **extract `BoundColumn` into `shared/BoundColumn.tsx`**
so every mode's column body can use it without re-implementing.

---

## How to add a new mode

1. **Pick a route** (e.g. `/agents/battle/settings`).
2. **Pick a slice strategy.** Either reuse `agentComparison` (if your
   columns are just `{ columnId, conversationId }` + a small payload) or
   make a new sibling slice `agentComparisonSettings`.
3. **Build the mode's page shell** — drop it under
   `modes/<your-mode>/Page.tsx`. The shell decides the locked-input UI
   at the top and renders N columns below.
4. **Build the mode's column header** — what's varied per column goes
   here (settings overrides chip, tools chip, prompt-override summary,
   etc.).
5. **Reuse everything in the "Shared" table above.** Pass the column
   list / conversation ids into them; they don't care what's locked.
6. **Submit-all glue** — your mode's submit thunk broadcasts the locked
   inputs into each column's instance (`setUserInputText`,
   `setUserVariableValues`, applicable `setBuilderAdvancedSettings`),
   then calls `submitAllBattleColumns` (which is already mode-agnostic
   — it just runs `smartExecute` per configured column).

---

## DB tables (already in place — generic across modes)

| Table | Purpose |
|---|---|
| `public.cmp_comparison_sets` | One row per "saved comparison". `metadata` jsonb is where each mode stores its own locked-axis spec. |
| `public.cmp_comparison_entries` | One row per column in a saved set. `metadata` jsonb is per-column comparison-only data. |
| `public.cmp_response_feedback` | User feedback (overall, rank, scores, comment). Linked optionally to a `cmp_comparison_sets.id`. |

When a Mode 2 saves a set, write `metadata: { mode: "settings", locked: { agent_id, version, variables, user_input } }` on the set row. The entries table stores per-column overrides in `metadata`.

---

## Naming

The slice key is still `agentComparison` (shared) and the legacy `Battle*`
component names persist because they're already in production paths and
renaming them buys nothing. The directory itself is `agent-comparison/`
to reflect the broader scope.

---

## Mode 2 — Settings (reference implementation)

Mode 2 shipped first as the locked-axis canonical example. Its file tree:

```
features/agent-comparison/modes/settings/
├── types.ts                              SettingsColumn, SettingsLockedSetup
├── redux/
│   ├── slice.ts                          agentComparisonSettings — columns + lockedSetup
│   ├── selectors.ts
│   └── thunks.ts                         setLockedAgent, setLockedVersion,
│                                         addColumnToSettingsBattle, submitAllSettings,
│                                         saveSettingsBattleAs, loadSettingsBattleSet, etc.
└── components/
    ├── SettingsBattlePage.tsx            page shell
    ├── SettingsToolbar.tsx
    ├── LockedInputSection.tsx            top section — agent + variables + user message
    ├── SettingsColumn.tsx                wraps BoundColumn(hideInput) + header
    ├── SettingsColumnHeader.tsx          settings chip + label + collapse/remove
    └── ColumnOverridesEditor.tsx         popover — model + temperature + top-p +
                                          max tokens + reasoning effort + thinking level
```

Reuses imported directly from the agent-comparison core:
- `shared/BoundColumn` (with `hideInput` since the input is page-level locked)
- `components/ResponseFeedbackBar` (mounted inside BoundColumn)
- `components/SharedRunsWindow` + `components/RunsComparisonTable`
- `components/ComparisonSetLoaderDialog` (with `modeFilter="settings"` +
  `loadFn={dispatch(loadSettingsBattleSet)}`)
- `service/comparisonSetsService` + `service/responseFeedbackService`

Per-column overrides are persisted in the shared `instanceModelOverrides`
slice keyed by `conversationId` — same source of truth the executor reads,
so no new wire format. On save, the column entry's `metadata.overrides`
captures the per-column override map; on load, those overrides are
re-applied to the recreated instance via `setOverrides`.

The set row's `metadata` stores `{ mode: "settings", locked: {...} }` —
that's what the loader dialog's `modeFilter` keys off.

### Pattern to follow for Mode 3+

1. **Create `modes/<your-mode>/` mirroring Mode 2's tree.**
2. **Slice**: track per-column metadata for whatever the mode varies +
   the page-level locked setup.
3. **Thunks**: write a `submitAll<Mode>` that broadcasts the locked
   inputs to each column's instance, then `smartExecute` per column.
4. **Save/load**: write `metadata: { mode: "<your-mode>", locked: {...} }`
   on the set row and per-column variant data in entry `metadata`.
5. **Page**: pair a `LockedInputSection` (whatever's frozen at the top)
   with N columns each running `BoundColumn` and a mode-specific header
   chip.
6. **Toolbar's loader**: pass `modeFilter="<your-mode>"` + a `loadFn`.

---

## Modes 3–5 (System Prompt, Tools, Request Mod)

All three follow Mode 2's directory shape. Notable differences:

- **System Prompt** (`modes/system-prompt/`) — column body is a vertical
  `ResizablePanelGroup`: top = the existing `SystemMessage` editor
  pointed at the column's synthetic agent id, bottom = `BoundColumn`
  with `hideInput`. Persistence writes `metadata: { label, system_message }`
  per entry; on load, the synthetic is re-forked and the saved system
  message is written back via `setAgentMessages` before the conversation
  is hydrated. `apiEndpointMode: "manual"`.
- **Tools** (`modes/tools/`) — column body is a vertical split: top =
  `ToolsSummaryPanel` (inline list of attached tools + the existing
  `AgentToolsModal` for picking), bottom = `BoundColumn` with `hideInput`.
  The summary panel triggers `fetchAvailableTools` on mount so the
  picker is responsive. Persistence writes `metadata: { label, tools[],
  custom_tools[], mcp_servers[] }` per entry; on load, the synthetic
  is re-forked and the three tool fields are re-applied via
  `setAgentTools` / `setAgentCustomTools` / `setAgentMcpServers`.
  `apiEndpointMode: "manual"`.
- **Request Mod** (`modes/request-mod/`) — simplest mode: no synthetic
  agent. Page-level `LockedAgentSection` only picks the agent + version.
  Each column shows `BoundColumn` WITHOUT `hideInput` so users can fill
  per-column variables + user message directly. Submit All preflights
  per column, skipping empties. Persistence captures
  `metadata: { label, user_message, variables }` per entry.
  `apiEndpointMode: "agent"`.
