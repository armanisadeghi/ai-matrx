# FEATURE.md — `code` (the `/code` workspace)

**Status:** `active` — incremental enhancement (resource pills + error inspection + unified context menu in flight)
**Tier:** `1`
**Last updated:** `2026-04-28`

> The standalone, VSCode-style code workspace mounted at [`/code`](../../app/(a)/code/page.tsx). Distinct from [`features/code-editor/`](../code-editor/FEATURE.md), which is the **embedded** editor surface used by the agent builder, prompt-app editor, notes, and friends. The two share the `vsc_*` UI-context contract; everything else is independent.

> **Architectural truth source:** [`SYSTEM_STATE.md`](./SYSTEM_STATE.md) is the authoritative deep-dive — entry points, panel layout, adapter interfaces, sandbox APIs, persistence, terminal, source control, agent-context bridge, library sources, type environments. Read it before touching anything substantive. This FEATURE.md is the index.

---

## Purpose

A first-class in-app coding environment that runs against either a remote sandbox (EC2 or hosted Firecracker) or the local mock adapter. It is the primary surface for the agentic-coding upgrade: agents drive the editor, the editor drives the agents.

---

## Entry points

- **Route:** [`app/(a)/code/page.tsx`](../../app/(a)/code/page.tsx) → [`CodeWorkspaceRoute`](./host/CodeWorkspaceRoute.tsx) → [`CodeWorkspace`](./CodeWorkspace.tsx) → [`WorkspaceLayout`](./layout/WorkspaceLayout.tsx).
- **Layout:** [`app/(a)/code/layout.tsx`](../../app/(a)/code/layout.tsx). **Loading skeleton:** [`app/(a)/code/loading.tsx`](../../app/(a)/code/loading.tsx).
- **No sub-routes** — the workspace is a single SPA-style surface; deep state lives in URL params (`?agentId=…&conversationId=…`) and Redux.

---

## Sub-systems (one-liner each, see [`SYSTEM_STATE.md`](./SYSTEM_STATE.md) for full detail)

| Sub-system | Path | Responsibility |
|---|---|---|
| Activity bar | [`activity-bar/`](./activity-bar/) | Left rail icons; switches the side panel. |
| Side panels | [`views/`](./views/) (`explorer`, `sandboxes`, `library`, `chat`, `history`, `source-control`) | Activity-bar-driven side views. |
| Editor | [`editor/`](./editor/) | Monaco wrapper, tabs, toolbar, diff view (`TabDiffView`). |
| Bottom panel | [`terminal/`](./terminal/) | xterm + ports panel; persistent mount. |
| Adapters | [`adapters/`](./adapters/) | `FilesystemAdapter`, `ProcessAdapter`, `SandboxGitAdapter` — the seam between UI and runtime. |
| Library sources | [`library-sources/`](./library-sources/) | Fuses `code_files` with external tables (`prompt_apps`, `aga_apps`, `tool_ui_components`) behind one tree. |
| Agent context bridge | [`agent-context/`](./agent-context/) | Pushes `editor.tabs`, `editor.tab.<id>`, `editor.selection.<id>`, `editor.diagnostics` into instance-context. |
| Runtime | [`runtime/`](./runtime/) | Boot logic, session-report opener, sandbox heartbeat. |

### State (Redux slices owned by this feature)

| Slice | File | Stores |
|---|---|---|
| `tabs` | [`redux/tabsSlice.ts`](./redux/tabsSlice.ts) | Open tabs, dirty flags, MRU stack |
| `diagnostics` | [`redux/diagnosticsSlice.ts`](./redux/diagnosticsSlice.ts) | `EditorDiagnostic[]` keyed by `tabId` |
| `codePatches` | [`redux/codePatchesSlice.ts`](./redux/codePatchesSlice.ts) | Pending agent SEARCH/REPLACE patches |
| `codeEditHistory` | [`redux/codeEditHistorySlice.ts`](./redux/codeEditHistorySlice.ts) | Undo/redo across sessions |
| `codeWorkspace` | [`redux/codeWorkspaceSlice.ts`](./redux/codeWorkspaceSlice.ts) | Panel open/closed, active sandbox id, proxy URL |
| `fsChanges` | [`redux/fsChangesSlice.ts`](./redux/fsChangesSlice.ts) | RESOURCE_CHANGED events from agent tools |
| `terminal` | [`redux/terminalSlice.ts`](./redux/terminalSlice.ts) | Terminal session state |

---

## Chat & agent integration

This is the contract you must keep stable when adding features.

### Chat panel host
[`chat/ChatPanelSlot.tsx`](./chat/ChatPanelSlot.tsx) mounts [`AgentRunnerPage`](../agents/components/run/AgentRunnerPage.tsx) (the **new** agent system, *not* legacy `cx-conversation`). URL params:
- `?agentId=<uuid>` — required for the runner to mount; without it the slot shows the empty-state picker.
- `?conversationId=<uuid>` — optional; lags the focus registry on first message of a fresh chat (see [`ChatPanelSlot.tsx`](./chat/ChatPanelSlot.tsx) for the Redux focus-key fallback).

### Editor → agent context bridge
The bridge mounts unconditionally in [`ChatPanelSlot`](./chat/ChatPanelSlot.tsx) via [`useSyncEditorContext`](./agent-context/useSyncEditorContext.ts). It writes through [`setContextEntry`](../agents/redux/execution-system/instance-context/instance-context.slice.ts) to `instance-context` — *the same slot* the agent reads via `ctx.get(...)`.

### Stable context keys (the bridge contract)
Everything below is enumerated in [`agent-context/editorContextEntries.ts`](./agent-context/editorContextEntries.ts).

| Key | Source | Purpose |
|---|---|---|
| `editor.tabs` | open tabs | List of all open files (id, path, name, language). |
| `editor.tab.<tabId>` | active tab | Full tab state — content, dirty flag, pristine, language. |
| `editor.selection.<tabId>` | user action ("Send selection to chat") | Captured selection range + text + capturedAt. |
| `editor.diagnostics` | [`diagnosticsSlice`](./redux/diagnosticsSlice.ts) | Formatted errors/warnings of active tab. |

These keys map onto the cross-editor `vsc_*` Shortcut variables — when a Shortcut declares `scopeMappings: { vsc_active_file_content: "editor.tab.<tabId>" }`, the resolver pulls from this slot.

### Agent → editor integration
Two paths:
1. **Widget tools** (legacy embedded path, used by some agents): not the primary route here — see [`features/code-editor/FEATURE.md`](../code-editor/FEATURE.md).
2. **Patches** (preferred for the new workspace): agent emits SEARCH/REPLACE markdown blocks → [`useApplyAIPatchesToActiveTab`](./agent-context/useApplyAIPatchesToActiveTab.ts) stages them in [`codePatchesSlice`](./redux/codePatchesSlice.ts) → user reviews in [`TabDiffView`](./editor/TabDiffView.tsx) → accept dispatches `updateTabContent`. Fully reviewable, idempotent by `requestId:tabId:blockIndex`.
3. **Filesystem events** (agent ran a tool that wrote files): [`useApplyFsChangesToOpenTabs`](./agent-context/useApplyFsChangesToOpenTabs.ts) bridges the RESOURCE_CHANGED event into the live editor (refresh / close / conflict-warn).

---

## Sandbox runtime contract (summary)

`/code` runs against three orchestrator tiers via the same adapter interface:
- **Mock** — in-memory; demos.
- **EC2** — long-lived shared sandboxes.
- **Hosted (Firecracker)** — per-user microVMs with a persistent `/home/agent` volume.

Tier selection happens at `New sandbox` time and sticks per-user (`userPreferences.coding.lastSandboxTier`). Detail lives in [`SANDBOX_DIRECT_ENDPOINTS.md`](./SANDBOX_DIRECT_ENDPOINTS.md) and [`SANDBOX_PROXY_AND_FS_EVENTS_FE_INTEGRATION.md`](./SANDBOX_PROXY_AND_FS_EVENTS_FE_INTEGRATION.md).

---

## Invariants & gotchas

- **Two editor surfaces share the `vsc_*` contract; do not split it.** A Shortcut written for one editor must work in the other. Adding/renaming a `vsc_*` key updates both [`features/code-editor/FEATURE.md`](../code-editor/FEATURE.md) and this doc.
- **The chat panel uses the new agent system — never legacy `cx-conversation`.** If you find yourself importing from `features/cx-conversation/` here, you are off-path.
- **Patches are the integration model, not widgets.** Agent output that changes files goes through [`codePatchesSlice`](./redux/codePatchesSlice.ts), not `widget_text_*`. Widget tools belong in the embedded editor.
- **The surface is fully wired to the agent-context system** (`matrx-user/code-editor`). The editable Monaco region is wrapped by [`CodeWorkspaceContextMenu`](./agent-context/CodeWorkspaceContextMenu.tsx) (`isEditable`, agent output applies via `executeEdits`); the read-only diff/preview regions (`TabDiffView` / `TripleDiffView` / `RenderPreviewView`) by [`CodeReadonlyContextMenu`](./agent-context/CodeReadonlyContextMenu.tsx) (`isEditable={false}`, acts on the user's DOM selection). Both assemble scope through the shared [`buildCodeWorkspaceContextData`](./agent-context/buildCodeWorkspaceContextData.ts), which emits the manifest's declared SurfaceValues + the generic baselines + the `vsc_*` contract in one bag. Monaco's native IDE actions (Format, Go to Definition) stay on the command palette; the three custom send-to-chat actions live in [`useEditorContextMenuActions`](./agent-context/useEditorContextMenuActions.ts).
- **Instance-context entries persist across turns** — they are *not* the right place for ephemeral, per-message resources (errors, code snippets selected to attach). For that, use the new `editorResourcesSlice` introduced in Phase 21.
- **The activity bar's bottom-panel toggle is independent of the side-panel state** — never collapse them through the same imperative call.
- **Sandbox routes have a 300s `maxDuration` ceiling on Vercel Pro** — see the 2026-04-26 maxDuration correction in [`SYSTEM_STATE.md`](./SYSTEM_STATE.md). Long-running operations must talk to the orchestrator directly, bypassing the Vercel proxy.

---

## Related features

- **Depends on:** [`features/agents/`](../agents/) (runtime + AgentRunnerPage), [`features/agent-shortcuts/`](../agent-shortcuts/) (UI-context contract consumer), the orchestrator services described in [`SANDBOX_DIRECT_ENDPOINTS.md`](./SANDBOX_DIRECT_ENDPOINTS.md).
- **Depended on by:** the `/code` route exclusively. Other surfaces use [`features/code-editor/`](../code-editor/FEATURE.md).
- **Cross-links:** [`SYSTEM_STATE.md`](./SYSTEM_STATE.md), [`QA_CHECKLIST.md`](./QA_CHECKLIST.md), [`features/code-editor/FEATURE.md`](../code-editor/FEATURE.md), [`features/agents/migration/phases/phase-21-code-workspace-resource-pills.md`](../agents/migration/phases/phase-21-code-workspace-resource-pills.md), [`features/agents/migration/phases/phase-15-native-code-editor.md`](../agents/migration/phases/phase-15-native-code-editor.md).

---

## Change log

- `2026-06-23` — Completed `matrx-user/code-editor` agent-context wiring: `buildCodeWorkspaceContextData` now emits the manifest's declared SurfaceValues (`current_file_*`, `selection_range`, `open_file_paths`, …) + generic baselines (`text_before`/`text_after`/`context`) alongside the `vsc_*` contract; `CodeWorkspaceContextMenu` flipped to `isEditable` and wires `onTextReplace`/insert via Monaco `executeEdits`; added `CodeReadonlyContextMenu` on the diff/preview regions; commit-message box → `ProTextarea`.
- `2026-06-22` — Extracted `buildCodeWorkspaceContextData` + `CODE_WORKSPACE_CONTEXT_MENU_PROPS` so `/code` and context-menu demo harnesses share one context shape.
- `2026-05-06` — claude: added `"render-preview"` tab kind + render-preview registry (`features/code/preview/`). Library sources can register a previewer for their `tabIdPrefix`; tabs from those sources get an "Open preview" eye icon that pops a paired preview tab. Live buffer flows through `useDeferredValue`; Refresh button forces a remount. Source-tab close cascades to its preview tab. Used by the agent-apps editing route — see `features/agent-apps/code-preview/`.
- `2026-04-28` — claude: initial FEATURE.md (index pointing at `SYSTEM_STATE.md`); explicit chat-binding split vs `features/code-editor/`; documents the bridge context-key contract; flags Phase 21 (resource pills + unified context menu) as in-flight.

---

> **Keep-docs-live:** when the bridge context-key contract changes, **both** this doc and [`features/code-editor/FEATURE.md`](../code-editor/FEATURE.md) must update — the contract spans both editors. When the panel layout, sandbox tiers, or adapter interfaces change, [`SYSTEM_STATE.md`](./SYSTEM_STATE.md) is the source of truth and gets updated; this index only changes when the *index* shape changes.
