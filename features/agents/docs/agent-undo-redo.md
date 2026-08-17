# Agents Feature

Agent builder and execution system for AI Matrx. Allows users to create, configure, and run AI agents with custom system prompts, messages, tools, context policies, and model settings.

## Undo/Redo System

The agent definition slice (`redux/agent-definition/slice.ts`) includes a full undo/redo stack for all field edits made through the builder UI.

### Architecture

Every call to `applyFieldEdit` (the shared write path for all `setAgent*` actions) pushes the previous value onto a per-agent `_undoPast` stack. The `undoAgentEdit` and `redoAgentEdit` actions move entries between `_undoPast` and `_undoFuture` following standard undo/redo semantics.

### Smart Compression

The stack uses three strategies to stay bounded while maximizing undo depth:

1. **Coalescing** (600ms window): Rapid edits to the same field merge into one entry, so typing doesn't create per-keystroke undo points.
2. **Entry limit**: Hard cap at 50 entries per agent. When exceeded, the middle of the stack is compressed by merging consecutive same-field entries and thinning every other entry. Recent entries (tail) and the oldest entry (head) are protected.
3. **Byte budget**: 2MB soft cap per agent. Large state snapshots (e.g., full messages arrays) are estimated and the stack is trimmed from the oldest middle entries when over budget.

This means 50 stored entries can represent 200+ logical user actions.

### Hook: `useAgentUndoRedo`

Located at `hooks/useAgentUndoRedo.ts`. Provides:

- `canUndo` / `canRedo` booleans (from selectors)
- `undo()` / `redo()` callbacks
- `undoHint` / `redoHint` platform-aware shortcut strings
- `platform` detection (mac/windows/ios/android/linux)

Keyboard shortcuts are registered automatically:
- **Mac**: Cmd+Z / Shift+Cmd+Z
- **Windows/Linux**: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y
- **iOS**: Shake gesture (native), menu hints shown
- Shortcuts only fire when focus is NOT on a native text input (textarea/input get browser-native undo)

### Context Menu Integration

`UnifiedContextMenu` accepts optional `onUndo`, `onRedo`, `canUndo`, `canRedo`, `undoHint`, `redoHint` props. When provided, Undo/Redo items appear at the top of the context menu with platform-appropriate shortcut hints. Both `SystemMessage` and `MessageItem` pass these props through via the hook.

### Lifecycle

- Undo stacks are cleared when a record is marked clean (`markAgentSaved`, `resetAllAgentFields`, `upsertAgent` with clean state).
- Stacks are per-agent — switching between agents preserves each agent's independent history.
- `clearAgentUndoHistory` action available for explicit stack reset without affecting current state.

### Selectors

- `selectAgentCanUndo(state, agentId)` / `selectAgentCanRedo(state, agentId)`
- `selectAgentUndoDepth(state, agentId)` / `selectAgentRedoDepth(state, agentId)`

### History Overlay

A "View History" option in the context menu opens a Sheet panel (`components/undo-history/UndoHistoryOverlay.tsx`) that shows the full undo/redo timeline. Users can click any entry to jump directly to that state (multi-step undo/redo).

The overlay is registered in the centralized overlay system:
- `overlaySlice.ts`: `undoHistory` overlay with `openUndoHistory({ agentId })` typed action creator
- `OverlayController.tsx`: dynamically imports and renders `UndoHistoryOverlay` when open
- Each entry shows the field name, timestamp (relative), and a preview of the value

The overlay provides:
- One-click undo/redo buttons with platform shortcut hints
- Click-to-jump on any entry (executes multiple undo/redo steps)
- Clear history button
- Memory usage display
- Empty state when no history exists
