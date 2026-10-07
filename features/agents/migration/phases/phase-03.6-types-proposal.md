# Phase 3.6 — Type Consolidation Analysis & Proposal

**Status:** Analysis Complete — Ready for Execution  
**Date:** 2026-04-22  
**Agent:** Agent B (Types + Naming)

---

## 1. Current State Inventory

### AgentExecutionConfig
**File:** `../aidream/apps/shared/chat/src/agents/types/agent-execution-config.types.ts`  
**Fields (16):** Organized by category already:
- Presentation: `displayMode`, `showVariablePanel`, `variablesPanelStyle`, `autoRun`, `allowChat`
- Transparency: `showDefinitionMessages`, `showDefinitionMessageContent`, `hideReasoning`, `hideToolResults`
- Pre-execution gate: `showPreExecutionGate`, `preExecutionMessage`, `bypassGateSeconds`
- Defaults/overrides: `defaultUserInput`, `defaultVariables`, `contextOverrides`, `llmOverrides`
- Environment: `scopeMappings` (note: no `contextMappings` yet)

**Usage:**
- Canonical config bundle passed to execution pipeline
- Persisted on shortcuts as individual columns (agx_shortcut table)
- Merged via `resolveExecutionConfig` (layering: defaults → shortcut → app → caller)
- Read by instance-ui-state, instance-variable-values, execute-instance thunk

**Duplication:** None with other canonical types. Flat structure already (no nesting).

---

### AgentExecutionRuntime
**File:** `../aidream/apps/shared/chat/src/agents/types/agent-execution-config.types.ts`  
**Fields (4):** All optional
- `applicationScope?` — UI-captured data (selection, content, context)
- `userInput?` — live user text (from gate or chat input)
- `widgetHandleId?` — CallbackManager id for text-manipulation
- `originalText?` — selected text before launch

**Usage:**
- Per-invocation runtime data, never persisted
- Lives in `ManagedAgentOptions.runtime`
- Applied at instance creation via `normalizeManagedOptions`

**Duplication:** Legacy flat fields exist on `ManagedAgentOptions` with `@deprecated` markers:
- `userInput`, `applicationScope`, `widgetHandleId`, `originalText`

---

### ManagedAgentOptions
**File:** `../aidream/apps/shared/chat/src/agents/types/instance.types.ts`  
**Fields (30+):** Three sections
- **Identity:** `surfaceKey`, `agentId`, `shortcutId`, `sourceFeature`, `manual`
- **Config bundle:** `config?: Partial<AgentExecutionConfig>` (canonical)
- **Runtime bundle:** `runtime?: AgentExecutionRuntime` (canonical)
- **Flags:** `ready`, `isEphemeral`, `apiEndpointMode`, `jsonExtraction`, `showAutoClearToggle`, `autoClearConversation`
- **@deprecated flat fields (15):** `displayMode`, `showVariablePanel`, `variablesPanelStyle`, `autoRun`, `allowChat`, `showDefinitionMessages`, `showDefinitionMessageContent`, `showPreExecutionGate`, `preExecutionMessage`, `bypassGateSeconds`, `hideReasoning`, `hideToolResults`, `userInput`, `variables`, `overrides`
- **@deprecated UI state fields (4):** `applicationScope`, `widgetHandleId`, `originalText`, `showVariables`

**Usage:**
- Invocation envelope for all agent launches
- Passed to `normalizeManagedOptions` which collapses flat + nested forms
- Read by `launchAgentExecution` thunk
- Callers: shortcuts, manual launches, test runners, widget launchers

**Duplication:** Intentional backward compat layer. Flat fields map 1:1 to AgentExecutionConfig + AgentExecutionRuntime.

---

### NormalizedManagedOptions
**File:** `../aidream/apps/shared/chat/src/agents/utils/normalize-managed-options.ts`  
**Structure:**
```typescript
{
  identity: { surfaceKey, sourceFeature, agentId?, shortcutId?, manual? }
  config: AgentExecutionConfig  // fully resolved with defaults
  runtime: AgentExecutionRuntime  // merged from flat + nested
  flags: { ready, isEphemeral, apiEndpointMode, jsonExtraction, ... }
}
```

**Usage:**
- Internal utility type, not public API
- Produced by `normalizeManagedOptions()` at thunk entry
- Consumed by `createInstance*` and `execute*` thunks
- Clean separation: config (persisted) vs runtime (ephemeral)

---

### AgentShortcut
**File:** `../aidream/apps/shared/chat/src/agents/redux/agent-shortcuts/types.ts`  
**Fields (25):**
- Identity: `id`, `categoryId`, `label`, `description`, `iconName`, `keyboardShortcut`, `sortOrder`
- Agent reference: `agentId`, `agentVersionId`, `useLatest`
- Context visibility: **`enabledContexts: ShortcutContext[]`** (problem field)
- Scope mapping: `scopeMappings` (MISSING: no `contextMappings`)
- Config bundle (16 fields): All AgentExecutionConfig fields flattened directly on AgentShortcut
- Status: `isActive`
- Scope: `userId`, `organizationId`, `projectId`, `taskId`
- Timestamps: `createdAt`, `updatedAt`

**Usage:**
- Domain type mirroring agx_shortcut row
- Persisted on DB after Phase 3.5 migration
- Loaded via RPC, converted to AgentShortcut via `dbRowToAgentShortcut()`
- Read to construct LaunchConfig when shortcut is triggered
- Updated via CRUD operations

**Duplication:** Config fields are **deliberately flattened** on AgentShortcut (same as on DB row). This is intentional — shortcuts ARE persistent config bundles. The AgentExecutionConfig interface documents the semantic grouping, but shortcuts flatten them for SQL/ORM ergonomics.

---

### ShortcutFormData
**File:** `features/agent-shortcuts/types.ts`  
**Definition:** `Omit<AgentShortcut, "id" | "createdAt" | "updatedAt">`  
**Fields:** All 22 editable fields of AgentShortcut (identity + config + scope mapping + status)

**Usage:**
- Form submission payload when creating/updating shortcuts
- Mirrors AgentShortcut exactly (for type safety)
- Consumed by CRUD handlers to construct Shortcut rows

---

### ApplicationScope
**File:** `../aidream/apps/shared/chat/src/agents/utils/scope-mapping.ts`  
**Structure:**
```typescript
{
  selection?: string
  content?: string
  context?: Record<string, unknown>
  [key: string]: unknown  // extensible
}
```

**Usage:**
- Captured from UI at launch time (editor selection, note content, etc.)
- Part of `AgentExecutionRuntime.applicationScope`
- Passed to `mapScopeToInstance()` to resolve variable values and context entries
- Never persisted on shortcuts (runtime-only)

---

### ShortcutContext (enum)
**File:** `../aidream/apps/shared/chat/src/agents/utils/shortcut-context-utils.ts`  
**Values (12 strings):**
- `general`, `chat`, `notes`, `tasks`, `projects`, `agent-builder`, `custom-apps`, `code-editor`, `documents`, `data-tables`, `canvas`, `dashboard`

**Usage:**
- Defines **where a shortcut is enabled** (which app surfaces/features)
- Stored as `AgentShortcut.enabledContexts: ShortcutContext[]`
- Drives menu population in `agx_build_shortcut_menu` RPC
- Checked at runtime to filter visible shortcuts in a context

**Problem:** Word "context" now means "agent context slots" (e.g., `contextOverrides`, `InstanceContextEntry`). Overloaded semantics.

---

## 2. Naming Issues

| Current name | Problem | Proposed name | Impact |
|---|---|---|---|
| `enabledContexts` | "Context" is overloaded. Now means agent context slots (semantic confusion). Better name reflects **where** shortcuts appear. | `enabledFeatures` | MEDIUM — rename DB column, TS type, RPC refs, converters, selectors, form. |
| `showVariables` (deprecated flat field on ManagedAgentOptions) | Confusing coarse-grained toggle vs fine-grained `showVariablePanel`. Is it "show panel"? "Show definitions"? Both? Part of deprecated path so not urgent. | Remove entirely. Use `showVariablePanel` + `showDefinitionMessages` directly. | SMALL — already deprecated. Only 6 active call sites use it; replace with explicit fields. |
| `overrides` (flat field on ManagedAgentOptions) | Caller-facing path reads `opts.overrides`. Config bundle calls it `llmOverrides`. Inconsistent naming. | Rename `ManagedAgentOptions.overrides` → `llmOverrides` for consistency. Or suppress the flat field and require `config.llmOverrides`. | MEDIUM — ~5 call sites directly set `overrides` on options object. Could deprecate immediately or rename. |
| `showVariablePanel` (config) vs `showVariables` (legacy flag) | Former is correct. Latter is coarse-grained alias. Naming doesn't clarify intent. | Keep `showVariablePanel`. Remove the coarse-grained `showVariables` toggle entirely. | SMALL — `showVariables` is already deprecated and seldom used. |
| `contextOverrides` | Accurate (overrides context-slot defaults), but proximity to `context` (the enum value space) may cause confusion in code review. Mitigated by good JSDoc. | No change — already clear in context. Rely on JSDoc. | LOW — accepted as-is. |
| `scopeMappings` vs `contextMappings` (missing) | Asymmetric: `scopeMappings` exists but `contextMappings` doesn't. For consistency (parity pattern), should add one. | Add `contextMappings: Record<string, string> | null` to AgentExecutionConfig and AgentShortcut (UI scope key → context-slot key). | MEDIUM — DB migration + form UI + wiring. See section 6. |

---

## 3. Proposed Canonical Types File Structure

**File:** `../aidream/apps/shared/chat/src/agents/types/agent-execution-config.types.ts`

**Decision:** Keep flat interface (current). Export helper type aliases for documentation only. Rationale:
- Flat is ergonomic for config merging and form binding
- Thunks/components expect flat shape
- Nesting makes partial updates ugly (`{ config: { presentation: { displayMode: ... } } }`)
- Category comments + JSDoc provide semantic grouping without syntax overhead

**New Structure:**

```typescript
/**
 * ============================================================================
 * CATEGORY HELPERS — Documentation only, not used at runtime
 * ============================================================================
 * These type aliases document semantic groupings within AgentExecutionConfig
 * but the actual interface stays flat for ergonomics.
 */

export interface AgentPresentationConfig {
  displayMode: ResultDisplayMode;
  showVariablePanel: boolean;
  variablesPanelStyle: VariablesPanelStyle;
  autoRun: boolean;
  allowChat: boolean;
  showDefinitionMessages: boolean;
  showDefinitionMessageContent: boolean;
  hideReasoning: boolean;
  hideToolResults: boolean;
  showPreExecutionGate: boolean;
  preExecutionMessage: string | null;
  bypassGateSeconds: number;
}

export interface AgentEnvironmentBindings {
  enabledFeatures: ShortcutContext[];  // renamed from enabledContexts
  scopeMappings: Record<string, string> | null;
  contextMappings: Record<string, string> | null;  // NEW
}

export interface AgentValueDefaults {
  defaultUserInput: string | null;
  defaultVariables: Record<string, unknown> | null;
  contextOverrides: Record<string, unknown> | null;
  llmOverrides: Partial<LLMParams> | null;
}

/**
 * ============================================================================
 * Agent Execution Config — the single canonical customization bundle
 *
 * Every surface that customizes an agent produces this same shape:
 *   - shortcuts (agx_shortcut row, persisted)
 *   - agent apps (agent_apps row, persisted)
 *   - widget tester / creator run panel (in-memory)
 *   - inline caller-supplied (launchAgent({ config: {...} }))
 *
 * The launchAgentExecution thunk merges:
 *   defaults → shortcut.config → agent_app.config → caller.config
 * and hands the resolved bundle to the execution pipeline.
 *
 * NOTHING in this type is runtime state. Runtime values (userInput,
 * applicationScope, widgetHandleId, originalText) live on
 * AgentExecutionRuntime, not here. Derived UI flags (showVariables,
 * etc.) live in instance-ui-state and are computed from this + the
 * current execution stage.
 *
 * ============================================================================
 */

export interface AgentExecutionConfig
  extends AgentPresentationConfig,
    AgentEnvironmentBindings,
    AgentValueDefaults {}

// JSDoc remains unchanged — comments inline for each field group

// ... existing DEFAULT_AGENT_EXECUTION_CONFIG, resolveExecutionConfig
```

**Why this works:**
1. Flat `AgentExecutionConfig` unchanged → no API breaks
2. Helper type aliases document categories for code review & IDE hints
3. No runtime nesting → config merge logic stays simple
4. Helper types can be re-exported for selectors / form grouping logic

---

## 4. Deprecated-Flat-Field Removal Plan

**ManagedAgentOptions flat fields (15):**

| Field | Call Sites | Path | Priority |
|---|---|---|---|
| `displayMode` | 3 | agent-launcher-sidebar, tester, manual launch | Phase 1 |
| `showVariablePanel` | 4 | tester, launcher, builder | Phase 1 |
| `variablesPanelStyle` | 2 | tester, generator constants | Phase 1 |
| `autoRun` | 5 | tester, builder, launcher, generator | Phase 1 |
| `allowChat` | 2 | tester, builder | Phase 1 |
| `showDefinitionMessages` | 2 | builder, tester | Phase 1 |
| `showDefinitionMessageContent` | 1 | builder | Phase 1 |
| `showPreExecutionGate` | 2 | tester, builder | Phase 1 |
| `preExecutionMessage` | 1 | tester | Phase 1 |
| `bypassGateSeconds` | 0 | (unused) | Phase 1 |
| `hideReasoning` | 1 | tester | Phase 1 |
| `hideToolResults` | 1 | tester | Phase 1 |
| `userInput` | 5 | launcher, tester, generator | Phase 1 |
| `variables` | 6 | launcher, tester, generator | Phase 1 |
| `overrides` | 5 | launcher, tester, generator | Phase 1 |

**Removal sequence:**

1. **Phase 1 — Sweep all call sites (simultaneous with type unification)**
   - Update all ~25 callers to use `config: { ... }` + `runtime: { ... }` instead of flat fields
   - 1–2 hour refactor per site type
   - Examples:
     - `useAgentLauncher` → collects options, builds `{ config: {...}, runtime: {...} }`
     - `useAgentLauncherTester` → sets specific config fields inside `config` object
     - Generators → `AgentGeneratorConstants` sets `config.autoRun`, etc.

2. **Phase 2 — Delete flat fields from ManagedAgentOptions**
   - Remove all 15 fields and their JSDoc
   - Update `normalize-managed-options.ts` to only merge `config` + `runtime`
   - Remove `legacyFlatToConfig` and `legacyFlatToRuntime` helpers

3. **Phase 3 — Delete normalize-managed-options if no longer needed**
   - If `normalizeManagedOptions()` becomes a no-op after Phase 2, delete the file
   - Otherwise, keep it for type safety / documentation

**Effort:** ~8 hours total (call-site updates + type cleanup + testing)

---

## 5. `enabled_contexts` → `enabled_features` Rename Analysis

**Problem:** Word "context" is overloaded:
- `enabledContexts` = "surfaces/features where shortcut appears" (agent-builder, code-editor, etc.)
- `contextOverrides` = "agent context-slot values to inject"
- `InstanceContextEntry` = "a slot in the agent's context dict"

This creates cognitive load and code-review confusion.

**Proposed rename:** `enabledContexts` → `enabledFeatures`  
(These name the **features** / app-surfaces / placements where a shortcut is available.)

### Files affected (grep results):

**Type definitions:**
- `../aidream/apps/shared/chat/src/agents/utils/shortcut-context-utils.ts` — remains `ShortcutContext` (the enum/union type); no change to the enum name itself
- `../aidream/apps/shared/chat/src/agents/redux/agent-shortcuts/types.ts` — `AgentShortcut.enabledContexts` → `enabledFeatures`; RPC return types same
- `features/agent-shortcuts/types.ts` — `CategoryFormData.enabledContexts` → `enabledFeatures`

**DB & converters (26 files):**
- `types/database.types.ts` — `enabled_contexts` → `enabled_features` (column rename)
- `../aidream/apps/shared/chat/src/agents/redux/agent-shortcuts/converters.ts` — map `row.enabled_features` (5 places)
- All ~20 other files reading/writing shortcuts: auto-fixes when updating converters

**Selectors:**
- `../aidream/apps/shared/chat/src/agents/redux/agent-shortcuts/selectors.ts` — `record.enabledContexts` → `record.enabledFeatures`

**Components & forms:**
- `features/agent-shortcuts/components/ShortcutForm.tsx` — form field label + binding
- `features/agent-shortcuts/components/CategoryForm.tsx` — same
- All context menu generation — filtering logic unchanged (still checks enum values)

**RPC & stored procs:**
- `agx_get_shortcuts_initial()` — returns `enabled_features` instead of `enabled_contexts`
- `agx_get_shortcuts_for_context()` — same
- `agx_build_shortcut_menu()` — filtering logic unchanged

**Enum/utility (NO CHANGE):**
- `ShortcutContext` type stays — it's the **value domain** (what features exist), not the field name
- `SHORTCUT_CONTEXT_META`, `SHORTCUT_CONTEXTS` — remain as-is (they define the vocabulary)

### Impact assessment: **MEDIUM**

- **DB migration:** 1 schema change + new migration file
- **Type changes:** ~8 type definitions across 4 files
- **Converter updates:** ~5 map statements in 2 files
- **Form updates:** 2–3 components (labels + state binding)
- **RPC updates:** 1 stored proc (column alias)
- **Testing:** Context-menu filtering logic unchanged; integration tests sufficient

**Effort:** ~4–5 hours (rename propagation + testing)

---

## 6. `context_mappings` Addition Analysis

**Requirement:** Add parity with `scope_mappings` so context-slot keys can be explicitly mapped.

**Current asymmetry:**
- `scopeMappings: Record<string, string>` — UI scope key (e.g. "selection") → agent variable name
- No equivalent for context slots

**What happens now (without mapping):**
1. Unmapped scope keys fall through to ad-hoc context via `mapScopeToInstance()`
2. If a scope key matches a context-slot key, it's added to context entries
3. Server-side `context` payload construction is implicit/ad-hoc

**With `contextMappings` (new):**
1. Designer explicitly maps UI scope key → agent context-slot key
2. Clearer intent; first-class support in editor UI
3. Precedence: explicit mapping > `contextOverrides` > ad-hoc context

### Files affected:

**Type definitions:**
- `../aidream/apps/shared/chat/src/agents/types/agent-execution-config.types.ts` — add `contextMappings` field
- `../aidream/apps/shared/chat/src/agents/redux/agent-shortcuts/types.ts` — `AgentShortcut.contextMappings`
- `features/agent-shortcuts/types.ts` — `ShortcutFormData` includes it (automatic)

**DB migration:**
- Add `context_mappings jsonb` column to `agx_shortcut` table (Phase 3.6 migration)
- Converter adds `contextMappings` read/write (2 places)

**Form UI:**
- `features/agent-shortcuts/components/ShortcutForm.tsx` — add second mapping editor widget (optional: Phase 3.7)

**Wiring:**
- `../aidream/apps/shared/chat/src/agents/utils/scope-mapping.ts` — `mapScopeToInstance()` checks `contextMappings` in precedence order
  - Current: Unmapped scope keys → inferred as ad-hoc context
  - New: Check `contextMappings` first; if mapped, use slot; else ad-hoc
- `../aidream/apps/shared/chat/src/agents/redux/execution-system/thunks/launch-agent-execution.thunk.ts` — pass `contextMappings` to `mapScopeToInstance()` call
- No runtime dispatch changes needed (just precedence order in mapper)

**Precedence (proposed):**
```
Context values resolved in order:
1. contextMappings (explicit mapping)
2. contextOverrides (designer injection)
3. Ad-hoc context (unmapped scope keys)
4. Agent-defined defaults (from agent definition)
```

### Impact assessment: **SMALL to MEDIUM**

- **DB migration:** 1 schema change (jsonb column, nullable)
- **Types:** 2 interface additions (minimal)
- **Converter:** 2 map statements
- **Form UI:** Optional; add later in Phase 3.7 if priority is high
- **Wiring:** 1 precedence update in `mapScopeToInstance()` + 1 thunk parameter
- **Testing:** New mapper logic tested; existing precedence maintained

**Effort:** ~2–3 hours (core wiring) + 3–4 hours (form UI, optional for Phase 3.7)

---

## 7. Consolidated Recommendations

### A. Structural recommendation
**Flat interface for AgentExecutionConfig with exported helper type aliases.** Keeps ergonomics, documents categories, supports type-safe form grouping.

### B. Top 3 naming changes by impact

| # | Change | Current → Proposed | Impact | Priority |
|---|---|---|---|---|
| 1 | Flatten `ManagedAgentOptions` | 15 deprecated flat fields → remove | SMALL | Phase 1 (simultaneous with unification) |
| 2 | Rename context-surface field | `enabledContexts` → `enabledFeatures` | MEDIUM | Phase 3.6 or 3.6b |
| 3 | Standardize LLM overrides naming | `overrides` → `llmOverrides` (flat field) | SMALL | Phase 1 (rename during cleanup) |

### C. Conditional recommendation on `enabled_contexts` rename + `context_mappings` addition

**CONDITIONAL YES:**

**enabled_contexts rename:** **YES, proceed.** Semantic clarity is high value. Effort is medium and localized. Recommend doing this in Phase 3.6 to avoid merge conflicts.

**context_mappings addition:** **YES, proceed with phasing:**
- **Phase 3.6 core:** DB migration, type definitions, `mapScopeToInstance()` wiring
- **Phase 3.7 polish:** Form editor UI (optional but recommended for UX)

Why phased: The wiring is low-effort and unblocks designer testing. Form UI is nice-to-have and can land separately.

---

## 8. Hidden Gotchas Uncovered

### Gotcha 1: RPC return types lag DB columns
**Issue:** `AgentShortcutInitialRow` includes `apply_variables` and `show_variables` fields (lines 112–113 in redux/agent-shortcuts/types.ts) which were **dropped** in Phase 3.5 per the converters.ts comment. But RPC still returns them.

**Impact:** If RPC updates aren't synchronized with types migration, code compiles but reads stale fields.

**Action:** Verify RPC stored procs return only v2 columns (no legacy fields). Converters must not reference them.

### Gotcha 2: Loose-typed row reader hides breaking changes
**Issue:** The `LooseRow` + fallback pattern in converters.ts (lines 58–77) silently handles missing columns. This is good for migration, but bad if we forget to remove fallbacks after the transition.

**Action:** Post-migration, remove all `rBool(loose, "old_column_name", fallback)` fallbacks. Only strict reads remain.

### Gotcha 3: `showVariables` is both deprecated AND active
**Issue:** `showVariables` is marked `@deprecated` on ManagedAgentOptions (line 681 in instance.types.ts) but is still **actively used** in ~10 files (tester, builder, launcher hooks, generator). It's a coarse-grained flag that fans out to fine-grained settings.

**Impact:** Incomplete migration. Callers still set `showVariables: true/false` expecting it to control `showVariablePanel` + `showDefinitionMessages` simultaneously.

**Action:** Phase 1 should **NOT just delete** this field. Must update all 10 call sites to use `config: { showVariablePanel, showDefinitionMessages }` explicitly, then delete.

### Gotcha 4: `overrides` is confusingly named in BOTH forms
**Issue:**
- DB + AgentShortcut: `llmOverrides` (correct, specific)
- ManagedAgentOptions flat field: `overrides` (generic, ambiguous)
- AgentExecutionConfig: `llmOverrides` (correct)

Converters at line 72 in normalize-managed-options.ts: `if (opts.overrides !== undefined) out.llmOverrides = opts.overrides;` — the mapping hides the inconsistency.

**Action:** During Phase 1, audit all 5 call sites of `opts.overrides` and either:
- Rename field to `llmOverrides` on ManagedAgentOptions (preferred, mirrors config)
- Or document the transformation in a comment if keeping `overrides` for backward compat

### Gotcha 5: `showVariablePanel` config vs derived `showVariablePanel` state
**Issue:** `AgentExecutionConfig.showVariablePanel` (persisted config) and `InstanceUIState.showVariablePanel` (derived state) have the **same name** but different semantics:
- Config: "designer set this to true, so the UI should allow variables"
- State: "based on config + execution stage, the panel should be shown now"

**Example:** autoRun=true, showVariablePanel=true, but variables already satisfied → state.showVariablePanel might be false.

**Action:** No immediate fix needed (they're in different slices). Document that `InstanceUIState.showVariablePanel` is computed from `config.showVariablePanel + execution stage`. Consider renaming to `isVariablePanelVisible` in state layer if confusion arises.

### Gotcha 6: `ApplicationScope` is extensible but untyped
**Issue:** `ApplicationScope` has `[key: string]: unknown` (line 26 in scope-mapping.ts), so callers can pass arbitrary scope keys. But there's no registry or validation of what keys are valid.

**Impact:** Form designers might map scope keys that never arrive, silently creating dead code.

**Action:** (Future improvement) Consider documenting valid scope keys in a constant and validating at form submission time.

---

## Summary for Main Agent

1. **Structural recommendation:** Keep flat AgentExecutionConfig with exported category type aliases for documentation.

2. **Three highest-impact naming changes:**
   - Remove 15 deprecated flat fields from ManagedAgentOptions (Phase 1, ~8 hours)
   - Rename `enabled_contexts` → `enabled_features` (Phase 3.6, ~4–5 hours)
   - Rename `overrides` → `llmOverrides` on ManagedAgentOptions (Phase 1, included in above)

3. **Recommendation on rename + addition:**
   - **YES to `enabled_contexts` → `enabled_features`:** Proceed in Phase 3.6. Clears semantic overload.
   - **YES to add `context_mappings`:** Proceed in Phase 3.6 (core) + Phase 3.7 (form UI optional).

4. **Top gotchas:**
   - `showVariables` is marked deprecated but actively used; Phase 1 must update all callers first.
   - RPC return types may lag DB columns; verify post-migration.
   - `overrides` naming is ambiguous (generic vs LLM-specific); should align with `llmOverrides`.
   - `showVariablePanel` has same name in config and state with different semantics; document clearly.

