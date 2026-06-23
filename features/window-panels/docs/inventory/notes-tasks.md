# Window Panel Inventory — Notes & Tasks

> Chunk row file for [`../../PANEL_INVENTORY.md`](../../PANEL_INVENTORY.md). Panels: `notesWindow`, `noteInfoWindow`, `quickNoteSaveWindow`, `quickTasksWindow`, `taskEditorWindow`, `taskQuickCreateWindow`.
> Legend: ✓ present · ◑ partial · ✗ missing · — n/a. Action `Priority` = P0/P1/P2; `Effort` = S/M/L.
> Filled 2026-06-23.

Component / opener / registry / tile map:

| Panel | Component | Opener | Registry slug | Tile | Catalogue |
|---|---|---|---|---|---|
| notesWindow | `windows/notes/NotesWindow.tsx` | `openers/notesWindow.tsx` (`useOpenNotesWindow`) | `notes-window` | `tile.notes-pinned` (notes) | multi/window |
| noteInfoWindow | `windows/notes/NoteInfoWindow.tsx` | `openers/noteInfoWindow.tsx` (`useOpenNoteInfoWindow`) | `note-info-window` | — | singleton/window |
| quickNoteSaveWindow | `windows/notes/QuickNoteSaveWindow.tsx` | `openers/quickNoteSaveWindow.tsx` (`useOpenQuickNoteSaveWindow`) | `quick-note-save-window` | — | singleton/window |
| quickTasksWindow | `windows/context-scopes/QuickTasksWindow.tsx` (note: NOT under `windows/tasks/`) | `openers/quickTasksWindow.tsx` (`useOpenQuickTasksWindow`) | `quick-tasks-window` | `tile.quick-tasks` (general) | singleton/window |
| taskEditorWindow | `windows/tasks/TaskEditorWindow.tsx` | `openers/taskEditorWindow.tsx` (`useOpenTaskEditorWindow`) | `task-editor-window` | — | (no catalogue row found; opener+registry present) |
| taskQuickCreateWindow | `windows/tasks/TaskQuickCreateWindow.tsx` | `openers/taskQuickCreateWindow.tsx` (`useOpenTaskQuickCreateWindow`) | `task-quick-create-window` | — | singleton/window |

---

## Table A — Functionality, Coverage & Composition

| Panel | Domain | Purpose | Maturity | Create (M/I/AI) | Seed | Edit | Manage | Relationships | Quick-execute | Fidelity gap | Domain family (siblings) | Consolidation verdict | Action (P·E) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| notesWindow | Notes | Capture/browse/edit notes anywhere | **Gold** | ✓ / ✗ / ✗ | ◑ (deep-link `initialNoteId`; create via sidebar) | ✓ | ✓ tree + tabs + split + version history + metadata bar | ◑ folder/context/tags via `NoteMetadataBar` (`ctx_scope_assignments`) | — | tab bar is per-feature, not the WindowPanel tab API (S4) | noteInfoWindow, quickNoteSaveWindow | **keep-separate-justified** — distinct jobs (browse-workspace vs metadata-inspector vs one-shot capture); editor body shared via `NoteEditorCore`, not the chrome | tab API consume (P2·L) |
| noteInfoWindow | Notes | Single-note metadata + hierarchy-context inspector | Solid | ✗ | ✗ | ◑ (edits context/tags, not body) | ◑ stats/timestamps/version/folder/tags/ids | ✓ full hierarchy context picker + tags | — | ephemeral, no own footer/sidebar; thin shell over canonical `NoteInfoPanel` | notesWindow (opened from its tab info icon) | **already-one** — canonical `NoteInfoPanel` reused; window is just the floating chrome | — |
| quickNoteSaveWindow | Notes | One-shot "save this content as a note" (Create-from-seed) | Solid | ✓ (manual) / ✓ **seed `initialContent`** / ✗ | ✓ **Create-from-seed exemplar** (`initialContent`+`defaultFolder`+`initialEditorMode`) | ✓ (new-note compose) | ✗ | ◑ folder pick | ✓ saves note, post-save action routes onward | window form has **0 reachable open paths** (see Table C) — capture flows use Overlay/Popover/Dialog siblings instead | QuickNoteSaveOverlay / Popover / Dialog (all wrap `QuickNoteSaveCore`) | **already-one** at the core (`QuickNoteSaveCore`); window chrome is a redundant 4th wrapper → candidate to retire | retire OR wire opener (P1·S) |
| quickTasksWindow | Tasks | Browse/manage tasks (sidebar list + detail) | Solid | ◑ inline new-task title field | ✗ | ◑ via embedded `TaskDetailsPanel` | ✓ org/project filter, search, list, complete-toggle, detail | ◑ scope via `HierarchyCascade` | ◑ create/toggle inline | "Quick Tasks" label vs registry "Tasks"; **Manage**-flavored despite "Quick" name; no agents/help controls | taskEditorWindow, taskQuickCreateWindow | **keep-separate-justified** — this is the Manage view; editor + create are distinct chromes. NOT the Quick-Create twin of quickNoteSave (mis-named) | rename to "Tasks" (P2·S) |
| taskEditorWindow | Tasks | Edit one task/subtask in a floating panel | **Solid** | ✗ | ✗ | ✓ full | ◑ (subtasks open as sibling windows) | ◑ scopes/project via embedded `TaskEditor` | — | one stable window per task id; rich `titleNode` w/ subtask icon; no footer/sidebar (`TaskEditor` is self-contained) | quickTasksWindow, taskQuickCreateWindow | **already-one** — wraps canonical `TaskEditor` (shared with route, war-room, agent bodies) | — |
| taskQuickCreateWindow | Tasks | One-shot create task (manual + AI), optional source-link (Create-from-seed) | Solid | ✓ (manual) / ✓ **seed `source`/`prePopulate`** / ◑ AI (gated OFF — `TASK_CREATE_AGENT_ID=""`) | ✓ **Create-from-seed exemplar** (`source`+`prePopulate`) | ◑ (compose only) | ✗ | ✓ scopes/project/priority/due + source-link | ✓ creates task; post-save opens `quickTasksWindow` | AI tab dark until agent id set; mirrors quickNoteSave's shape | quickTasksWindow, taskEditorWindow | **already-one** at the core (`TaskCreatePanel`→`TaskQuickCreateCore`, shared with `CreateTaskFromSourceDialog`) | wire AI agent id (P2·S) |

**Create-from-seed exemplars (chunk question 2):** `quickNoteSaveWindow` (`initialContent`/`defaultFolder`/`initialEditorMode` → `QuickNoteSaveCore`) and `taskQuickCreateWindow` (`source`/`prePopulate` → `TaskCreatePanel`/`TaskQuickCreateCore`) are the canonical Quick-Create pattern: a thin window chrome over a reusable Core that accepts a seed payload, fires `onSaved(entity, action)`, and routes onward (close / open manage view). Both Cores are reused across multiple chromes — the **window is just one wrapper**.

---

## Table B — Utility, Surface & Construction

| Panel | Header actions | Footer (+variant) | Sidebar | Secondary panel | Tabs | Persistence (collect/urlSync/heavy/autosave) | Pop-out ready | Tray (snapshot/preview) | Ref/callback | Surface registered | Std header controls (agents/help) | Help-assistant context wiring | Canonical core | End-to-end state | Underused utilities | Action (P·E) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| notesWindow | ✓ `actionsRight`=`NoteViewControls` (view-mode + history) | ✓ `NoteMetadataBar` (bar) — only panel with a footer | ✓ `NoteSidebar` (note tree, resizable) | ✓ `NoteHistoryPane` (version history) | per-feature (tab bar in `NotesWindowView`) | ✗ collect / ✓ urlSync (`notes-<key>`) / ✗ heavy / ✓ autosave (`autoSaveMiddleware`) | ✓ (default WindowPanel) | ✓ custom `notesTrayPreview` | opener ✓ · callback ✗ | ✗ | ✗ none | ✗ | **built-from-shared** — `NoteEditorCore` + leaf units (`NoteSidebar`/`NoteViewControls`/`NoteMetadataBar`/`NoteHistoryPane`); no competing duplicate | ✓ DB→Redux (`slice`+`thunks`+`selectors`+realtime+autosave middleware)→core | heavySnapshot, surface+std-ctrls (agents/help), help-ctx | add surface+std-ctrls (P1·M) |
| noteInfoWindow | ✗ (none beyond traffic lights) | ✗ | ✗ | ✗ | — | ✓ `onCollectData`(noteId,title) / ✗ urlSync / ✗ / — | ✓ | ◑ default | opener ✓ (singleton) · callback ✗ | ✗ | ✗ | ✗ | **already-one** — canonical `NoteInfoPanel` (embeddable elsewhere) | ✓ reads notes selectors / writes `ctx_scope_assignments` | surface+std-ctrls | add surface+std-ctrls (P2·S) |
| quickNoteSaveWindow | ✗ | ✗ | ✗ | ✗ | — | ✗ collect / ✗ urlSync / ✗ / ◑ (Core save) | ✓ | ◑ default | opener ✓ (**0 consumers**) · callback ✗ | ✗ | ✗ | ✗ | **built-from-shared** — `QuickNoteSaveCore` (also in Overlay/Popover/Dialog); the **window is a redundant duplicate chrome** | ✓ Core → notes thunks/DB | the entire panel (unreachable); surface+std-ctrls | retire OR wire (P1·S) |
| quickTasksWindow | ✗ (sidebar toggle only) | ✗ | ✓ `QuickTasksSidebar` (org/project/list, resizable) | ✗ (detail rendered inline in `QuickTasksMain`, not 2nd panel) | per-feature | ✗ collect / ✓ urlSync (`quick_tasks`) / ✗ / — | ✓ | ✓ custom `quickTasksTrayPreview` | opener ✓ · callback ✗ | ✗ | ✗ none | ✗ | **built-from-shared** — `QuickTasksWorkspace` (`Provider`/`Sidebar`/`Main`) + `CompactTaskItem`/`TaskDetailsPanel`/`HierarchyCascade` | ✓ DB→Redux (`quickTasksWindowSlice`+`taskUiSlice`+`thunks`+`selectors`)→core | secondaryPanel for detail, surface+std-ctrls, agents/help | add surface+std-ctrls (P1·M) |
| taskEditorWindow | ✓ `titleNode` (subtask icon + truncate) | ✗ | ✗ | ✗ | — (`TaskEditor` self-tabs) | ✗ collect / ✗ urlSync / ✗ / ◑ (`TaskEditor` autosaves) — ephemeral | ✓ | ◑ default | opener ✓ (`taskEditorInstanceId`, 1/window per task) · callback ✗ | ✗ | ✗ | ✗ | **already-one** — wraps canonical `TaskEditor` (route + war-room + agent bodies share it) | ✓ `useEnsureTaskLoaded` → tasks thunks/selectors/DB | surface+std-ctrls, help-ctx | add surface+std-ctrls (P1·M) |
| taskQuickCreateWindow | ✗ | ✗ | ✗ | ✗ | per-feature (manual/AI via `CreateWithAiTabs`) | ✗ collect / ✗ urlSync / ✗ / — ephemeral | ✓ | ◑ default | opener ✓ · callback ✗ | ✗ | ✗ | ✗ | **built-from-shared** — `TaskCreatePanel`→`TaskQuickCreateCore` (also in `CreateTaskFromSourceDialog`) | ✓ Core → tasks thunks/DB; refetch on AI complete | AI mode (agent id unset), surface+std-ctrls | wire AI id + surface (P2·M) |

**Surface registration (chunk question 4):** **none of the 6 panels is a registered surface.** No agents/help std header controls and no help-assistant KV/page-awareness context wiring on any of them (consistent with the system-wide S1–S3 gaps). `features/surfaces/data/surface-candidates.ts` lists only an unrelated, inactive `matrx-user/save-to-notes` widget candidate — not these windows.

**Canonical core + duplicates (chunk question 4):** every panel here is built from a shared core, which is the chunk's strength:
- Notes editor body → `NoteEditorCore` (shared: notesWindow, quickNoteSave, working-document).
- Note metadata → `NoteInfoPanel` (noteInfoWindow + embeddable).
- Quick note save → `QuickNoteSaveCore` (4 chromes: **Window**, Overlay, Popover, Dialog).
- Task edit → `TaskEditor` (route `app/(core)/tasks/[id]`, window, war-room, agent `TaskBody`).
- Task create → `TaskCreatePanel`/`TaskQuickCreateCore` (window + `CreateTaskFromSourceDialog`).
- Tasks manage → `QuickTasksWorkspace`.
No non-canonical/forked core in the chunk. The one "competing duplicate" is structural: `quickNoteSaveWindow` is a 4th, **unreachable** chrome over `QuickNoteSaveCore` (see Table C / Action).

---

## Table C — Availability & Placement

| Panel | Opener? | Ref wired (popout/callback) | Portable vs route-locked | Tools Grid (tile/category) | Placement issue | Bespoke call sites (count + surfaces) | Usage gap | Action (P·E) |
|---|---|---|---|---|---|---|---|---|
| notesWindow | ✓ `useOpenNotesWindow` | popout default ✓ · callback ✗ | portable | ✓ `tile.notes-pinned` (notes, singleton-default) | ok | **6**: tool-viz `NoteToolInline`/`NoteToolOverlay`, `useOpenNoteInWindow`, `QuickNoteSaveCore`, kg-suggestions `KgSuggestionRowItem`, war-room `useTileActions` | ok — gold-standard distribution | — |
| noteInfoWindow | ✓ `useOpenNoteInfoWindow` (singleton, retargets) | popout default ✓ · callback ✗ | portable | ✗ (correctly — context-only) | ok | **2**: `item-presentation/useOpenItemPresentation`, notes `NoteTabItem` | ok (intentionally note-tab-scoped) | — |
| quickNoteSaveWindow | ◑ opener exists, **0 consumers** | popout default ✓ · callback ✗ | portable | ✗ | **ORPHAN window form** — nothing dispatches the `quickNoteSaveWindow` overlay except its own file; all save-to-notes capture uses the Overlay/Popover/Dialog siblings | **0** | **window unreachable** — built, registered, opener present, but no open path | retire window OR wire an opener/tile (P1·S) |
| quickTasksWindow | ◑ `useOpenQuickTasksWindow` (0 hook consumers) | popout default ✓ · callback ✗ | portable | ✓ `tile.quick-tasks` (general) | label drift ("Quick Tasks"/"Tasks") + lives under `windows/context-scopes/` not `windows/tasks/` | **2** (direct `openOverlay`, not the hook): `TaskQuickCreateCore` post-save, `url-sync/initUrlHydration` | Tools-Grid-only for users — under-surfaced where tasks are managed | add bespoke "open tasks" entry points (P2·M) |
| taskEditorWindow | ✓ `useOpenTaskEditorWindow` | popout default ✓ · callback ✗ | portable | ✗ (per-task, not a generic tile) | ok | **7**: `TaskEditor` (subtasks, self-recursive), projects `ProjectTaskList`, war-room (`TileProjectTaskList`/`SubtaskRail`/`TileTaskTab`/`SubtaskWindow`/`TileEmbeddedTaskView`) | ok — well distributed (per-task gold pattern, like `agentRunWindow`) | — |
| taskQuickCreateWindow | ◑ `useOpenTaskQuickCreateWindow` (0 hook consumers) | popout default ✓ · callback ✗ | portable | ✗ | opened only via direct `openOverlay` | **2** (direct `openOverlay`): `tasks/widgets/CreateTaskFromSourceDialog`, `shell/navigation/navActions` | low surfacing — no "New Task" tile in Tools Grid | add Tools-Grid "New Task" tile (P2·S) |

---

## Top findings (this chunk)

1. **Notes is confirmed Gold (chunk question 1).** Only panel using footer + sidebar + secondary panel together, custom tray preview, full DB→Redux→selectors→core E2E (autosave + realtime middleware), 6 bespoke call sites + Tools-Grid + catalogue. B/C worked-example rows in the master doc are accurate; the open items remain **surface registration + std header controls (agents/help) + help-assistant context** — none present (P1·M).

2. **`quickNoteSaveWindow` is an orphan window form.** Opener `useOpenQuickNoteSaveWindow` has **0 consumers** and nothing else dispatches the overlay; every real save-to-notes capture uses the `QuickNoteSaveOverlay`/`Popover`/`Dialog` siblings (all over the shared `QuickNoteSaveCore`). The window is a built-but-unreachable 4th chrome → **retire it (cleaner) or give it an opener/tile** (P1·S).

3. **Quick-Create exemplars confirmed (chunk question 2):** `quickNoteSaveWindow` and `taskQuickCreateWindow` are the canonical Create-from-seed pattern — thin window over a reusable Core taking a seed payload (`initialContent`/`source`+`prePopulate`) and an `onSaved(entity, action)` router. The Core, not the window, is the asset (each Core has 3–4 chromes).

4. **Family consolidation (chunk question 3):** notes trio and task trio are **correctly separate, NOT one mode-driven component** — each is already-one at the *core* level (`NoteInfoPanel`, `QuickNoteSaveCore`, `TaskEditor`, `TaskCreatePanel`, `QuickTasksWorkspace`) with thin distinct chromes. No merge-to-modes warranted. One mis-naming: **`quickTasksWindow` is the Manage view, not the Quick-Create twin of `quickNoteSaveWindow`** — its "Quick" label/registry "Tasks" drift should be reconciled, and it oddly lives under `windows/context-scopes/` instead of `windows/tasks/`.

5. **Zero surface registration across all 6** (chunk question 4) — no agents/help std controls, no help-assistant context wiring anywhere. This is the chunk's biggest systemic gap and aligns with system build items S1–S3. taskEditor/quickTasks/notes are the highest-value targets (P1·M each).

6. **Strong canonical cores, but two surfacing gaps:** `quickTasksWindow` and `taskQuickCreateWindow` are reachable only via Tools-Grid / direct `openOverlay` (their opener hooks have 0 consumers) — under-surfaced where users manage/create tasks. A "New Task" Tools-Grid tile + bespoke entry points would close it (P2·S/M). By contrast `taskEditorWindow` (7 sites) and `notesWindow` (6 sites) are the chunk's distribution gold standards.
