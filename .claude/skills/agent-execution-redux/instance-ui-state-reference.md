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
