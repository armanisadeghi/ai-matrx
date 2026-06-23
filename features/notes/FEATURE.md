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

**Floating window** (`features/window-panels/windows/notes/NotesWindow.tsx`) — thin composition root: owns the per-instance lifecycle (`registerInstance` + notes-list/scopes fetch) and maps independent, prop-drill-free units (each takes only `instanceId`, reads Redux) onto `WindowPanel` slots — `sidebar`=`NoteSidebar`, `actionsRight`=`NoteViewControls` (view-mode menu + history toggle), `footer`=`NoteMetadataBar`, body=`NotesWindowView` (tab bar + presence + editor + split + window-relative version-history pane). Chrome lives in slots; no reinvented header/footer, no `sidebarExpandsWindow` rect mutation. Version-history open state is per-instance (`historyOpen` on `NotesInstance`; `setInstanceHistoryOpen` / `selectInstanceHistoryOpen`).

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

- `2026-06-23` — Notes editor wired to the live agent surface. `NoteEditorCore`/`NoteContentEditor` (live `/notes` route) and the legacy `NoteEditor` now render `ProTextarea` for the note body (ref forwarded straight to the textarea — no manual mutation) and `ProInput` for the title, each carrying `surfaceName: "matrx-user/notes"` + a plain `getApplicationScope`; the four `UnifiedAgentContextMenu` mounts pass `getApplicationScope` / `contextData` / `extraSections`, and the markdown-preview keeps its presentational menu. The body's "…" menu now lists the surface's bound agents and runs them with full scope.
- `2026-06-22` — Target context-menu wiring extracted: `buildNotesEditorContextData`, `NOTES_EDITOR_CONTEXT_MENU_PROPS`, `createNotesEditorExtraSections`. `useNotesSurfaceScope` delegates to the shared builder. Demos use this as the canonical notes shape (surfaceName + full scope + extraSections) ahead of migrating `NoteEditor` off legacy `NoteContextMenu`.
- `2026-06-23` — **`NotesWindow` can deep-link to a note.** `useOpenNotesWindow` / `OpenNotesWindowOptions`, `NotesWindowProps`, and the `OverlayController` notesWindow block gained `initialNoteId`. When set, the window opens that note as the active tab on mount (`addInstanceTab` + `setInstanceActiveTab` + `fetchNoteContent`) instead of just showing the list. Reusable opener primitive — first consumer is the `note` tool-call renderer's "Open in Notes" action (`features/tool-call-visualization/renderers/note/`).
- `2026-06-22` — **Notes floating window rebuilt as a slot-delegating composition root** (Windows Panel System Overhaul, Phase 1). `NotesWindow.tsx` now owns only the instance lifecycle + list/scopes fetch and maps independent units onto `WindowPanel` slots (`sidebar`=`NoteSidebar`, `actionsRight`=`NoteViewControls`, `footer`=`NoteMetadataBar`, body=`NotesWindowView`); passes explicit `width`/`height`/`position` + canonical `bodyClassName`; **dropped `sidebarExpandsWindow`** (it mutated the window rect on sidebar toggle). New prop-drill-free units `NoteViewControls.tsx` (view-mode menu + history toggle) and `NotePresenceBanner.tsx`. `NotesWindowView.tsx` is now a dumb body with a **window-relative** version-history pane (`ResizablePanel` desktop / `Drawer` mobile), replacing `NoteVersionHistory`'s `MatrxDynamicPanelHost` (sized to `window.innerWidth`, overflowed when nested). New per-instance slice state `historyOpen` + `setInstanceHistoryOpen` + `selectInstanceHistoryOpen` (was local React state). `OverlayController` notesWindow `windowInstanceId` falls back to `inst.instanceId` so multiple windows get distinct instances.
- `2026-06-22` — `NotePickerPopover` search now shows **Folders** and **Notes** sections together (folder name or contained-note match + flat note picks), instead of hiding folder matches during search. (`NoteVersionHistoryPanel`) with `NoteDiffViewer`, per-version compare shortcuts, and a link to `/notes/[id]/diff` for the full-page view. Replaces timeline-only `DiffHistory`. MatrxDynamic right-panel header gets `pr-10` so controls clear the shell avatar.
- `2026-06-19` — `NoteContentAdapter` (version diff) now renders **word-level** intra-line highlighting. It was line-level only (a one-word edit tinted the whole line, and a removed line never aligned with its replacement). The renderer now runs the canonical `computeTextDiff` engine (`components/diff/text/engine`) to align removed+added into MODIFIED pairs and emit word segments, while keeping the existing collapse-unchanged, ignore-whitespace toggle, and stats/summary UX intact. `analyzeDiff` still backs the stats line + `toSummaryText`.
- `2026-06-12` — Find/replace **scroll-to-active-match** reliability fixes. The active match now scrolls into view in every editor mode and on every entry path, not just when the match index changes mid-search. (1) `NoteFindMatchOverlayRedux` / `NotePreviewFindHighlightRedux` (`NoteContentEditor.tsx`) seed `prevActiveRef` with a `-1` sentinel so a fresh mount — reopening the bar, or switching editor mode with find open — counts as a change and scrolls the already-active match into view instead of leaving the viewport stranded. (2) Both find surfaces are now `key={editorMode}` so they remount cleanly on a mode switch and re-bind to the new DOM container (a stable ref can't tell the effect its `.current` element swapped). (3) `usePreviewFindHighlight` waits for the rendered markdown to actually appear (MutationObserver + poll backstop) before highlighting/scrolling, distinguishing "rendered doc with no matches" (settle) from "content not mounted yet" (keep watching) via `container.textContent`. (4) New `refreshNonce` option + a component-owned bounded readiness ticker (`~150ms`, ~18s cap, stops the instant the container has rendered text) re-runs the highlighter on a cold first switch into preview — where React renders a Suspense fallback then swaps in a new scroll-container element once the lazy markdown chunk resolves, leaving the original ref pointing at an empty node.
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
