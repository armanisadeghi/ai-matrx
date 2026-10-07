# Phase 3.6 — Configuration Unification & Wiring Audit

**Status:** implementation-complete
**Owner:** main agent
**Prerequisites:** Phase 3.5 (migration applied, RPCs updated, types regenerated)
**Unblocks:** end-to-end shortcut execution, smoke test of Quick Code Explanation

## Why this phase exists

Phase 3.5 added the 12 new shortcut config columns and the `AgentExecutionConfig` bundle, but the code that **consumes** those fields was only partially updated. Examples:

- `bypass_gate_seconds` is stored on the shortcut and reaches `instance-ui-state`, but the pre-execution gate component **does not act on it** — there's no timer. (Prompt system had one.)
- `default_user_input` is persisted and seeded into `instance-user-input`, but there's no verification the user-facing surface respects "invisible to user" semantics.
- `hide_reasoning` / `hide_tool_results` — untested whether the output renderer reads them.
- `variables_panel_style` — does the variable panel actually switch style based on this field?
- `context_overrides` — reaches Redux via `setContextEntries` but the server-side `client_tools` / `context` payload may not include these.

Deeper than individual bugs: the type surface is scattered. Flat fields, nested `config`, deprecated markers, derived state, user preferences, and DB columns all overlap. This phase's deliverables are:

1. A trace table: every config field → exactly where it's read, where it's written, whether it lands
2. A consolidated types file: one canonical "configuration domain" with clear categories
3. A rename + refactor plan for the handful of confusing names (e.g. `enabled_contexts` predates context-as-a-concept and overloads the word)
4. Add missing counterpart: `context_mappings` (parity with `scope_mappings` for context-slot routing)
5. Execution: fix orphans, rename, land the new types

## Proposed category structure

After the migration, `agx_shortcut` holds 16 config fields. Categorized:

### A. Presentation / UX
How the agent appears, what the user can see/do. Does NOT modify the agent's behavior directly.

- `display_mode` — how the run is rendered (modal, inline, sidebar, …)
- `allow_chat` — whether follow-up messages are allowed
- `auto_run` — whether to execute without further user input
- `show_pre_execution_gate` + `pre_execution_message` + `bypass_gate_seconds` — the gate sub-group
- `show_variable_panel` + `variables_panel_style` — variable-panel sub-group
- `show_definition_messages` + `show_definition_message_content` — transparency sub-group
- `hide_reasoning` + `hide_tool_results` — output-filtering sub-group

### B. Environment bindings
How the agent connects to the surrounding UI/app.

- `enabled_contexts` — **proposed rename: `enabled_features`**. These name the app-features/surfaces where the shortcut appears. Word "context" is now loaded (agent context slots), so this name is a semantic landmine.
- `scope_mappings` — UI scope key → agent variable name
- `context_mappings` — **NEW**: UI scope key → agent context-slot key. Parity with scope_mappings. Unmapped scope keys still flow through as ad-hoc context (server handles), but explicit mapping = first-class support + editor UX.

### C. Value defaults / overrides
Direct injection of values regardless of UI context.

- `default_user_input` — designer-only extra instructions (not visible, not editable)
- `default_variables` — per-variable defaults (overridable by scope, then by user)
- `context_overrides` — per-context-slot defaults (can add new slots)
- `llm_overrides` — partial LLMParams delta (temperature, model, etc.)

## Execution plan

1. **Analysis (parallel subagents)** — this phase
2. **Proposal → user approval** — I produce a concrete diff proposal; user signs off on renames/new columns
3. **DB migration** — rename `enabled_contexts → enabled_features`, add `context_mappings jsonb`
4. **Types consolidation** — single canonical file in `../aidream/apps/shared/chat/src/agents/types/agent-execution-config.types.ts`, with sub-categories expressed as type aliases for documentation, but exposed as a flat config for ergonomics
5. **Wiring fixes** — every orphan traced in analysis gets a concrete fix (bypass timer, style switcher, hide flags, etc.)
6. **Form UI** — re-organize ShortcutForm to mirror the three categories

## Subagent tasks

### Agent A — Trace
Read `migrations/agx_shortcut_execution_config_v2.sql` to enumerate the 16 config fields. For each field produce a row in a table:

```
| Field | Stored by | Read by (UI) | Read by (API body) | Wired? | Evidence |
```

`Wired?` is one of: `yes` / `partial` / `no` / `unknown`. `partial` means stored but not acted on at display/execute time. `Evidence` is file:line references proving the finding.

Cover both the shortcut row path and the tester/manual call path (`useAgentLauncherTester` etc.).

### Agent B — Types + naming
Map every type that carries agent-execution configuration: `AgentExecutionConfig`, `ManagedAgentOptions`, `ShortcutFormData`, `AgentShortcut`, `NormalizedManagedOptions`, any tester interface, slice state shapes. Produce:

1. A consolidation proposal — one canonical file, clear naming, sub-grouped by category above
2. A rename table: old → new names, plus reasoning
3. Identify every derived state that's currently typed as a config field (like `showVariables`)
4. Verdict on `enabled_contexts` → `enabled_features` and `context_mappings` addition — confirm or propose alternatives

## Change log

| Date | Who | Change |
|---|---|---|
| 2026-04-21 | main agent | Phase created. Subagent tasks defined. Awaiting analysis output. |
| 2026-04-22 | Agent A | Trace report delivered — 14/16 fields wired, 2 orphans (bypass_gate_seconds, enabled_contexts). |
| 2026-04-22 | Agent B | Types + naming proposal delivered — flat AgentExecutionConfig with helper aliases; confirm rename + add. |
| 2026-04-22 | main agent | DB migration applied (enabled_contexts → enabled_features, add context_mappings, rebuild view + 6 RPCs). Types regenerated. |
| 2026-04-22 | main agent | Code-side Phase 3.6 complete. Added AgentPresentationConfig / AgentEnvironmentBindings / AgentValueDefaults helper aliases on AgentExecutionConfig. Added contextMappings to AgentExecutionConfig + AgentShortcut + RPC types + converters + slice/selectors/thunks + API routes + ShortcutForm JSON editor. Renamed enabledContexts → enabledFeatures across types, converters, slice, selectors, thunks, forms, list filter, category slice/converter/types. Added bypassGateSeconds to InstanceUIState + init payload + createInstanceFromShortcut + launchAgentExecution. Wired bypass countdown into AgentGateBody (auto-advance after N seconds, any keyboard/pointer interaction cancels). Wired contextMappings as 5th arg to mapScopeToInstance with precedence: scopeMappings → contextMappings → ad-hoc. |
