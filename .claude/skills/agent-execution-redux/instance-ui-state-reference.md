# Agent Execution Redux — Instance UI State Reference

Current fields on `InstanceUIState` (source of truth: `features/agents/types/instance.types.ts`):

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `displayMode` | `ResultDisplayMode` | `"modal-full"` | Where/how the instance renders (modal-full, modal-compact, chat-bubble, inline, panel, toast) |
| `allowChat` | `boolean` | `true` | Whether multi-turn chat input is shown |
| `showVariablePanel` | `boolean` | `false` | Variable panel visibility |
| `isExpanded` | `boolean` | `true` | Collapsed/expanded state |
| `expandedVariableId` | `string \| null` | `null` | Which variable has an edit popover open |
| `isCreator` | `boolean` | `false` | Is current user the agent owner (snapshotted at creation) |
| `showCreatorDebug` | `boolean` | `false` | Show debug panels (request preview, provenance) |
| `submitOnEnter` | `boolean` | `true` | Enter submits vs Shift+Enter for newline |
| `autoClearConversation` | `boolean` | `false` | Wipe history between sends (builder/test mode) |
| `modeState` | `Record<string, unknown>` | `{}` | Arbitrary mode-specific state (scroll pos, active tab, etc.) |

Available actions: `initInstanceUIState`, `setDisplayMode`, `toggleExpanded`, `toggleVariablePanel`, `setAllowChat`, `updateModeState`, `setExpandedVariableId`, `toggleCreatorDebug`, `setSubmitOnEnter`, `setAutoClearConversation`.

## 🚨 A write that arrives before the instance is KEPT, not dropped (D326)

Every setter in `instance-ui-state.slice.ts` goes through ONE write path,
`stageOrApply`. Never write `const entry = state.byConversationId[id]; if (entry)
{ … }` again — that shape silently discarded any write aimed at a conversation
whose entry did not exist yet, which is the normal order of things: a launcher
hands a surface its `conversationId` before `createInstanceFull` writes the row,
and that is exactly when a mount-once effect fires. It cost the Masterwork
interview its "Your interviewer" hero and the Conductor its "who is in the room"
introduction — both dispatched three display overrides on mount, both were
no-ops whenever the row landed a beat later, neither logged anything.

What `stageOrApply` does when the entry is missing: creates it at this slice's
own documented defaults (the canonical factory is `initInstanceUIState`, so a
provisional entry is always COMPLETE), applies the write, logs a `console.error`
naming the action, and records the written fields in `pendingByConversationId`.
`initInstanceUIState` then REPLAYS those fields on top of the real entry for
every field the creation did not state itself, and clears the record. A setter
that needs the current value (a toggle, a merge into `modeState` or
`builderAdvancedSettings`) reads it with `readField`, which sees the staged
value too. `destroyInstance` / `removeInstanceUIState` clear the record so a
staged write is never replayed onto a later instance with the same id.

Guard: `features/agents/redux/execution-system/instance-ui-state/__tests__/no-write-is-dropped-before-the-instance-lands.test.ts`
— behaviour plus a census that fails if any setter returns to the drop pattern.
A surface must NOT gate its dispatch on the row's existence; that local
workaround is what this replaced.
