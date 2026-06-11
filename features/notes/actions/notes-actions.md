# Notes actions (cross-app integration)

> **This document is a living reference.** Any agent or developer who uses, adds, removes, or modifies a notes action **must** update this file before finishing their task:
>
> 1. **Added a new action?** Add a row to the exports table below and set its usage count to 0.
> 2. **Consumed an action in a new file?** Increment the usage count and add the file path to the usage map.
> 3. **Removed a consumer?** Decrement the count and remove the file path.
> 4. **Renamed or deleted an action?** Remove or update its row everywhere it appears.
> 5. **Changed `openSaveToNotes` usage?** Update the dedicated section at the bottom.
>
> Stale data here causes integration bugs and wasted investigation time. Keep it accurate.

Source: `features/notes/actions/`. Import from `@/features/notes` (barrel re-exports) or `@/features/notes/actions` for explicit paths.

| Export | Purpose |
|--------|---------|
| **QuickCaptureButton** | Toolbar control that dispatches `openSaveToNotes` so `OverlayController` opens the global quick-save flow. Needs Redux + overlay stack. |
| **QuickNoteSaveModal** | Controlled dialog: edit content, pick folder, create vs update (append/overwrite). `OverlayController` wraps it with `NotesProvider` when opened globally. |
| **QuickSaveModal** | Alias of `QuickNoteSaveModal` — same component, shorter name for call sites. |
| **SaveToScratchButton** | One-click `NotesAPI.create` into the **Scratch** folder (no modal). |
| **SaveSelectionButton** | On click, reads `window.getSelection()`, saves to a folder (default Scratch), clears selection. |
| **QuickNotesButton** | Icon button calling `useQuickActions().openQuickNotes()` (opens quick-notes overlay). |
| **QuickNotesSheet** | In-overlay compact notes UI (editor + folder/note picker). Consumed by `OverlayController`; can be composed elsewhere inside `NotesProvider`. |
| **CategoryNotesModal** | Folder-scoped modal: list/search notes in one `folder_name`, optional create/edit/delete/import, `onSelectNote` for picking a note into another flow. Requires `NotesProvider` ancestor. |
| **WindowNotesBody** | Lightweight single-note editor for embedding in draggable windows / panels. Includes own `NotesProvider`, auto-save, auto-label, tree-view picker, and new-note button. No external provider needed. |
| **NotesTreeView** | VS Code-style folder/note tree with single-folder expand, inline note creation, inline folder creation, and `onSelectNote`/`onSelectFolder` callbacks. Requires `NotesProvider` ancestor. |
| **NotePickerPopover** | Lazy-loaded searchable popover (Drawer on mobile) with collapsible folder tree (same browse pattern as `NotesTreeView`). Fetches lightweight list items on open; parent fetches full note on select. No `NotesProvider` required. Path: `features/notes/components/NotePickerPopover.tsx`. |
| **NotesWindow** | Complete self-contained `WindowPanel` with `NotesTreeView` sidebar + single-note editor. Bundles own `NotesProvider`. Accepts all `WindowPanelProps` (id, initialRect, onClose, etc.). Header has left/right action zones (sidebar toggle, +, save, open-in-tab). |
| **SidebarNotesToggle** | Shell sidebar button that toggles a floating `NotesWindow`. Renders the window via portal on toggle. No provider needed. |

**Also common (not in this folder):** many features call `openSaveToNotes` from `@/lib/redux/slices/overlaySlice` directly instead of using `QuickCaptureButton`.

---

## Usage map (reference examples)

Counts are **distinct files** that reference the symbol or mount the component (excluding the defining file and barrel `index.ts`). *Zero* means nothing imports it yet — the barrel still exports it for app-wide use.

| Export | Usages | Reference files |
|--------|--------|-----------------|
| **QuickCaptureButton** | 0 | — *(none yet)* |
| **QuickNoteSaveModal** | 1 | `components/overlays/OverlayController.tsx` (dynamic import + `NotesProvider` wrapper) |
| **QuickSaveModal** | 0 | — *(alias only; use `QuickNoteSaveModal` path above)* |
| **SaveToScratchButton** | 0 | — |
| **SaveSelectionButton** | 0 | — |
| **QuickNotesButton** | 0 | — |
| **QuickNotesSheet** | 1 | `components/overlays/OverlayController.tsx` (dynamic import + `NotesProvider` wrapper) |
| **CategoryNotesModal** | 2 | `app/(authenticated)/(admin-auth)/administration/official-components/component-displays/category-notes-modal.tsx`, `app/(authenticated)/(admin-auth)/administration/database/components/enhanced-sql-editor.tsx` |
| **WindowNotesBody** | 1 | `app/(ssr)/ssr/demos/window-demo/window-bodies/NotesWindowBody.tsx` |
| **NotesTreeView** | 2 | `features/notes/actions/WindowNotesBody.tsx`, `features/notes/actions/NotesWindow.tsx` |
| **NotesWindow** | 2 | `app/(ssr)/ssr/demos/window-demo/page.tsx`, `features/notes/actions/SidebarNotesToggle.tsx` |
| **SidebarNotesToggle** | 1 | `features/ssr-trials/components/Sidebar.tsx` |

### `openSaveToNotes` (same UX as QuickCaptureButton)

Used without `QuickCaptureButton` in **6** files:  
`features/chat/components/response/assistant-message/MessageOptionsMenu.tsx`,  
`features/public-chat/components/PublicMessageOptionsMenu.tsx`,  
`components/content-editor/ContentManagerMenu.tsx`,  
`components/official-candidate/voice-pad/components/VoicePadExpanded.tsx`,  
`features/cx-chat/actions/messageActionRegistry.ts`,  
`features/cx-conversation/actions/messageActionRegistry.ts`.

---

## Comment reference

`features/tasks/components/QuickTasksSheet.tsx` documents the same overlay pattern as **`features/notes/actions/QuickNotesSheet.tsx`**.
