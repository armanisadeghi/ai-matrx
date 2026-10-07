# Phase 21 — Code Workspace: Resource Pills, Error Inspection, Unified Context Menu

**Status:** code-complete (smoke testing pending)
**Owner:** claude
**Prerequisites:** Phase 3 (Unified Agent Context Menu), Phase 5 (context-menu integration sweep), Phase 7 (chat route)
**Unblocks:** Phase 6 (code-editor quick wrapper) — partially: this phase covers the new `(a)/code` workspace, leaving the V2/V3/Compact agent-id question for the embedded editor untouched.

> Numbered 21 to sit after the 14→20 deletion sequence, since this is enhancement work on the **new** workspace (`features/code/`), not migration of the **legacy** embedded editor (`features/code-editor/`). It does not gate or get gated by 14–20.

## Goal

Bring the new code workspace at [`/code`](../../../app/(a)/code/page.tsx) up to parity with modern AI editors on three fronts:

1. **Hover-to-send error**: every Monaco diagnostic exposes a one-click "send to chat" affordance — both via Monaco hover (in-place) and via a Problems panel (list).
2. **Resource pills in the agent runner input**: extend the new agent runner with a visual pill bar above the input. Errors, code snippets, and file references show as chips; on submit they are appended to the user message text wrapped in XML; on load they re-render as visual chips.
3. **Unified context menu**: replace Monaco's native right-click with [`UnifiedAgentContextMenu`](../../../context-menu-v2/UnifiedAgentContextMenu.tsx). The Radix menu surfaces Monaco's IDE actions (Format, Go to Definition, Rename, etc.) inside an "Editor Actions" group while exposing the user's agent shortcuts under the standard placement types.

The pill system is the foundation. The error inspection consumes it. The unified menu finishes the surface.

## Why now

- The new `(a)/code` workspace is the strategic in-app coding environment ([`features/code/SYSTEM_STATE.md`](../../../code/SYSTEM_STATE.md)). It already has tabs / diagnostics / patches / sandbox bridges shipped, but the **chat-input UX** lags Cursor / Claude Code / Continue.dev: no visual attachments, no per-error actions, no agent shortcut surface on right-click.
- The legacy [`cx-conversation`](../../../cx-conversation/) chat has a complete, tested XML-resource pipeline. We **port the patterns** (pills above input, XML wrap on submit, parse + render chips on load). We do not port the code — the new agent runner has its own lifecycle and a different state model (block-based, server-resolved).
- Phase 4 power features (Cmd+K inline edit, ghost-text, @-mentions, AI terminal) all build on the resource-pill foundation. Landing it now unblocks the rest of the roadmap.

## Success criteria

### 21.A — Resource pill foundation (Phase 2 of the plan)
- [ ] `features/agents/redux/editor-resources/editorResourcesSlice.ts` exists and is registered in [`lib/redux/store.ts`](../../../../lib/redux/store.ts).
- [ ] `EditorResource` discriminated union covers `error`, `code_snippet`, `file_reference`. Schema is extension-friendly (adding `terminal_output`, `web_page`, etc. requires only a new union case + render branch).
- [ ] `<EditorResourcePills />` mounted above the agent-runner textarea, only rendered when `resources.length > 0`.
- [ ] Pills use Lucide icons + project semantic tokens — `bg-destructive/10` for errors, `bg-primary/10` for snippets, `bg-muted` for file refs. Each has an X button.
- [ ] `formatEditorResourceToXml(resource)` and `parseEditorResourcesFromMessage(content)` round-trip every resource type byte-identical (modulo XML escaping of `<`, `>`, `&`).
- [ ] Submit thunk appends serialized XML to user message text **then** dispatches `clearEditorResources(conversationId)` — no double-send on retry.
- [ ] New tags (`<attached_editor_resources>`, `<resource type="…">`) registered in [`content-prefilter`](../../../agents/redux/execution-system/utils/content-prefilter.ts) so streaming classification doesn't misroute them.
- [ ] Markdown renderer at [`components/mardown-display/chat-markdown/`](../../../../components/mardown-display/chat-markdown/) recognizes the new tags and renders chips, not raw XML; raw XML is stripped from the user-visible markdown body.
- [ ] Reload after send: pills render identically. Hand-crafted XML round-trips: pills render identically.

### 21.B — Error inspection (Phase 1 of the plan)
- [ ] `useDiagnosticHoverActions` registers a Monaco `HoverProvider` with `enableCommandUris` such that hovering a diagnostic shows `[Send to chat ↗]`, clickable to dispatch `addEditorResource` of type `error`.
- [ ] `<DiagnosticChip />` component is shared between Monaco hover and a new `<ProblemsPanel />` list view.
- [ ] `ProblemsPanel` registered as a bottom-panel tab ([`WorkspaceLayout`](../../../code/layout/WorkspaceLayout.tsx)) showing all diagnostics for the active tab with a "→ Chat" button per row.
- [ ] Hover and panel actions both produce identical `error` resource objects (path, line, severity, source, code, message, surrounding code snippet).

### 21.C — Unified context menu (Phase 3 of the plan)
- [ ] [`MonacoEditor.tsx`](../../../code/editor/MonacoEditor.tsx) sets `contextmenu: false`.
- [ ] New `<CodeWorkspaceContextMenu />` wraps the editor container and dispatches the live `vsc_*` keys to `UnifiedAgentContextMenu`.
- [ ] `buildMonacoActionItems(editor)` enumerates `editor.getSupportedActions()` and exposes a stable list of IDE actions for the "Editor Actions" group. Falls back to Monaco's command palette (`F1`) for any action gated by an internal context key.
- [ ] The three existing AI actions (`Send selection to chat`, `Send file to chat`, `Ask AI in floating window…`) move from `editor.addAction` registrations to Radix menu items in the unified menu's "AI Actions" placement; produce resource pills (not just instance-context entries) where appropriate.
- [ ] Right-click anywhere in the editor opens the unified menu — Monaco's native menu does not appear.

### 21.D — Cross-cutting
- [ ] [`features/code/FEATURE.md`](../../../code/FEATURE.md) and [`features/code-editor/FEATURE.md`](../../../code-editor/FEATURE.md) updated when any contract changes.
- [ ] No new `index.ts` barrel files (per [`CLAUDE.md`](../../../../CLAUDE.md)).
- [ ] No `window.confirm/alert/prompt` introduced.
- [ ] [`INVENTORY.md`](../INVENTORY.md) and [`MASTER-PLAN.md`](../MASTER-PLAN.md) updated with this phase's status + change log.

## Out of scope
- Phase 4 power features (Cmd+K inline edit, ghost-text completions, @-mentions, AI terminal panel, code lens, multi-file Composer, etc.) — these get their own phase docs once 21 lands.
- The legacy embedded editor at [`features/code-editor/`](../../../code-editor/). It already has [`UnifiedAgentContextMenu`](../../../code-editor/components/CodeEditorContextMenu.tsx) wired (Phase 5) and uses widget tools, not patches. Touching it is Phase 6 / Phase 15 territory.
- Any change to the bridge context-key contract (`editor.tabs`, `editor.tab.<id>`, etc.). The bridge feeds resources but the keys themselves are stable.
- Server-side XML injection. Client-side handles wrap-on-submit and parse-on-render; server treats user message text as opaque.

## Task breakdown

### 21.1 — Editor resources slice
Create `features/agents/redux/editor-resources/{editorResourcesSlice.ts, selectors.ts, types.ts}`. Shape `{ byConversationId: Record<string, EditorResource[]> }`. Actions: `addEditorResource`, `removeEditorResource`, `clearEditorResources`. Register in [`lib/redux/store.ts`](../../../../lib/redux/store.ts).

### 21.2 — XML utilities
Create `../aidream/apps/shared/chat/src/agents/utils/editor-resource-xml.ts`. Direct port of [`features/prompts/utils/resource-formatting.ts`](../../../prompts/utils/resource-formatting.ts) and [`features/prompts/utils/resource-parsing.ts`](../../../prompts/utils/resource-parsing.ts), simplified to the new union. Tag schema is `<attached_editor_resources><resource type="…" id="…"><metadata>…</metadata><content>…</content></resource></attached_editor_resources>` with per-type `<metadata>` fields.

### 21.3 — Pill component
Create `features/agents/components/run/input/EditorResourcePills.tsx`. Pattern: [`ResourceChips.tsx`](../../../prompts/components/resource-display/ResourceChips.tsx).

### 21.4 — Submit + clear
Locate the runner's user-message send path (a thunk inside [`../aidream/apps/shared/chat/src/agents/redux/execution-system/`](../../../agents/redux/execution-system/)). Append serialized XML, then dispatch `clearEditorResources`. Mount `<EditorResourcePills />` above the textarea.

### 21.5 — Tag classification + markdown rendering
Update [`content-prefilter.ts`](../../../agents/redux/execution-system/utils/content-prefilter.ts) so the new tag names don't get misrouted during streaming. Add an `EditorResourcesRenderer` to the chat-markdown registry that strips XML and renders chips.

### 21.6 — Diagnostic hover + Problems panel
Create `features/code/agent-context/useDiagnosticHoverActions.ts` (Monaco `HoverProvider` with `enableCommandUris`). Create `features/code/diagnostics/{DiagnosticChip.tsx, ProblemsPanel.tsx}`. Mount the hook in [`EditorArea`](../../../code/editor/EditorArea.tsx); register `ProblemsPanel` as a bottom-panel tab in [`WorkspaceLayout`](../../../code/layout/WorkspaceLayout.tsx).

### 21.7 — Unified context menu wrapper
Create `features/code/agent-context/{CodeWorkspaceContextMenu.tsx, buildMonacoActionItems.ts}`. Set `contextmenu: false` on Monaco. Wrap the editor container in [`EditorArea`](../../../code/editor/EditorArea.tsx) with the dynamic-imported wrapper. Migrate the three existing AI actions from [`useEditorContextMenuActions`](../../../code/agent-context/useEditorContextMenuActions.ts) into the Radix menu.

### 21.8 — Doc sync
Update FEATURE.md docs, [`INVENTORY.md`](../INVENTORY.md), [`MASTER-PLAN.md`](../MASTER-PLAN.md), this phase's change log.

## Verification

End-to-end against `http://localhost:3000/code?agentId=<test-agent>` via the dev auto-login URL.

1. Open a TS file with intentional type error → confirm Monaco hover shows `[Send to chat ↗]`. Click → pill appears.
2. Open Problems panel → same diagnostic listed → click "→ Chat" → second pill appears. Verify removable via X.
3. Right-click selection → confirm `UnifiedAgentContextMenu` opens with: agent shortcuts (filtered by `code-editor` context), three AI actions, and an "Editor Actions" group with Monaco's commands. Verify Monaco's native menu does NOT appear.
4. Invoke a Monaco IDE action from the unified menu (e.g., Format Document) → confirm it executes.
5. Invoke an agent shortcut → confirm `vsc_*` keys (selection, file path, language, diagnostics) populated correctly via `scopeMappings`.
6. With pill present, type a question and submit → inspect Redux/DB → user message contains `<attached_editor_resources>…</attached_editor_resources>` followed by prose.
7. Reload conversation → user bubble shows prose + visual chips, no raw XML visible.
8. Send hand-crafted XML via API directly → renders identically (round-trip parity).
9. Verify no `index.ts` barrel files were created and no `window.confirm/alert/prompt` introduced.

## Decisions

- **Context-menu strategy: replace Monaco's, surface IDE actions inside Radix.** Confirmed by user 2026-04-28. Fallback to Monaco's command palette (`F1`) for any action gated by an internal context-key. This avoids Radix-vs-Monaco z-index fights and gives one unified surface.
- **Phase order: 21.A (pills) → 21.B (errors) → 21.C (menu).** The pill foundation is the substrate the others consume; landing it first prevents rework.
- **New slice, not extending instance-context.** Pills are *single-message* ephemeral inputs; instance-context is *persistent across turns*. Different lifecycle = different slice. Reuse styling, not state.

## Change log
| Date | Who | Change |
|---|---|---|
| 2026-04-28 | claude | Phase doc created. Phase 0 (docs pass) complete: updated [`features/code-editor/FEATURE.md`](../../../code-editor/FEATURE.md), created [`features/code/FEATURE.md`](../../../code/FEATURE.md), added this phase doc. Implementation phases 21.1–21.7 pending. |
| 2026-04-28 | claude | Code-complete. **21.A pills:** extended `ResourceBlockType` with `editor_error` + `editor_code_snippet` (no parallel slice — reused `instance-resources` per CLAUDE.md "no parallel state"); added [`editor-resource-xml.ts`](../../../utils/editor-resource-xml.ts) (XML serialize/escape + source types); added [`add-editor-resources.ts`](../../../utils/add-editor-resources.ts) (`addEditorErrorResource`, `addEditorCodeSnippetResource`, `editorErrorDedupeKey`); added `selectEditorResourceXml` selector and made `selectResourcePayloads` skip editor types; weaved XML into `assembleRequest` text part and aligned the optimistic message path so chips render immediately and on reload; extended [`SmartAgentResourceChips`](../../../components/inputs/resources/SmartAgentResourceChips.tsx) display map + label for the new types; registered tags in [`content-prefilter.ts`](../../../redux/execution-system/utils/content-prefilter.ts) and [`content-splitter-v2.ts`](../../../../../components/mardown-display/markdown-classification/processors/utils/content-splitter-v2.ts) with attribute pass-through to `block.metadata`; added [`EditorErrorBlock`](../../../../../components/mardown-display/blocks/editor-resources/EditorErrorBlock.tsx) and [`EditorCodeSnippetBlock`](../../../../../components/mardown-display/blocks/editor-resources/EditorCodeSnippetBlock.tsx) with hover-card details; registered in [`BlockComponentRegistry`](../../../../../components/mardown-display/chat-markdown/block-registry/BlockComponentRegistry.tsx) and [`BlockRenderer`](../../../../../components/mardown-display/chat-markdown/block-registry/BlockRenderer.tsx). **21.B errors:** added [`useDiagnosticHoverActions`](../../../../code/agent-context/useDiagnosticHoverActions.ts) — Monaco `HoverProvider` with command-URI + `editor.registerCommand("matrx.ai.sendDiagnosticToChat")`, dedupe by file+line+code, pulls ±2 lines of surrounding code; mounted in [`EditorArea`](../../../../code/editor/EditorArea.tsx). Problems panel deferred (not in user's explicit ask). **21.C menu:** disabled Monaco's native context menu (`contextmenu: false` in [`MonacoEditor.tsx`](../../../../code/editor/MonacoEditor.tsx)); created [`CodeWorkspaceContextMenu`](../../../../code/agent-context/CodeWorkspaceContextMenu.tsx) wrapping Monaco with `UnifiedAgentContextMenu` — passes the full `vsc_*` UI-context contract (active file path/content/language, selection, current diagnostics, all diagnostics, line/column counts, has-selection flag); mounted in [`EditorArea`](../../../../code/editor/EditorArea.tsx). Monaco's IDE actions remain accessible via the command palette (`F1` / `Cmd+Shift+P`); injecting them into the Radix menu's "Editor Actions" group is deferred — the unified menu doesn't expose an extension point yet, tracked as future work. **Verification:** dev server compiles cleanly across all touched files; no module-resolution or type errors. End-to-end browser smoke (open file with TS error → hover → "Send to AI chat" → chip in input → submit → reload → chip in stored bubble) is the next step. |
