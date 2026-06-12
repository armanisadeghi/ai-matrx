# FEATURE.md — `notes`

**Status:** `active` — production, actively maintained
**Tier:** `1`
**Last updated:** `2026-05-15`

> User-facing README at [`README.md`](./README.md). This doc is the agent-facing architecture view.

---

## Purpose

Comprehensive notes system: rich-text editing (WYSIWYG + markdown split view), folder organization, auto-labeling, real-time sync via Supabase Realtime, permissions-backed sharing, and a programmatic API that lets any feature in the app save content to notes. Notes is one of the most-integrated surfaces — it's both a standalone feature and a substrate other features target.

---

## Entry points

**Routes**
- `app/(authenticated)/notes/` — main surface (list, folder tree, editor)

**Feature code** (`features/notes/`)
- `actions/` — thunk-style actions for CRUD
- `components/` — editor, folder tree, list, share UI
- `constants/` — shared constants
- `context/` — React contexts (editor, folder nav)
- `hooks/` — note CRUD, labels, folders, realtime subscription
- `redux/` — slice + selectors
- `route/` — route-level helpers
- `service/` — Supabase DB calls
- `index.ts` — public barrel

**Realtime** — uses Supabase Postgres Changes (RLS-authorized) for multi-client sync of note content.

---

## Data model

DB tables (verify in Supabase; names representative):
- `notes` — note rows: `id`, `user_id`, `organization_id`, `project_id`, `folder_id`, `title`, `content` (rich/markdown payload), `labels[]`, timestamps
- `note_folders` — tree structure: parent references
- `note_labels` — auto-labeling metadata

Key types live in `features/notes/` — import from the feature barrel, not internal paths.

---

## Key flows

### Flow 1 — Create / edit a note

1. User opens editor → `notes` slice hydrates the target row via `service/`
2. Edits dispatch granular actions (title, content, labels) — small updates, never full-object replacement
3. Debounced autosave → Supabase update
4. Realtime broadcasts the change to other subscribed clients

### Flow 2 — Folder organization

1. Drag-drop or menu action → thunk updates `folder_id` on the note row
2. Folder tree slice re-derives view

### Flow 3 — Auto-labeling

1. On save (or a dedicated trigger), an agent or server function extracts labels from content
2. Labels stored on the note row / `note_labels` table
3. UI surfaces filter + color-code by label

### Flow 4 — Save-from-anywhere programmatic API

1. External feature (e.g. agents) calls the notes programmatic API with content + optional folder / labels
2. Note row created; user sees it appear in the Notes surface with realtime
3. This is a major cross-feature integration point — agents often write notes as side effects

### Flow 5 — Sharing

1. Note owner opens share modal (from `features/sharing/`)
2. Grants user / org permission → row in permissions table
3. RLS enforces visibility; subscriber's notes list updates via realtime

---

## Invariants & gotchas

- **Small, granular updates only.** Never replace the entire note object in Redux — follow the project's small-update rule.
- **Realtime is RLS-authorized.** Use Postgres Changes here (not Broadcast) so non-owners only see notes they have access to.
- **The save-from-anywhere API is a public contract.** Agents and other features depend on it; don't break the signature silently.
- **Rich text editor:** Notes currently uses its own editor — the legacy `features/rich-text-editor/` is deprecated (per CLAUDE.md) and must not be re-adopted. Verify the current editor before modifying content rendering.
- **Scope columns** (`user_id`, `organization_id`, `project_id`) follow the project's multi-scope convention — see [`features/scopes/FEATURE.md`](../scopes/FEATURE.md).
- **Folder tree operations are transactional.** Moving a folder with children must update all descendants' paths — don't optimize away the reparenting walk.

---

## Related features

- **Depends on:** `features/sharing/` (permissions), Supabase Realtime, the app's scope system
- **Depended on by:** agents (save-to-notes), any feature offering a "save to notes" action
- **Cross-links:** [`features/sharing/FEATURE.md`](../sharing/FEATURE.md), [`features/scopes/FEATURE.md`](../scopes/FEATURE.md), [`features/agents/FEATURE.md`](../agents/FEATURE.md)

---

## Change log

- `2026-06-11` — Notes tab strip + folder dropdown fixes: `NoteTabBar` splits the strip into a non-scrolling **pinned cluster** (new-note `+` button + the active tab) and a **scrolling region** for the remaining tabs, so the current tab's label is never scrolled out of view and other tabs start where it ends instead of sliding behind it (the earlier `sticky` approach let siblings overlap). `NoteMetadataBar`'s folder dropdown is now portaled to `document.body` with fixed positioning (anchored to the trigger rect, `z-[10000]`) — it was being clipped by the metadata row's `overflow-hidden` + upward (`bottom-full`) open, which read as "contents don't render." Closes on outside-click/Escape; scroll/resize *reposition* it rather than closing (the trigger lives in a fixed bottom bar).
- `2026-06-10` — Added `NotePickerPopover` (lazy `NotesAPI.listItems` on open, collapsible folder tree + search, Drawer on mobile) and `fetchNoteListItems` / `NotesAPI.listItems` for lightweight picker queries without note content. Consumed by transcription cleanup context blocks.
- `2026-06-03` — Added a single **Note Info** window panel that consolidates per-note metadata in one place: content stats (words, characters, characters-no-spaces, lines, paragraphs, reading time), timeline (created/updated/version), folder (editable), the full hierarchy context picker (reuses `NoteContextPicker`), tags, and copyable identifiers. New shared util `utils/noteStats.ts` (`computeNoteStats` / `formatStatNumber`) is the single source of truth for content metrics — consumed by `NoteMetadataBar`, the editor chrome status bar, and the info panel, memoized on `content` so it never recalculates on unrelated re-renders. `NoteMetadataBar` now shows clear `N words · N chars` (was a bare `Nw`). The note **tab** (`NoteTabItem`) drops its separate context (Network) and folder icons in favor of one **Info** icon that opens the window (folder + context now live inside it). Window wiring: `features/window-panels/windows/notes/NoteInfoWindow.tsx` + overlay `noteInfoWindow` (registry metadata, overlay-ids, catalogue, opener, `OverlayController` block). Ephemeral, singleton, `mobilePresentation: "drawer"`.
- `2026-06-02` — Phase F (kg-suggestions): added `<KgSuggestionsChip filter={{ sourceKind: "note", sourceId }} />` to `NoteContextPicker` beneath the scope tagger. Surfaces pending KG → scope-item fill suggestions for the note; hidden at count 0. No notes-slice changes. See `features/kg-suggestions/FEATURE.md`.
- `2026-05-15` — Added a Refresh button to the desktop notes header that mirrors the route-start fetches: `fetchNotesList()`, plus `fetchScopeTypes` / `fetchScopes` when an org is active, plus a forced refetch of every currently-open tab. Introduces `refreshNoteContent` thunk in `redux/thunks.ts` — a force-fetch sibling of `fetchNoteContent` that bypasses the `_fetchStatus === "full"` short-circuit but skips dirty notes to protect unsaved local edits.
- `2026-05-15` — Notes now emits the `matrx-user/notes` surface scope when launching an agent shortcut from the context menu. Adds `hooks/useNotesSurfaceScope.ts` (the scope builder) and `utils/markdown-headings.ts` (heading-aware section slicing). The surface manifest at `features/surfaces/manifests/notes-editor.manifest.ts` declares 19 surface-specific values covering active-note metadata, selection/scope mirror, workspace context, and editor pane state.
- `2026-04-25` — Removed `@/features/notes` barrel imports; consumers use `components/NotesLayout`, `service/notesApi`, `actions/CategoryNotesModal`, `types` (no new barrel file).
- `2026-04-22` — claude: initial FEATURE.md extracted from README.md.

---

> **Keep-docs-live:** changes to the DB schema, realtime pattern, or the save-from-anywhere programmatic API must update this doc. Keep `README.md` focused on user-facing guidance; architecture notes go here.
