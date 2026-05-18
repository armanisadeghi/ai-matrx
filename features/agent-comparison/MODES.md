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
| **Settings** ✅ | agent, version, variables, message | model, temperature, top_p, max output tokens, reasoning effort, thinking level | `/agents/battle/settings` | `agentComparisonSettings` |
| Tools _(deferred — needs executor support)_ | agent, version, variables, message, settings | tools list | `/agents/battle/tools` | `agentComparisonTools` |
| System Prompt _(deferred — needs executor support)_ | agent, version, variables, message, settings, tools | system prompt override | `/agents/battle/system-prompt` | `agentComparisonSystemPrompt` |
| Request Modification _(deferred — needs executor support)_ | agent, base setup | request shape (pre/post fixes, transformations) | `/agents/battle/request-mod` | `agentComparisonRequestMod` |

The deferred modes need backend cooperation to land:
- **Tools**: the agent's `tools[]` is read server-side from the agent record;
  a per-request override array would need to be honored by the executor.
- **System Prompt**: same story — the system message lives on the agent
  record. The structured-instruction path (`useStructuredSystemInstruction`)
  is the most likely seam but needs end-to-end testing.
- **Request Modification**: needs a clear contract for what transformations
  are allowed (pre/postfix? template rewriting? full body override?) plus
  executor + server support.

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
