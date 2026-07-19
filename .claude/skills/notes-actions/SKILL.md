---
name: notes-actions
description: Cross-app notes integration components and patterns. Use when adding save-to-notes functionality to any feature, wiring overlay-based note capture, using QuickCaptureButton, SaveToScratchButton, SaveSelectionButton, QuickNotesSheet, CategoryNotesModal, openSaveToNotes, or any file in features/notes/actions/. Also use when reviewing or modifying note action consumers.
---

# Notes Actions (Cross-App Integration)

## Quick Reference

**Source:** `features/notes/actions/`
**Imports:** Direct paths (e.g. `@/features/notes/actions/SaveToScratchButton`, `@/features/notes/service/notesApi`) — root and `actions/index` barrels were removed.
**Living doc:** `features/notes/actions/notes-actions.md` — **must be updated** whenever actions are added, removed, or consumed in new files.

## Available Actions

| Export | What it does |
|--------|-------------|
| `QuickCaptureButton` | Toolbar button dispatching `openSaveToNotes` for the global overlay flow |
| `QuickNoteSaveModal` | Dialog: edit content, pick folder, create vs update (append/overwrite) |
| `QuickSaveModal` | Alias of `QuickNoteSaveModal` |
| `SaveToScratchButton` | One-click `NotesAPI.create` into Scratch (no modal) |
| `SaveSelectionButton` | Reads `window.getSelection()`, saves to folder, clears selection |
| `QuickNotesButton` | Icon button calling `useQuickActions().openQuickNotes()` |
| `QuickNotesSheet` | In-overlay compact notes UI (editor + picker). Needs `NotesProvider` |
| `CategoryNotesModal` | Folder-scoped modal with list/search/CRUD/import + `onSelectNote` callback. Needs `NotesProvider` |
| `WindowNotesBody` | Lightweight single-note editor for windows/panels. Bundles own `NotesProvider`, auto-save, auto-label, tree-view picker |
| `NotesTreeView` | VS Code-style folder/note tree. Single-folder expand, inline create note/folder, `onSelectNote`/`onSelectFolder` callbacks. Needs `NotesProvider` |
| `NotesWindow` | Complete `WindowPanel` with tree sidebar + editor + header actions. Bundles own `NotesProvider`. Accepts all `WindowPanelProps` |
| `SidebarNotesToggle` | Shell sidebar button that toggles a floating `NotesWindow`. No provider needed |

## Integration Patterns

### Pattern 1: Redux overlay dispatch (most common)

Many features skip the button entirely and dispatch `openSaveToNotes` directly:

```typescript
import { openSaveToNotes } from '@/lib/redux/slices/overlaySlice';

dispatch(openSaveToNotes({ content, defaultFolder: 'Scratch' }));
```

`OverlayController` handles dynamic import of `QuickNoteSaveModal` and wraps it with `NotesProvider`.

### Pattern 2: Drop-in buttons

```typescript
import { SaveToScratchButton } from '@/features/notes/actions/SaveToScratchButton';

<SaveToScratchButton content={aiResponse} />
```

No provider or overlay wiring needed — the button calls `NotesAPI.create` directly.

### Pattern 3: Folder-scoped note picker

```typescript
import { CategoryNotesModal } from '@/features/notes/actions/CategoryNotesModal';

<CategoryNotesModal
  folderName="Prompts"
  onSelectNote={(note) => applyPrompt(note.content)}
/>
```

Requires `NotesProvider` ancestor.

### Pattern 4: Embedded sheet

```typescript
import { QuickNotesSheet } from '@/features/notes/actions/QuickNotesSheet';
```

Used inside `OverlayController` or any layout that provides `NotesProvider`.

## Maintenance Rules

**Every time you touch this system, update `features/notes/actions/notes-actions.md`:**

1. New action created → add row to exports table, set usage count to 0
2. Action consumed in a new file → increment count, add file path
3. Consumer removed → decrement count, remove file path
4. Action renamed/deleted → update or remove rows everywhere
5. `openSaveToNotes` usage changed → update its dedicated section

## Key Files

- (Barrels removed — import action components and `NotesAPI` from their source files under `features/notes/`.)
- `features/notes/actions/notes-actions.md` — living usage reference
- `features/notes/service/notesApi.ts` — `NotesAPI` (programmatic CRUD)
- `features/notes/context/NotesContext.tsx` — shared state + realtime
- `components/overlays/OverlayController.tsx` — overlay host for modal/sheet
- `lib/redux/slices/overlaySlice.ts` — `openSaveToNotes` action creator

## Provider Requirements

| Component | Needs `NotesProvider`? |
|-----------|----------------------|
| `SaveToScratchButton` | No (uses `NotesAPI` directly) |
| `SaveSelectionButton` | No (uses `NotesAPI` directly) |
| `QuickCaptureButton` | No (dispatches Redux action) |
| `QuickNoteSaveModal` | Yes (OverlayController provides it) |
| `QuickNotesSheet` | Yes |
| `CategoryNotesModal` | Yes |
| `WindowNotesBody` | No (bundles its own `NotesProvider`) |
| `NotesTreeView` | Yes |
| `NotesWindow` | No (bundles its own `NotesProvider` + `WindowPanel`) |
| `SidebarNotesToggle` | No (renders `NotesWindow` which bundles everything) |
