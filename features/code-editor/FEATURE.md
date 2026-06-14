# FEATURE.md — `code-editor` (legacy / embedded)

**Status:** `active` — **major upgrade incoming:** file-system + git repository integration + full agentic coding system
**Tier:** `1`
**Last updated:** `2026-04-28`

> This is the **embedded** code-editor surface — the one consumed by the agent builder, prompt-app editor, notes, and the V2 / V3 / Compact code editor variants. Its agent integration runs through the legacy widget-tool + Shortcuts pipeline.
>
> **Not to be confused with [`features/code/`](../code/FEATURE.md)** — the **new** VSCode-style standalone workspace mounted at `/code`. That workspace has its own Monaco instance, its own tabs/diagnostics/patches slices, and binds to the **new agent system** via `AgentRunnerPage` rather than via Shortcuts. The two editors share `vsc_*` context-key naming (the same Shortcut can bind to either) but are otherwise independent code paths. The chat-binding split:
>
> | Surface | Editor code | Chat / agent integration |
> |---|---|---|
> | This feature (`features/code-editor/`) | embedded multi-file core in builder / notes / app pages | legacy `cx-conversation` chat where embedded; Shortcuts via `UnifiedAgentContextMenu` (Phase 5) |
> | New workspace (`features/code/`) at `/code` | standalone Monaco + tabs + diagnostics + patches slices | new agents system via `AgentRunnerPage`; instance-context bridge (`editor.tab.*`, `editor.selection.*`); right-click currently uses Monaco-native actions only |

---

## Purpose

In-app code editing surface plus the foundation for **agentic coding** — AI-assisted multi-file editing where agents drive the editor instead of merely responding to prompts from it. The editor exposes a rich UI context (`vsc_*` keys) that Shortcuts bind against, and accepts agent output via widget tools (`widget_text_replace`, `widget_text_patch`, etc.).

---

## Entry points

**Feature code** (`features/code-editor/`)
- `agent-code-editor/` — the agent integration surface (Shortcuts, tool invocations, widget wiring)
- `multi-file-core/` — multi-file editing engine; the foundation other layers sit on
- `components/` — editor chrome, file tabs, panes
- `config/` — language defs, keybindings
- `docs/` — deeper references
- `hooks/`, `utils/`, `index.ts`

**Routes / consumers**
- The editor is embedded in multiple surfaces rather than a dedicated route. Consumers include: the authenticated app area for direct code editing, agent builder surfaces that need code input, documentation tools.

---

## Current capabilities

### Multi-file core
- Open multiple files; tabs; pane splits
- Per-file state (cursor, selection, dirty flag, undo history)
- Language-aware syntax highlighting
- Diagnostics surfacing (errors/warnings)

### Agent integration
- Exposed UI context to Shortcuts via the `vsc_*` key set:

| Variable | Source | Content |
|---|---|---|
| `vsc_active_file_path` | active file | Full path |
| `vsc_active_file_content` | active file | Full text |
| `vsc_active_file_language` | active file | Language ID (`python`, etc.) |
| `vsc_selected_text` | selection | Current highlight |
| `vsc_diagnostics` | diagnostics | Formatted errors/warnings |
| `vsc_workspace_name` / `vsc_workspace_folders` | workspace | Workspace metadata |
| `vsc_git_branch` / `vsc_git_status` | git | Git state |

These keys are the **contract** between the editor and Shortcuts running inside it. Adding or renaming a key means updating every Shortcut whose `scopeMappings` reference it.

### Agent output integration (widget tools)
- Agents call `widget_text_replace`, `widget_text_insert_before/after/prepend/append`, `widget_text_patch` to mutate file content
- Widget handles dispatch these via `dispatchWidgetAction` — stream does NOT pause
- See [`../agents/docs/WIDGET_HANDLE_SYSTEM.md`](../agents/docs/WIDGET_HANDLE_SYSTEM.md) for the canonical contract

---

## Data model

- In-memory file representation in the multi-file-core — content, language, cursor, selection, diagnostics
- Persistence is currently per-feature (files may live in various stores). The upcoming upgrade will unify this via proper file-system + git integration.

---

## Key flows

### Flow 1 — User runs a Shortcut in the editor

1. User selects code, opens context menu. Shortcuts filtered by `enabledContexts`.
2. Click → `scopeMappings` resolve from `vsc_*` UI context.
3. `createInstanceFromShortcut` → `launchConversation`.
4. Widget handle registered (editor is the widget). Agent returns `widget_text_replace` → selected text replaced.

### Flow 2 — Multi-file context for an agent

1. User opens the editor with several files open.
2. Shortcut invocation bundles context from the active + open files using multi-file-core.
3. Agent sees the full picture, not just the active file.

### Flow 3 — Diagnostics-driven assistance

1. Compiler surfaces diagnostics.
2. Shortcut `vsc_diagnostics` mapping bundles formatted errors into the agent's variable.
3. Agent responds with fixes via widget tools.

---

## Roadmap — upcoming major upgrade

This section is **explicitly forward-looking**. Treat everything in it as planned, not shipped, unless also present in the "Current capabilities" section.

### File-system integration
- Mount local / remote file systems
- Unified file storage backing the multi-file-core
- Open folders as workspaces, not just individual files

### Git repository integration
- Branch awareness, diffs, commits, remote sync
- Git-aware diagnostics and history
- Branch-scoped conversations

### Full agentic coding system
- Agents **drive** the editor rather than respond to prompts from it
- Multi-file coordinated edits executed via tool calls, not individual widget actions
- Test + lint loops driven by the agent
- Long-running "coding session" agents that plan + execute
- First-class integration with the broader agent orchestration system ([`../agents/docs/AGENT_ORCHESTRATION.md`](../agents/docs/AGENT_ORCHESTRATION.md))

### Targets
- All of the above land as part of phase-15 (`features/agents/migration/phases/phase-15-native-code-editor.md`) and subsequent phases.

---

## Invariants & gotchas

- **Editor output integrates with agents via widget tools — no parallel patch system.** If you need to apply agent output to code, use `widget_text_*`.
- **The `vsc_*` UI-context key set is a contract.** Extending it means updating Shortcuts that bind to new keys. Renaming is a breaking change.
- **Multi-file-core is foundational**; agent-code-editor is a consumer. Do not branch the core per-feature.
- **Widget actions do NOT pause the stream** — fire-and-forget. If you need the agent to see the result of an edit, use a durable delegated tool, not a widget tool.
- **The legacy `features/rich-text-editor/` is deprecated** — do not integrate the code-editor with it.
- **The old `features/code-files/` is deprecated** — replacement file-management lands as part of the file-system integration upgrade.

---

## Related features

- **Depends on:** `features/agents/` (runtime), `features/agent-shortcuts/` (UI-context contract consumer), widget tools system
- **Depended on by:** agentic coding workflows, any surface embedding code
- **Cross-links:** [`../agents/docs/WIDGET_HANDLE_SYSTEM.md`](../agents/docs/WIDGET_HANDLE_SYSTEM.md), [`../agent-shortcuts/FEATURE.md`](../agent-shortcuts/FEATURE.md), [`../agents/migration/phases/phase-06-code-editor-quick-wrapper.md`](../agents/migration/phases/phase-06-code-editor-quick-wrapper.md), [`../agents/migration/phases/phase-15-native-code-editor.md`](../agents/migration/phases/phase-15-native-code-editor.md)

---

## Change log

- `2026-04-22` — claude: initial FEATURE.md; documents current state + flags upcoming file-system / git / agentic-coding upgrade.
- `2026-04-28` — claude: clarified scope vs the new `features/code/` workspace at `/code`; added cross-reference table for chat-binding split (legacy `cx-conversation` + Shortcuts here vs new agents system + `AgentRunnerPage` there).
- `2026-06-14` — JSON blocks in streaming markdown: Darcula-inspired token colors via `config/syntax-themes.ts`; Prism view mode uses bare token keys (inline-style compatible); Monaco edit mode uses `matrx-json-dark` / `matrx-json-light` themes.

---

> **Keep-docs-live:** the upgrade is substantial — the "Roadmap" section will shrink and the "Current capabilities" section will grow as features land. Keep the delineation strict. Changes to the `vsc_*` UI-context key set MUST update this doc and cross-update Shortcuts that depend on it.
