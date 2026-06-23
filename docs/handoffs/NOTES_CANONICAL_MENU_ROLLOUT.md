# Task — Finish the canonical context-menu rollout for ALL notes surfaces

> **Ready to assign to an agent.** The live `/notes` editor (`NoteContentEditor`)
> is already migrated from the bespoke `NoteContextMenu` to the canonical
> `UnifiedAgentContextMenu`. This task finishes the job: the remaining bespoke
> consumer, the **left-sidebar menus** (notes/folders), mobile, then deletes the
> dead bespoke code. **Verify current line numbers as you go — code drifts.**

## Non-negotiable acceptance criteria

1. **One canonical menu everywhere** — every notes surface mounts
   `UnifiedAgentContextMenu` (`features/context-menu-v2/`). No bespoke fork, no
   parallel data hook survives.
2. **Lose ZERO features in the transition.** Every capability the bespoke menu
   offered must still exist — either from the canonical CORE menu or wired via
   `extraSections` to a REAL handler. The full inventory is in §"Feature
   inventory" below; tick every row.
3. **Pass the handlers, never stub them.** `extraSections` `onSelect`s bind to
   the surface's real callbacks (toast stubs are forbidden — a fake "Delete" is
   worse than nothing).
4. `tsc` clean + eslint clean on touched files; FEATURE.md updated; the bespoke
   files DELETED at the end (no shim, no dead name).

## The reference (copy its shape) — the already-done `NoteContentEditor` migration

- Wrapper: `features/notes/components/NoteContentEditor.tsx` — `UnifiedAgentContextMenu`
  loaded via `dynamic(() => import(...), { ssr: false, loading: () => <flex div> })`
  (the `loading` fallback prevents the editor body collapsing during chunk load).
- Real-handler `extraSections`: `features/notes/agent-context/notesEditorExtraSections.ts`
  — `createNotesEditorExtraSections(config)` takes the live handlers + state.
- Shared props: `NOTES_EDITOR_CONTEXT_MENU_PROPS` in
  `features/notes/agent-context/buildNotesEditorContextData.ts`.
- Live scope: `features/notes/hooks/useNotesSurfaceScope.ts` + a plain
  `getApplicationScope`.

### ⚠️ Bug the adversarial review caught on the first migration — DO NOT REPEAT IT

Mounting the bespoke menu used to mount **`useNoteUndoRedo`** (`features/notes/hooks/useNoteUndoRedo.ts`),
which installs a **capture-phase Cmd+Z / Ctrl+Z / Ctrl+Y interceptor** that keeps
note undo synced with Redux. The canonical menu does NOT mount it. So every
surface that owns a notes editor MUST `useNoteUndoRedo({ noteId })` itself and
pass `onUndo/onRedo/canUndo/canRedo/undoHint/redoHint` to the menu — otherwise
Cmd+Z silently falls through to native textarea undo and desyncs. Also pass
`contextData={buildSurfaceScope()}` (the core's Compare-without-selection and
admin Inspect-Context read the `contextData` prop, not `getApplicationScope`),
and wire super-admin "Permanently Delete" via `confirm()` + `permanentlyDeleteNote`.

## Work items

### 1. Migrate `NoteEditorWithChrome.tsx` (the last bespoke EDITOR consumer)
`features/notes/components/NoteEditorWithChrome.tsx` lazy-imports the bespoke
`NoteContextMenu`. Replace with the canonical menu exactly like `NoteContentEditor`:
canonical menu + `createNotesEditorExtraSections({...real handlers})` + mount
`useNoteUndoRedo` + `isEditable` + `contextData`. Confirm the parent supplies the
real handlers (save/duplicate/export/move/delete/…); if any are missing, wire
them (don't stub). (It's a lower-traffic wrapper, not on the live `/notes` route
today — verify its consumers before assuming it's dead.)

### 2. Canonical menus for the LEFT SIDEBAR (the new requirement)
`features/notes/components/NoteSidebar.tsx` today renders **two ad-hoc, hand-rolled
HTML context menus** (NOT canonical) — the exact bespoke-fork pattern we're
killing:
- **Folder right-click** (~`:1079-1127`): New Note in [folder], Rename Folder,
  Delete All Notes (rename/delete hidden for default folders).
- **Note-row right-click** (~`:1129-1229`): Open, Duplicate, Export as Markdown,
  Move to Folder (submenu), Delete Note.

Replace both with `UnifiedAgentContextMenu` in **presentational mode**
(`isEditable={false}` — supported; see `MarkdownContextMenuProvider` and the
`isEditable` handling in `UnifiedAgentContextMenu.tsx`). Each row declares a
per-row scope via `contextData` (`{ noteId, noteLabel, folder }` for a note;
`{ folderName, isDefault }` for a folder) and its actions via `extraSections`
bound to the sidebar's real handlers. `isEditable={false}` correctly disables
Cut/Paste while keeping Copy + agent actions + the extra items. This is also the
natural first consumer of the surface parent/child model (see
[SURFACE_INHERITANCE_PROPOSAL.md](./SURFACE_INHERITANCE_PROPOSAL.md)): a
`matrx-user/notes` parent with `editor` + `sidebar-item` children — but the
sidebar menu can ship without inheritance by reusing `matrx-user/notes` directly.

### 3. Mobile (`MobileNoteEditor` / `MobileNotesView`)
Confirm whether the mobile editor uses the bespoke menu; if so, migrate it. The
canonical menu already provides the mobile `FloatingSelectionIcon` (touch has no
right-click), so verify long-press/selection → icon → menu works on mobile.

### 4. Delete the bespoke code (ONLY after 1-3 land + grep proves zero importers)
Delete: `features/notes/components/NoteContextMenu.tsx`,
`NoteContextMenuContent.tsx`, `noteContextMenuBridge.tsx`,
`components/useNoteContextMenuGroups.ts`. Then check whether
`lib/redux/slices/contextMenuCacheSlice.ts` (the legacy cache the bespoke menu
fed) is now orphaned (`rg contextMenuCacheSlice`) and remove it + its store
registration if so. Verify: `rg "NoteContextMenu|useNoteContextMenuGroups|noteContextMenuBridge" features` returns 0.

## Feature inventory — every bespoke item must survive (tick each)

**Provided by the canonical CORE menu (verify they render, no work beyond mounting):**
Copy · Cut · Paste · Select All · **Undo · Redo** (require the `useNoteUndoRedo`
wiring above) · Find & Replace · AI Actions / Content Blocks / Org Tools / User
Tools submenus · Quick Actions (Notes/Tasks/Chat/Data/Files/Voice) · Admin Tools
(Debug Mode, Inspect Context, Admin Indicator) · Floating selection icon (mobile).

**Must be wired via `extraSections` (surface-specific):** Save (gated on dirty) ·
Duplicate · Export as Markdown · Share link · Copy to clipboard · Move to Folder
(folder submenu + "Choose folder…") · Close Tab / Close Other Tabs / Close All
Tabs · Delete Note · Permanently Delete (super-admin, confirmed) · (whitespace
"Cleanup Selection" — minor; the prominent `NoteCleanupButton` already covers
cleanup, so this is optional — confirm with Arman before dropping).

## Verify before calling it done
- [ ] Every surface: right-click shows `matrx-user/notes · C1V1` footer (canonical).
- [ ] Cmd+Z / Ctrl+Z undo works and stays Redux-synced on every editor surface.
- [ ] Every bespoke item above is present + wired to a real handler (no stubs).
- [ ] Sidebar note + folder menus are canonical, per-row scoped, actions work.
- [ ] Mobile: floating icon + menu work; no right-click assumed.
- [ ] Bespoke files deleted; `contextMenuCacheSlice` orphan handled; grep clean.
- [ ] `tsc` + eslint clean on touched files; `features/notes/FEATURE.md` change log updated.
