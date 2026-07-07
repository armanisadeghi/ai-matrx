---
status: active
updated: 2026-07-07
repos: [matrx-frontend]
---

# Notes — canonical context menu, sidebar remainder

The notes editor migration is DONE: `NoteContentEditor.tsx` uses `EditableContextMenu` from
`features/context-menu-v3` (migration complete per `features/context-menu-v3/FEATURE.md:152`); the
bespoke files (`NoteContextMenu*`, `noteContextMenuBridge`, `useNoteContextMenuGroups`,
`NoteEditorWithChrome`) were all deleted 2026-06-24. One surface remains.

## Resources

- Skill: `context-menu-v3` — invoke before touching the menus.
- `features/context-menu-v3/FEATURE.md` — canonical menu doc.
- `features/notes/components/NoteSidebar.tsx` — the remaining bespoke consumer (live `/notes` route).
- `lib/redux/slices/contextMenuCacheSlice.ts` is **NOT orphaned** — fed by `DeferredShellData.tsx`, registered at `rootReducer.ts:263`. Do not remove it.

## Remaining work

1. **Migrate the sidebar's hand-rolled menus to v3.** `NoteSidebar.tsx` (~lines 1177-1256 — verify, code drifts) renders two ad-hoc HTML context menus: folder right-click (New Note / Rename / Delete All; rename+delete hidden for defaults) and note-row right-click (Open / Duplicate / Export as Markdown / Move to Folder submenu / Delete). Replace both with `NonEditableContextMenu`, per-row scoped, actions bound to the sidebar's real handlers — no stubs.
2. **Mobile note editor** — status unknown; take a fresh look at what menu (if any) it mounts and whether long-press/selection works.

## Done

- Editor migrated to `EditableContextMenu` (v3); all bespoke menu files deleted 2026-06-24 — see `features/context-menu-v3/FEATURE.md:152`.
