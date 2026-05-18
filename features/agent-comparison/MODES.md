# Agent Comparison — Modes Architecture

This feature hosts every flavor of side-by-side agent comparison. Each
**mode** locks a different set of dimensions and varies one. The shared
core never knows what's locked vs free — it just renders columns of
conversations + telemetry + feedback for whatever the mode hands it.

---

## Mode catalog

| Mode | Locked | Free per column | Route | Slice |
|---|---|---|---|---|
| **Open** ("anything goes") | nothing | agent, version, variables, message, settings, context, tools | `/agents/battle` | `agentComparison` |
| Settings _(next)_ | agent, version, variables, message | model, thinking level, temperature, max tokens, etc. | `/agents/battle/settings` | `agentComparisonSettings` |
| Tools _(future)_ | agent, version, variables, message, settings | tools list | `/agents/battle/tools` | `agentComparisonTools` |
| System Prompt _(future)_ | agent, version, variables, message, settings, tools | system prompt override | `/agents/battle/system-prompt` | `agentComparisonSystemPrompt` |
| Request Modification _(future)_ | agent, base setup | request shape (pre/post fixes, transformations) | `/agents/battle/request-mod` | `agentComparisonRequestMod` |

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
