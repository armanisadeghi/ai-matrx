# Phase 3.6 — Configuration Wiring Trace Report

**Analysis Date:** 2026-04-21  
**Agent:** A (Trace specialist)  
**Status:** ✓ Complete

## Executive Summary

Traced all 16 config fields from `agx_shortcut` table through their entire lifecycle:
- Database storage → Redux dispatch → UI consumption → API assembly

**Verdict Breakdown:**
- **`yes` (14/16):** Field reaches all intended consumers
- **`partial` (0/16):** Stored but not fully acted on
- **`no` (2/16):** Orphaned in database; never read or acted upon
- **`unknown` (0/16):** All fields traced completely

---

## Full Trace Table

| Field | Category | Source of truth | Written to Redux (where) | Read by UI (where) | Read by API body (where) | Wired verdict | Evidence |
|-------|----------|-----------------|--------------------------|------------------|------------------------|---------------|----------|
| `display_mode` | presentation | shortcut row | create-instance.thunk.ts:314 → instance-ui-state.slice.ts:143 | selectDisplayMode; overlayId routing (launch-agent-execution.thunk.ts:74-86) | Not in body (client-side rendering only) | **yes** | launch-agent-execution.thunk.ts:74-86 routes display by mode |
| `allow_chat` | presentation | shortcut row | create-instance.thunk.ts:316 → instance-ui-state.slice.ts:145 | selectAllowChat (instance-ui-state.selectors.ts:88); selectShouldShowInput (173-188) | Not in body (execution config, not payload) | **yes** | selectors used to hide/show chat input |
| `auto_run` | presentation | shortcut row | create-instance.thunk.ts:315 → instance-ui-state.slice.ts:144 | selectAutoRun (instance-ui-state.selectors.ts:83); determines execution trigger | Not in body (execution behavior, not payload) | **yes** | selectors control execution flow timing |
| `show_pre_execution_gate` | presentation | shortcut row | create-instance.thunk.ts:317 → instance-ui-state.slice.ts:146 | selectUsePreExecutionInput (instance-ui-state.selectors.ts:95); selectNeedsPreExecutionInput (111) | execute-instance.thunk.ts:83 (gates assembly) | **yes** | AgentGateInput.tsx:32; blocks execution if unsatisfied |
| `pre_execution_message` | presentation | shortcut row | create-instance.thunk.ts:330 → instance-ui-state.slice.ts:167 | AgentGateInput.tsx:32 (selectPreExecutionMessage); title of gate window | Not in body | **yes** | Rendered in gate window title bar |
| `bypass_gate_seconds` | presentation | shortcut row | Stored in DB (converters.ts:166-169); **NOT dispatched to Redux** | **NEVER read anywhere** | **NEVER sent to API** | **no** | Loaded but abandoned; no selector; no timer component |
| `show_variable_panel` | presentation | shortcut row | create-instance.thunk.ts:320 → instance-ui-state.slice.ts:148 | SmartAgentVariables via selectShowVariablePanel (instance-ui-state.selectors.ts:121) | Not in body | **yes** | Conditionally renders <SmartAgentVariables /> |
| `variables_panel_style` | presentation | shortcut row | create-instance.thunk.ts:332 → instance-ui-state.slice.ts:168 | SmartAgentVariables.tsx:53 (selectVariableInputStyle); switches component (case 63-97) | Not in body | **yes** | Renders form/inline/wizard/compact/guided/cards based on style |
| `show_definition_messages` | presentation | shortcut row | create-instance.thunk.ts:321-322 → instance-ui-state.slice.ts:149 | selectShowDefinitionMessages (instance-ui-state.selectors.ts:127) | Not in body | **yes** | Filters definition messages from transcript |
| `show_definition_message_content` | presentation | shortcut row | create-instance.thunk.ts:323-324 → instance-ui-state.slice.ts:150 | selectShowDefinitionMessageContent (instance-ui-state.selectors.ts:133) | Not in body | **yes** | Reveals/hides interpolated template content |
| `hide_reasoning` | presentation | shortcut row | create-instance.thunk.ts:327 → instance-ui-state.slice.ts:165 | BlockRenderer.tsx:154 (selectHideReasoning); filters reasoning blocks | Not in body | **yes** | ToolHandlers.tsx:147; conditional render |
| `hide_tool_results` | presentation | shortcut row | create-instance.thunk.ts:328 → instance-ui-state.slice.ts:166 | BlockRenderer.tsx:159 (selectHideToolResults); ToolHandlers.tsx:147,182 | Not in body | **yes** | Filters tool-result blocks from stream |
| `enabled_contexts` | bindings | shortcut row | **NOT dispatched to Redux** | **NEVER read in execution path** | **NEVER sent to API** | **no** | Only used in context menu construction (not in agent execution) |
| `scope_mappings` | bindings | shortcut row | Resolved at create-instance.thunk.ts:391 (mapScopeToInstance) | Indirectly: mapped values become instance variables + context | Yes, indirectly (variables + context payloads) | **yes** | Converts UI scope keys to agent variable names; applied to user input |
| `default_user_input` | overrides | shortcut row | create-instance.thunk.ts:385-388 (setUserInputText) | Visible as pre-filled input text | Yes, included in user_input (execute-instance.thunk.ts:97) | **yes** | Appended to userInput; sent in request body |
| `default_variables` | overrides | shortcut row | create-instance.thunk.ts:343-350 (setUserVariableValues) | Variable panel shows resolved values (3-tier merge) | Yes, included in variables (selectResolvedVariables) | **yes** | selectResolvedVariables merges definitions + defaults + user edits |
| `context_overrides` | overrides | shortcut row | create-instance.thunk.ts:356-372 (setContextEntries) | InstanceContextEntry rendered by variable panel context section | Yes, included in context payload (selectContextPayload) | **yes** | setContextEntries adds slots; selectContextPayload serializes to body |
| `llm_overrides` | overrides | shortcut row | create-instance.thunk.ts:375-382 (setOverrides) | Not visible (model settings, not user-facing) | Yes, included in config_overrides (selectSettingsOverridesForApi) | **yes** | Delta-only sent to API (selectSettingsOverridesForApi filters) |

---

## Wiring Verdict Tally

| Category | Count |
|----------|-------|
| ✓ **yes** (fully wired) | 14 |
| ⚠ **partial** (orphaned) | 0 |
| ✗ **no** (never read) | 2 |
| ? **unknown** | 0 |

---

## Orphans Section

### Critical Findings

#### **`bypass_gate_seconds`** — Complete Orphan (No Timer Implemented)

**Status:** Stored in database (default 3), but **never dispatched to Redux** and **never acted on**.

**Evidence:**
- ✓ DB column defined: migrations/agx_shortcut_execution_config_v2.sql:74
- ✓ Read from DB: ../aidream/apps/shared/chat/src/agents/redux/agent-shortcuts/converters.ts:166-169 (rNumber fallback 3)
- ✓ Persisted to AgentShortcut type: ../aidream/apps/shared/chat/src/agents/redux/agent-shortcuts/types.ts:49
- ✗ NOT in InstanceUIState interface (../aidream/apps/shared/chat/src/agents/types/instance.types.ts)
- ✗ NO selector: grep for `selectBypassGateSeconds` → no matches
- ✗ NO timer component in AgentGateInput.tsx — gate waits for manual user input only
- ✗ NOT sent to API (not in execute-instance.thunk.ts:156-169)

**Impact:** Users cannot configure auto-submit timeout. Gate will block execution indefinitely unless user manually clicks "Continue".

**Fix:** 
1. Add `bypassGateSeconds` to InstanceUIState (../aidream/apps/shared/chat/src/agents/types/instance.types.ts)
2. Dispatch in initInstanceUIState (create-instance.thunk.ts:335-336)
3. Create selectBypassGateSeconds selector (instance-ui-state.selectors.ts)
4. Add countdown timer to AgentGateInput.tsx; dispatch setPreExecutionSatisfied after N seconds

**Most Promising Fix File:** `../aidream/apps/shared/chat/src/agents/components/agent-widgets/execution-gates/AgentGateInput.tsx` — add useEffect to watch bypassGateSeconds and auto-submit when time elapses.

---

#### **`enabled_contexts`** — Orphan (Menu Metadata Only)

**Status:** Stored in database and loaded into shortcut record, but **never dispatched to Redux** and **never acted on during execution**.

**Evidence:**
- ✓ DB column defined: migrations/agx_shortcut_execution_config_v2.sql (not new, pre-existing)
- ✓ Read from DB: ../aidream/apps/shared/chat/src/agents/redux/agent-shortcuts/converters.ts:109-110
- ✓ Persisted to AgentShortcut type: ../aidream/apps/shared/chat/src/agents/redux/agent-shortcuts/types.ts:33
- ✗ NOT in InstanceUIState
- ✗ NO selector or Redux dispatch in create-instance thunk
- ✗ Only used in context menu view (agent_context_menu_view) for menu placement
- ✗ NOT consulted during execution to filter agent availability

**Impact:** Field is semantic metadata for menu visibility, not a runtime config. Misnamed: "context" predates the agent-context-slots feature and now overloads the word. Should be renamed to `enabled_features` to clarify it's about feature/surface visibility (e.g. "code-editor", "notes", "sidebar"), not agent context bindings.

**Fix:**
1. Rename to `enabled_features` in Phase 3.7 (DB migration + type cascade)
2. Until then, leave as-is; it does what it's designed to do (menu filtering)
3. Not a bug, just semantic confusion

**Most Promising Fix File:** Database migration + cascading renames (Phase 3.7); no code fix needed now.

---

## Summary of High-Impact Findings

### Top 3 Orphans by Impact

1. **`bypass_gate_seconds` (CRITICAL)** — Defeats pre-execution gate's timeout feature; gates block indefinitely without user interaction. Fix: add countdown timer in AgentGateInput.tsx (2–4 hours).

2. **`enabled_contexts` (NAMING)** — Not an orphan functionally (works as designed), but semantically confusing. Rename to `enabled_features` in Phase 3.7 to clarify intent and avoid overloading "context" (1–2 hours planning + 4 hours migration).

3. **Missing `context_mappings` field (FEATURE GAP)** — Phase brief proposes adding contextOverrides parity. Currently no first-class mapping UI for context-slot → scope key (unlike scope_mappings for variables). Add in Phase 3.7 if context binding is a user-facing feature.

---

## Execution Path Verification

### Full Shortcut → Execution Pipeline

1. **Shortcut loaded from DB** → converters.ts:dbRowToAgentShortcut
2. **Thunk entry** → create-instance.thunk.ts:createInstanceFromShortcut (lines 248–414)
   - Reads shortcut fields into args (displayMode, autoRun, allowChat, showVariablePanel, …)
   - Calls initInstanceUIState with fields 1–12 ✓
   - Calls setUserVariableValues with defaultVariables ✓
   - Calls setContextEntries with contextOverrides ✓
   - Calls setUserInputText with defaultUserInput ✓
   - Calls setOverrides with llmOverrides ✓
   - scope_mappings processed via mapScopeToInstance ✓
3. **Execution** → execute-instance.thunk.ts:assembleRequest
   - Reads hideReasoning / hideToolResults from UI state ✓
   - Reads showVariablePanel / variablesPanelStyle → SmartAgentVariables ✓
   - Reads showPreExecutionGate → blocks assembly if unsatisfied ✓
   - Reads variables, context, overrides from selectors ✓
4. **Stream rendering** → BlockRenderer.tsx, ToolHandlers.tsx
   - Filters reasoning / tool results based on hideReasoning / hideToolResults ✓

### Missing Links

1. **bypass_gate_seconds** — loaded but not dispatched, not read, not sent ✗
2. **enabled_contexts** — loaded but not dispatched, not read, not sent ✗

---

## Notes for Phase 3.7

### Proposed Follow-Up Tasks

1. **Fix bypass_gate_seconds** (P0)
   - Add to InstanceUIState, dispatch, and implement timer in gate component
   
2. **Rename enabled_contexts → enabled_features** (P1)
   - DB migration, type cascade, no code logic change
   
3. **Add context_mappings field** (P2)
   - Parity with scope_mappings for context-slot routing
   - Only if context bindings are user-facing; otherwise defer

4. **Consolidate types** (P1)
   - Merge AgentExecutionConfig, ManagedAgentOptions flat fields, and InstanceUIState presentation layer
   - One canonical config domain with clear sub-categories

---

## File References

| File | Lines | Purpose |
|------|-------|---------|
| migrations/agx_shortcut_execution_config_v2.sql | 66–78 | 16 config columns defined |
| ../aidream/apps/shared/chat/src/agents/types/agent-execution-config.types.ts | 26–128 | AgentExecutionConfig canonical bundle |
| ../aidream/apps/shared/chat/src/agents/redux/agent-shortcuts/converters.ts | 90–221 | DB → Frontend: dbRowToAgentShortcut |
| ../aidream/apps/shared/chat/src/agents/redux/execution-system/thunks/create-instance.thunk.ts | 245–414 | Shortcut → Redux dispatch |
| ../aidream/apps/shared/chat/src/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice.ts | 112–172 | initInstanceUIState storage |
| ../aidream/apps/shared/chat/src/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors.ts | 1–450 | 14 selectors for UI consumption |
| ../aidream/apps/shared/chat/src/agents/redux/execution-system/thunks/execute-instance.thunk.ts | 75–169 | API payload assembly |
| components/mardown-display/chat-markdown/block-registry/BlockRenderer.tsx | 154–159 | hideReasoning / hideToolResults filtering |
| ../aidream/apps/shared/chat/src/agents/components/inputs/variable-input-variations/SmartAgentVariables.tsx | 47–98 | variablesPanelStyle style switching |
| ../aidream/apps/shared/chat/src/agents/components/agent-widgets/execution-gates/AgentGateInput.tsx | 19–113 | Gate UI (missing timer for bypass_gate_seconds) |

