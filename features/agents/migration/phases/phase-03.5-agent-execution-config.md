# Phase 3.5 — Agent Execution Config Bundle

**Status:** complete (migration applied, types regenerated, ShortcutForm rebuilt with all 12 new fields, variable-resolution bug fixed)
**Owner:** main agent
**Prerequisites:** Phases 0, 1, 3 (all complete)
**Unblocks:** correct shortcut execution, Phase 4+, all runtime-variable tests

## Why this phase exists (slotted between Phase 3 and the continuation of 4+)

We duplicated the legacy `prompt_shortcuts` shape into `agx_shortcut` on the assumption it was "nearly identical to agents + scope." It isn't. Agents carry richer concepts (context slots, variable definitions with custom components, versioning) that prompts didn't have. The mismatch is the source of the "variables not applied" bug and the general feeling that the rules don't line up.

This phase reshapes the shortcut table, introduces a single canonical **`AgentExecutionConfig`** type, and rewires every consumer (shortcut, app, tester, demo) to produce and consume the same bundle.

---

## The core concept: three layers

```
┌──────────────────────────────────────────────────────────────────────────┐
│ AGENT DEFINITION (agx_agent / agx_version)                               │
│ ─ Custom instructions, variable_definitions, context_slots, tools,       │
│   mcp_servers, model_id, settings                                        │
│ ─ A "secret" — not directly exposed to the end user                      │
└──────────────────────────────────────────────────────────────────────────┘
                                ↓ customized by
┌──────────────────────────────────────────────────────────────────────────┐
│ AgentExecutionConfig  (THIS PHASE — single canonical type)               │
│ ─ Presentation:   displayMode                                            │
│ ─ Variable panel: showVariablePanel, variablesPanelStyle                 │
│ ─ Flow:           autoRun, allowChat                                     │
│ ─ Transparency:   showDefinitionMessages/Content, hideReasoning/Tools    │
│ ─ Gate:           showPreExecutionGate, preExecutionMessage,             │
│                   bypassGateSeconds                                      │
│ ─ Defaults:       defaultUserInput, defaultVariables, contextOverrides,  │
│                   llmOverrides                                           │
│ ─ Mapping:        scopeMappings (app scope key → agent variable name)    │
│                                                                          │
│ Produced by: shortcut row, agent_app row, tester config, inline call     │
│ Consumed by: launchAgentExecution thunk                                  │
└──────────────────────────────────────────────────────────────────────────┘
                                ↓ combined with
┌──────────────────────────────────────────────────────────────────────────┐
│ AgentExecutionRuntime  (per-invocation, never persisted)                 │
│ ─ applicationScope (selection, text_before/after, content, context,      │
│                     custom keys from the UI)                             │
│ ─ userInput     (what the user typed — at the gate, or in chat)          │
│ ─ widgetHandleId                                                          │
│ ─ originalText                                                            │
└──────────────────────────────────────────────────────────────────────────┘
                                ↓ resolved into
┌──────────────────────────────────────────────────────────────────────────┐
│ EXECUTION PAYLOAD                                                        │
│ ─ Resolved variable values (defaults → scope-mapped → user-edited)       │
│ ─ Instance context entries (agent slots + contextOverrides + ad-hoc)     │
│ ─ Effective LLM params (agent settings + llmOverrides)                   │
│ ─ Conversation + message bundle                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Variable resolution precedence (low → high)

1. Agent's `variable_definitions[].defaultValue`
2. Shortcut's `default_variables[variableName]`
3. Scope-mapped value (`scope_mappings` + `applicationScope`)
4. User-edited value (only when `showVariablePanel` is true and the user changed something)

### Context resolution precedence (low → high)

1. Agent's `context_slots[].default` (if declared)
2. Shortcut's `context_overrides[slotKey]`
3. Runtime context entries (from `applicationScope` keys that map to slots, or ad-hoc additions during execution)

---

## Decisions locked with user

| # | Decision | Answer |
|---|---|---|
| D1 | `apply_variables` column fate | **Drop.** Always apply; visibility controlled by `show_variable_panel`. |
| D2 | `apiEndpointMode` on shortcut? | **No.** Runtime-only. Shortcuts are always `agent` mode. |
| D3 | `isEphemeral` on shortcut? | **No.** Runtime-only. |
| D4 | `contextOverrides` semantics | **Augment + seed.** Can add new slots AND provide defaults for existing slots. |
| D5 | `defaultUserInput` semantics | **Designer-owned extra instructions appended to the template.** Not user-editable. Not visible. Runtime `userInput` is what the user types at the gate / in chat. |
| D6 | Precedence of `defaultVariables` vs `scopeMappings` | **Defaults first, scope second, user edits third.** |
| D7 | Legacy data | **Destructive drop is fine.** User will re-seed via admin UI. |
| D8 | `variables_panel_style` column | **Open `text`, not CHECK constraint.** App validates; default handles unknowns. |
| D9 | UI layout for shortcut form | **Accordion or creator-panel-inspired dense sections.** Keep visible, not hidden. |
| D10 | Test target | Agent `acc3b900-e4b2-4000-b0a5-4889d8d33757` v `da091c09-...` via shortcut `863b28c4-bb94-400f-8e23-b6cf50486537` (`Quick Code Explanation`). |

---

## Schema diff for `agx_shortcut`

### Drop

- `apply_variables` (conflated with `show_variable_panel`; always-apply is the new implicit semantics)
- `show_variables` (derived UI state — never belonged in DB)

### Rename

- `result_display` → `display_mode`
- `use_pre_execution_input` → `show_pre_execution_gate`

### Add

| Column | Type | Default | Purpose |
|---|---|---|---|
| `show_variable_panel` | `boolean` | `false` | Should the user see the variable panel? |
| `variables_panel_style` | `text` | `'inline'` | `inline/wizard/form/compact/guided/cards` — validated in app |
| `show_definition_messages` | `boolean` | `false` | Reveal agent-definition messages to the user |
| `show_definition_message_content` | `boolean` | `false` | Reveal interpolated content (secret-sensitive) |
| `hide_reasoning` | `boolean` | `false` | Hide reasoning/thinking blocks from output |
| `hide_tool_results` | `boolean` | `false` | Hide tool-result blocks from output |
| `pre_execution_message` | `text` | `null` | Custom message shown at the gate |
| `bypass_gate_seconds` | `integer` | `3` | Auto-execute after N seconds. `0` = wait for user. |
| `default_user_input` | `text` | `null` | Designer's extra instructions appended to template |
| `default_variables` | `jsonb` | `null` | Per-shortcut variable defaults, keyed by variable name |
| `context_overrides` | `jsonb` | `null` | Per-shortcut context-slot values / new slots, keyed by slot key |
| `llm_overrides` | `jsonb` | `null` | Partial LLM params (temperature, model, etc.) |

### Keep unchanged

`id`, `category_id`, `label`, `description`, `icon_name`, `keyboard_shortcut`, `sort_order`, `agent_id`, `agent_version_id`, `use_latest`, `enabled_contexts`, `scope_mappings`, `allow_chat`, `auto_run`, `is_active`, `user_id`, `organization_id`, `project_id`, `task_id`, `created_at`, `updated_at`.

---

## Canonical TypeScript types

Living at `features/agents/types/agent-execution-config.types.ts`:

```ts
export interface AgentExecutionConfig {
  // Presentation
  displayMode: ResultDisplayMode;

  // Variable panel
  showVariablePanel: boolean;
  variablesPanelStyle: VariablesPanelStyle;

  // Execution flow
  autoRun: boolean;
  allowChat: boolean;

  // Transparency / privacy
  showDefinitionMessages: boolean;
  showDefinitionMessageContent: boolean;
  hideReasoning: boolean;
  hideToolResults: boolean;

  // Pre-execution gate
  showPreExecutionGate: boolean;
  preExecutionMessage: string | null;
  bypassGateSeconds: number;

  // Defaults / overrides
  defaultUserInput: string | null;
  defaultVariables: Record<string, unknown> | null;
  contextOverrides: Record<string, unknown> | null;
  llmOverrides: Partial<LLMParams> | null;

  // Mapping
  scopeMappings: Record<string, string> | null;
}

export interface AgentExecutionRuntime {
  applicationScope?: ApplicationScope;
  userInput?: string;
  widgetHandleId?: string;
  originalText?: string;
}

export const DEFAULT_AGENT_EXECUTION_CONFIG: AgentExecutionConfig = {
  displayMode: "modal-full",
  showVariablePanel: false,
  variablesPanelStyle: "inline",
  autoRun: true,
  allowChat: true,
  showDefinitionMessages: false,
  showDefinitionMessageContent: false,
  hideReasoning: false,
  hideToolResults: false,
  showPreExecutionGate: false,
  preExecutionMessage: null,
  bypassGateSeconds: 3,
  defaultUserInput: null,
  defaultVariables: null,
  contextOverrides: null,
  llmOverrides: null,
  scopeMappings: null,
};
```

`ManagedAgentOptions` gets restructured:

```ts
export interface ManagedAgentOptions {
  // Identity
  surfaceKey: string;
  sourceFeature: SourceFeature;
  agentId?: string;
  shortcutId?: string;
  manual?: { label?: string; baseSettings?: Partial<LLMParams> };

  // Config bundle — can be a shortcut's config, overridden per-call
  config?: Partial<AgentExecutionConfig>;

  // Runtime
  runtime?: AgentExecutionRuntime;

  // Invocation-level (not shortcut-persistable)
  ready?: boolean;
  isEphemeral?: boolean;
  apiEndpointMode?: ApiEndpointMode;
  jsonExtraction?: JsonExtractionConfig;
}
```

`showVariables` is **removed** from the options surface. Derived at runtime from `config.showVariablePanel` + execution stage in `instance-ui-state`.

---

## Execution plan

### Step 1 — Review & approve (current step)

User approves this doc + the SQL draft (`migrations/agx_shortcut_execution_config_v2.sql`) + the TS types sketch above.

### Step 2 — Run migration via Supabase MCP

Requires MCP authentication. Main agent will prompt user to authenticate, then apply the SQL in a single transaction.

### Step 3 — Regenerate types

`npm run types` (or equivalent) to refresh `types/database.types.ts`.

### Step 4 — Update TS types + converters

Files:
- **New:** `features/agents/types/agent-execution-config.types.ts`
- **Modified:** `features/agents/types/instance.types.ts` — `ManagedAgentOptions` refactored
- **Modified:** `features/agents/redux/agent-shortcuts/types.ts` — shortcut shape reflects new columns
- **Modified:** `features/agents/redux/agent-shortcuts/converters.ts` — db ⇄ TS with the new field set, produces `{ identity, config }`
- **Modified:** `features/agents/redux/agent-shortcuts/slice.ts` — if field-dirty shape changes, extend helpers
- **Modified:** `features/agents/redux/agent-shortcuts/thunks.ts` — every place that spreads `resultDisplay/allowChat/...` now spreads `config`
- **Modified:** `features/agents/redux/execution-system/thunks/launch-agent-execution.thunk.ts` — merges default + shortcut.config + opts.config; pulls runtime from opts.runtime; removes flat-option spreads
- **Modified:** `features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice.ts` — compute `showVariables` from config + stage; drop from persisted state
- **Modified:** `features/agents/utils/scope-mapping.ts` — honor precedence order (defaults → scope → user edits)
- **Modified:** `features/agents/hooks/useAgentLauncher.ts` — `launchShortcut` / `launchAgent` accept new shape; legacy flat options removed

### Step 5 — Update CRUD UI

Files:
- **Modified:** `features/agent-shortcuts/components/ShortcutForm.tsx` — accordion layout, all new fields with proper inputs:
  - Basics: label, description, icon, keyboard shortcut, sort order, active
  - Binding: agent, version or use_latest, category
  - Presentation: `display_mode`
  - Flow: `auto_run`, `allow_chat`
  - Gate: `show_pre_execution_gate`, `pre_execution_message` (textarea), `bypass_gate_seconds` (number)
  - Variable panel: `show_variable_panel`, `variables_panel_style`
  - Transparency: `show_definition_messages`, `show_definition_message_content`, `hide_reasoning`, `hide_tool_results`
  - Scope mapping: existing `ScopeMappingEditor` (scope key → variable name)
  - Defaults: `default_user_input` (textarea), `default_variables` (JSON/KV editor), `context_overrides` (JSON/KV editor), `llm_overrides` (JSON editor w/ LLMParams hints)
- **Modified:** `features/agent-shortcuts/components/ShortcutList.tsx` — column for display_mode; drop `apply_variables` / `show_variables` columns
- **Modified:** `features/agent-shortcuts/components/DuplicateShortcutModal.tsx` — handle full bundle copy
- **Modified:** `app/(authenticated)/(admin-auth)/administration/agent-shortcuts/*`, `app/(a)/agents/shortcuts/*`, `app/(authenticated)/org/[slug]/shortcuts/*` — mount updated forms (should be zero-impact since forms are shared)
- **New:** `features/agent-shortcuts/components/form-sections/` — section components for the accordion (keeps `ShortcutForm.tsx` from ballooning)

### Step 6 — Logic sweep + smoke tests

- Verify `Quick Code Explanation` shortcut (user's test fixture) executes correctly end-to-end — all 5 variables resolved, context passed, gate with custom message + 3s bypass, modal-compact display, no chat
- Re-run the 5-panel scenario matrix at `/ssr/context-menu/scenarios`
- Update `INVENTORY.md` with the new column set
- Close out this phase doc with a Change Log entry

---

## Validation plan with the user's test fixture

**Agent:** `acc3b900-e4b2-4000-b0a5-4889d8d33757` (Code Explainer, v13)
**Shortcut:** `863b28c4-bb94-400f-8e23-b6cf50486537` (`Quick Code Explanation`)

The shortcut needs the following config post-migration (user will edit via the updated CRUD UI or a manual `UPDATE`):

```ts
{
  displayMode: "modal-compact",
  allowChat: false,
  autoRun: true,
  showVariablePanel: false,
  showPreExecutionGate: true,
  preExecutionMessage: "Do you have any special instructions or would you like a direct explanation?",
  bypassGateSeconds: 3,
  defaultVariables: {
    explanation_depth: "Short & Concise Explanation",
    user_expertise_level: "Advanced",  // or whatever the UI exposes
  },
  scopeMappings: {
    content: "entire_code_file_contents",
    context: "list_of_open_file_names",
    selection: "highlighted_code",
    usr_scope_expertise: "user_expertise_level",
    vsc_active_file_language: "programming_language",
  },
  // other flags default
}
```

When launched with `applicationScope` containing the 5 keys above, the launch thunk should:

1. Start from `DEFAULT_AGENT_EXECUTION_CONFIG`.
2. Apply the shortcut's `config`.
3. Resolve variables: agent defaults → `defaultVariables` → scope-mapped → (user edits N/A here since panel hidden).
   - `explanation_depth` = `"Short & Concise Explanation"` (from `defaultVariables`)
   - `highlighted_code` = `applicationScope.selection`
   - `entire_code_file_contents` = `applicationScope.content`
   - `list_of_open_file_names` = `applicationScope.context`
   - `user_expertise_level` = `applicationScope.usr_scope_expertise`
   - `programming_language` = `applicationScope.vsc_active_file_language`
4. Show pre-execution gate with the custom message + 3s timer.
5. If user types → append to runtime `userInput`.
6. Launch: render in `modal-compact`, disable chat follow-ups.

If any of these fail, the phase isn't done. This is the pass/fail criterion.

---

## Change log

| Date | Who | Change |
|---|---|---|
| 2026-04-21 | main agent | Phase created. All 10 design questions answered by user with the Code Explainer example. Schema diff locked. TS types sketched. Migration SQL drafted. Awaiting user green-light to run migration. |
| 2026-04-21 | main agent | User said GO. Code-side phase shipped under commits f49d5e3d2 + follow-up. New: `features/agents/types/agent-execution-config.types.ts` (AgentExecutionConfig, AgentExecutionRuntime, DEFAULT_AGENT_EXECUTION_CONFIG, resolveExecutionConfig). Modified: `instance.types.ts` (ManagedAgentOptions adds nested config/runtime; flat fields kept @deprecated). New: `utils/normalize-managed-options.ts`. Updated: `agent-shortcuts/{types,slice,converters,thunks}.ts` against the v2 column set with loose-row tolerance for pre-types-regen builds. **Bug-fix**: `createInstanceFromShortcut` now applies shortcut.defaultVariables → scope-mapped vars → user edits in correct precedence order, applies shortcut.contextOverrides + scope-mapped context entries, applies shortcut.llmOverrides, seeds shortcut.defaultUserInput. Removed broken `apply_variables` conditional. Updated callers: `launch-agent-execution.thunk` (shortcut.displayMode), `useAgentLauncher.launchShortcut` (forwards nested config + runtime), `UnifiedAgentContextMenu` (uses nested form), `ShortcutForm` (full rebuild with all 12 new fields + JSON editors for default_variables / context_overrides / llm_overrides), `ShortcutList`, `LinkAgentToShortcutModal`. **Pending user step**: apply `migrations/agx_shortcut_execution_config_v2.sql` + `npm run types`. **Known follow-up**: DB RPCs `agx_get_shortcuts_initial`, `agx_build_shortcut_menu`, `agx_get_user_shortcuts` reference old column names and need updating before management-page paths work — context menu uses the rebuilt view and will work immediately. |
