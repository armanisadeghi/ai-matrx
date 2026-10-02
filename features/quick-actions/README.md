# Quick Actions Feature

Verified against code 2026-10-02.

The quick tools — Quick Chat, Quick Notes, Quick Tasks, the Scratchpad, Quick Data, Quick Scribe — are
**canvas tabs** (Arman, 2026-10-02). Their door is the account menu's **Quick Access** group
(`QUICK_ACCESS_ITEMS` in `features/shell/components/header/header-right-menu/userMenuItems.constants.ts`:
a `canvasTool` row opens a tab through `CanvasToolMenuItem`); `useQuickActions()` opens the same tabs from
code (the right-click menu's Quick Actions). Chat History, Quick Files and the Utilities Hub stay windows.

## Rules

- **A quick tool is ONE canvas kind beside its feature**, registered from `features/canvas/host/toolKinds.tsx`.
  Never a side panel, never a second floating surface over the canvas.
- **The body is the tool's canonical component**, lazy-loaded; the tab header carries its controls
  (`HeaderAction` / `menuItems`) — the body never draws a second title bar.
- **Every opener goes through `openToolInCanvas`** (`features/canvas/host/toolCanvas.ts`): announce a
  drop, and an open tab keeps its data unless the caller replaces it.
- **Quick Chat runs the chat package's `QuickChatSheet`** (`AgentConversationColumn` + `useAgentLauncher`
  + `resumeConversation` — exactly `/chat`) with `chrome="host"`; the tab remembers the conversation once
  it has a message, so a reload resumes it.

## Map

| Tool | Kind id · key | Kind file | Body |
|---|---|---|---|
| Quick Chat | `quick-chat` · `default` (a handed-off conversation: its id) | `canvas/quickChatKind.tsx` | `@ai-matrx/chat/quick-actions/components/QuickChatSheet` |
| Quick Data | `quick-data` · `default` | `canvas/quickDataKind.tsx` | `components/QuickDataSheet.tsx` |
| Scratchpad | `global-scratchpad` · `default` | `canvas/scratchpadKind.tsx` | chat package `ScratchpadQuickPanel` (+ `ScratchpadSwitcherMenu` in the header) |
| Quick Notes | `quick-notes` · `default` | `features/notes/canvas/quickNotesKind.tsx` | `features/notes/actions/QuickNotesSheet.tsx` |
| Quick Tasks | `quick-tasks` · `default` | `features/tasks/canvas/quickTasksKind.tsx` | `features/tasks/components/QuickTasksSheet.tsx` |
| Quick Scribe | `quick-scribe` · `default` (not restored) | `features/transcript-studio/canvas/quickScribeKind.tsx` | `features/transcript-studio/components/QuickScribeSheet.tsx` |

`components/UtilitiesOverlay.tsx` is the full-screen Utilities Hub; its Chat and Data tabs render the same
`QuickChatSheet` (inline chrome) and `QuickDataSheet`.

Guard: `features/canvas/__tests__/quick-tools-open-as-canvas-tabs.test.tsx`.
