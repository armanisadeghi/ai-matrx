# Agent definition slice — external writers review

Scope: thunks, hooks, and direct `dispatch` call sites **outside** [`slice.ts`](./slice.ts) / [`thunks.ts`](./thunks.ts) in this folder that mutate `state.agentDefinition`.

Field names are camelCase `AgentDefinition` / record keys (see [`agent-definition.types.ts`](../../types/agent-definition.types.ts); DB columns in [`database.types.ts`](../../../../types/database.types.ts) `agx_agent` / `agx_version`).

**Overwrite problem?** — Only flag when this path can **assign** a field **without** an authoritative value for that field from its own source (e.g. coerced defaults, omitted columns, localStorage). Assumes DB-backed data is stable within a session; **do not** treat “newer full fetch vs older partial fetch” as an overwrite issue.

---

## Writers table

| name | file | fields fetched | fields updated | overwrite problem? |
|------|------|----------------|----------------|--------------------|
| `buildAgentShortcutMenu` | [`features/agents/redux/agent-shortcuts/thunks.ts`](../agent-shortcuts/thunks.ts) | name<br>variableDefinitions<br>contextSlots<br>id<br>isVersion<br>parentAgentId | name<br>variableDefinitions<br>contextSlots<br>id<br>isVersion<br>parentAgentId | **Yes** [^parseEmpty] — can write `variableDefinitions` / `contextSlots` as `[]` when the menu embed does not supply arrays; `mergeAndTrack` still applies those defined values. |
| `fetchShortcutsForContext` | [`features/agents/redux/agent-shortcuts/thunks.ts`](../agent-shortcuts/thunks.ts) | variableDefinitions<br>contextSlots<br>id<br>isVersion<br>parentAgentId[^ctx] | variableDefinitions<br>contextSlots<br>id<br>isVersion<br>parentAgentId[^ctx] | **Yes** [^parseEmpty] [^ctx] — same coerced-`[]` risk; context merge always sends `contextSlots` even if `agent_context_slots` was omitted. |
| `useAgentAutoSave` (recovery) | [`features/agents/hooks/useAgentAutoSave.ts`](../../hooks/useAgentAutoSave.ts) | —[^autosave] | —[^autosave] | **Yes** [^autosave] — `localStorage` is not session-authoritative; recovery can restore fields and extra keys out of sync with current Redux after navigation, reload, or multi-tab. |
| `setAgentMessages` | [`AgentBuilderLeftPanel.tsx`](../../components/builder/AgentBuilderLeftPanel.tsx), [`MessageItem.tsx`](../../components/builder/message-builders/MessageItem.tsx), [`SystemMessage.tsx`](../../components/builder/message-builders/system-instructions/SystemMessage.tsx), not-used: [`AgentSystemMessage.tsx`](../../components/builder/message-builders/not-used/AgentSystemMessage.tsx), [`AgentMessageItem.tsx`](../../components/builder/message-builders/not-used/AgentMessageItem.tsx), [`AgentMessages.tsx`](../../components/builder/message-builders/not-used/AgentMessages.tsx) | — | messages | **No** |
| `setAgentVariableDefinitions` | [`AgentVariablesPanel.tsx`](../../components/variables-management/AgentVariablesPanel.tsx), [`AgentVariablesManager.tsx`](../../components/variables-management/AgentVariablesManager.tsx), [`AgentVariablesManager-2.tsx`](../../components/variables-management/AgentVariablesManager-2.tsx) | — | variableDefinitions | **No** |
| `setAgentTools` | [`AgentToolsManager.tsx`](../../components/tools-management/AgentToolsManager.tsx) | — | tools | **No** |
| `setAgentCustomTools` | [`AgentToolsManager.tsx`](../../components/tools-management/AgentToolsManager.tsx) | — | customTools | **No** |
| `setAgentMcpServers` | [`AgentToolsManager.tsx`](../../components/tools-management/AgentToolsManager.tsx) | — | mcpServers | **No** |
| `resetAgentField` | [`AgentToolsModal.tsx`](../../components/tools-management/AgentToolsModal.tsx) | — | —[^resetField] | **No** |
| `setAgentContextSlots` | [`AgentContextSlotsManager.tsx`](../../components/context-slots-management/AgentContextSlotsManager.tsx) | — | contextSlots | **No** |
| `setAgentField` | [`AgentModelConfiguration.tsx`](../../components/builder/AgentModelConfiguration.tsx), [`AgentSettingsCore.tsx`](../../components/settings-management/AgentSettingsCore.tsx), [`AgentSettingsModal.tsx`](../../components/settings-management/AgentSettingsModal.tsx), [`AgentInlineControls.tsx`](../../components/settings-management/not-used/AgentInlineControls.tsx) | — | —[^setField] | **No** |
| `setAgentSettings` | [`AgentSettingsCore.tsx`](../../components/settings-management/AgentSettingsCore.tsx), [`AgentSettingsModal.tsx`](../../components/settings-management/AgentSettingsModal.tsx) | — | settings | **No** |
| `setActiveAgentId` | [`AgentListDropdown.tsx`](../../components/agent-listings/AgentListDropdown.tsx) | — | activeAgentId[^sliceRoot] | **N/A** |
| `undoAgentEdit` / `redoAgentEdit` | [`useAgentUndoRedo.ts`](../../hooks/useAgentUndoRedo.ts), [`UndoHistoryOverlay.tsx`](../../components/undo-history/UndoHistoryOverlay.tsx) | — | —[^undo] | **No** |
| `clearAgentUndoHistory` | [`UndoHistoryOverlay.tsx`](../../components/undo-history/UndoHistoryOverlay.tsx) | — | _undoPast<br>_undoFuture | **N/A** |

---

## Notes (out of ordinary)

[^parseEmpty]: In [`agent-shortcuts/thunks.ts`](../agent-shortcuts/thunks.ts), `parseVariableDefinitions` and `parseContextSlots` return `[]` when the raw value is not an array (including `null` / `undefined`). `mergeAndTrack` skips only `undefined`, so `[]` **does** merge and can replace slots/vars that were never supplied as real arrays on this payload. The same keys are then added to `_loadedFields` even when the written value was only that default.

[^ctx]: Does not merge `name`. Merge runs only when `resolved_id` is set **and** `agent_variable_definitions !== undefined`. When that branch runs, `contextSlots` is still always passed through `parseContextSlots(row.agent_context_slots)` even if that column was absent — see [^parseEmpty].

[^autosave]: Recovery dispatches `mergePartialAgent` with `id` and every key from the parsed JSON (`_dirty`, dirty field names, `_skipDirty`, etc.). Not all keys are valid `AgentDefinition` fields; anything defined is still written onto the record. Source is browser storage, not a guaranteed-current session snapshot.

[^resetField]: A single `keyof AgentDefinition` per dispatch — whichever `field` is passed to `resetAgentField`. Cell is `—` because the payload field varies.

[^setField]: A single `keyof AgentDefinition` per dispatch — whichever `field` is in the action payload. Cell is `—` because the payload field varies.

[^sliceRoot]: `activeAgentId` is slice root state, not `agents[id]`.

[^undo]: A single `keyof AgentDefinition` per undo/redo stack entry per dispatch. Cell is `—` because it varies.

---

## Entry points (files that trigger the rows above)

Shortcut thunks:

- [`app/(dev)/demos/notes/_components/SidebarClient.tsx`](../../../../app/(dev)/demos/notes/_components/SidebarClient.tsx) — `dispatch(buildAgentShortcutMenu())`, `dispatch(fetchShortcutsForContext({ ... }))`.

Autosave hook:

- [`features/agents/components/builder/AgentBuilder.tsx`](../../components/builder/AgentBuilder.tsx) — `useAgentAutoSave(agentId)`.

Builder / editor surfaces:

- [`app/(authenticated)/ai/agents/[id]/edit/page.tsx`](../../../../app/(authenticated)/ai/agents/[id]/edit/page.tsx) — renders `AgentBuilder`.
- [`features/agents/components/shared/AgentBuilderWrapper.tsx`](../../components/shared/AgentBuilderWrapper.tsx) — SSR wrapper → `AgentBuilder`.
- [`app/(dev)/demos/agents/[id]/edit/page.tsx`](../../../../app/(dev)/demos/agents/[id]/edit/page.tsx) — uses `AgentBuilderWrapper`.
- [`features/agents/components/builder/AgentBuilderDesktop.tsx`](../../components/builder/AgentBuilderDesktop.tsx), [`AgentBuilderMobile.tsx`](../../components/builder/AgentBuilderMobile.tsx).
- [`features/agents/components/builder/AgentBuilderLeftPanel.tsx`](../../components/builder/AgentBuilderLeftPanel.tsx).
- [`features/agents/components/builder/message-builders/MessageItem.tsx`](../../components/builder/message-builders/MessageItem.tsx), [`system-instructions/SystemMessage.tsx`](../../components/builder/message-builders/system-instructions/SystemMessage.tsx) — `useAgentUndoRedo`.
- [`features/agents/components/builder/AgentModelConfiguration.tsx`](../../components/builder/AgentModelConfiguration.tsx).
- [`features/agents/components/variables-management/AgentVariablesModal.tsx`](../../components/variables-management/AgentVariablesModal.tsx).
- [`features/agents/components/shared/AgentSharedHeader.tsx`](../../components/shared/AgentSharedHeader.tsx).
- [`components/overlays/OverlayController.tsx`](../../../../components/overlays/OverlayController.tsx).

---

## Coverage check (nothing else found)

- Repo-wide import of `@/features/agents/redux/agent-definition/slice` or `*/agent-definition/slice` is limited to this table plus [`lib/redux/rootReducer.ts`](../../../../lib/redux/rootReducer.ts) (reducer registration only).
- No other files `dispatch(mergePartialAgent(...))` outside [`agent-shortcuts/thunks.ts`](../agent-shortcuts/thunks.ts) and [`useAgentAutoSave.ts`](../../hooks/useAgentAutoSave.ts).
- All `agentDefinition/*` async thunk type strings live in [`agent-definition/thunks.ts`](./thunks.ts).

Internal writers (same directory): [`thunks.ts`](./thunks.ts) and [`slice.ts`](./slice.ts).
