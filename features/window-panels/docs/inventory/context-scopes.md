# Inventory chunk — Context, Scopes & Projects

> Panels: `contextSwitcherWindow`, `scopeEditWindow`, `hierarchyCreationWindow`, `contextAssignmentWindow`, `projectsWindow`, `createProjectWindow`, `creatorHub`, `resourcePickerWindow`, `itemDetailWindow`.
> Legend: ✓ present · ◑ partial · ✗ missing · — n/a. Priority P0/P1/P2 · Effort S/M/L.
> Filled 2026-06-23. See master `PANEL_INVENTORY.md` for column contracts.

## Chunk-level findings (read first)

- **`resourcePickerWindow` = confirmed ORPHAN.** Registry entry + catalogue entry exist, but there is **NO opener file, NO `OverlayController` render branch, NO Tools-Grid tile**. The overlay branch + opener were deliberately deleted (overlays `FEATURE.md` 2026-06-14: "`onResourceSelected` is required → it was a latent crash"). The inner `ResourcePickerMenu` is the live primitive, rendered DIRECTLY (not in a window) by 5+ chat inputs (`cx-chat`, `cx-conversation`, `ResourcePickerButton`, `public-chat`). **Verdict: DELETE the window** (registry + catalogue rows) via `remove-window-panel` — adding an opener would resurrect the latent-crash contract for a window nobody asked for.
- **`contextAssignmentWindow` is NOT a registered overlay.** It exists as `features/scopes/components/context-assignment/ContextAssignmentWindow.tsx` — an **inline-controlled** WindowPanel wrapper (`open`/`onClose` owned by the caller, **no `overlayId`**), its own doc-comment says overlay-catalogue registration "is the production follow-up… once the component set is approved." Only consumer: the context-lab demo. The chunk brief named it as an overlayId, but it has no registry/catalogue/controller/opener footprint. Treated below as a panel candidate, not a registered panel.
- **`projectsWindow` Tools-Grid gap CONFIRMED.** Registered + opener (`useOpenProjectsWindow`) + controller branch exist, but **no Tools-Grid tile** and **zero bespoke callers** — effectively unreachable for users. Matches the master "genuine missing tiles" note.
- **`createProjectWindow` = the Ref-system exemplar.** Callback-aware opener (`useOpenCreateProjectWindow` → `onCreated`/`onAiCreated`/`onWindowClose` through `callbackManager`, typed `callbacks.ts`), multi-instance, ephemeral. **3 real consumers** (War Room project picker, `ProjectsHub` "New project", sidebar nav "Add Project"). The pattern to copy for any "create X, hand it back to the opener" window.
- **Scopes/context family** = `contextSwitcherWindow` + `scopeEditWindow` + `hierarchyCreationWindow` (+ the unregistered `contextAssignmentWindow`). They are **complementary, not duplicates**: switcher = read/select GLOBAL active context (Surface A → `appContextSlice`); scopeEdit = CRUD one scope; hierarchyCreation = create org/project/task; contextAssignment = tag a single entity to scopes (LOCAL, `ctx_scope_assignments`). Keep separate — but `hierarchyCreationWindow` (a 3rd creation path next to `createProjectWindow` and `scopeEditWindow`) is a soft consolidation candidate.
- **Universal gaps (all 8):** none is a **registered surface**; none has the new **std header controls** (Agents/Help); none has **help-assistant context wiring**. These are S2/S3 system rollouts, not per-panel bugs.
- **`creatorHub`** is the chunk's one true multi-tab **Manage hub** — a 17-tab consolidation of creator/debug panels (sidebar = tab list, footer = live active-agent/conversation status). Solid consolidation; only soft-bound to context/projects (it lives in this chunk by folder, not domain).

---

## Table A — Functionality, Coverage & Composition

| Panel | Domain | Purpose | Maturity | Create(M/I/AI) | Seed | Edit | Manage | Rel | Exec | Fidelity gap | Domain family (siblings) | Consolidation verdict | Action (P·E) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| contextSwitcherWindow | Scopes/Context | Read+select GLOBAL active context (org/scope/project/task) | Partial | ✗/✗/✗ | — | ◑ select-only | ✗ | ✓ sets active ctx | — | bare `HierarchyTree` in a 360×480 box; no header actions/footer/sidebar; can't manage scopes | scopeEdit, hierarchyCreation, contextAssignment(unreg) | keep-separate-justified (Surface-A selector, distinct from CRUD) | enrich + surface (P2·M) |
| scopeEditWindow | Scopes | Create/edit ONE scope (canonical `ScopeForm`) | Solid | ✓/✗/✗ | ◑ parentScopeId preset | ✓ | ✗ | ◑ parent nesting | — | single-item only; no list/manage; opened from 1 site | contextSwitcher, hierarchyCreation, contextAssignment | keep-separate-justified (single-scope CRUD core) | add Tools-Grid tile + surface (P2·S) |
| hierarchyCreationWindow | Scopes/Hierarchy | Create org / project / task (mode by `entityType`) | Partial | ✓/✗/✗ | ✓ presetContext + tile seed | ✗ | ✗ | ◑ creates under preset parent | — | thin name+desc form; overlaps `createProjectWindow` (richer, AI) for projects; no tasks-rich form | createProject, scopeEdit | **merge-candidate** (project branch duplicates createProjectWindow; route project→createProjectWindow, keep org/task) | consolidation review (P2·M) |
| contextAssignmentWindow (UNREGISTERED) | Scopes/Context | Tag ONE entity to scopes (LOCAL, `ctx_scope_assignments`) | Solid (as component) | ✓ inline quick-add scopes/tasks | — | ✓ | ◑ multi-section | ✓ entity↔scope | — | not overlay-registered → not openable from anywhere; demo-only | contextSwitcher, scopeEdit | register as overlay OR keep inline-only (per scopes-team approval) | register overlay (P2·M) |
| projectsWindow | Projects | Browse projects by org via hierarchy cascade | Partial | ✗ (no inline create) | ✗ | ✗ | ◑ browse-only list | ✗ | — | read-only list; rows don't open/route; no New button; unreachable (no tile/caller) | createProject, hierarchyCreation | keep-separate-justified (list view) BUT wire it + add create | add tile + bespoke + New (P1·M) |
| createProjectWindow | Projects | Create a project anywhere (Manual + Use-AI) | Gold | ✓/✗/✓ | ◑ initialOrg lock | ✗ (create-only) | ✗ | — | ✓ AI run creates server-side | none material; ephemeral by design | hierarchyCreation, projectsWindow | already-one (wraps canonical `ProjectCreatePanel`; nobody forks the form) | exemplar — replicate pattern (P2·S) |
| creatorHub | Creator/Debug | Multi-tab creator+debug home bound to last-active conversation | Solid | ✗ | ✗ | ✗ | ✓ 17 tabs (Settings/Data/Context/Payload/Run/System/Memory/Stream/Routing/Sandbox…) | ✗ | ✓ run-control + debug actions | tabs are bespoke (no first-class WindowPanel tab API); conversation-bound, empty-state when none | (run-controls family in agents chunk) | already-one (consolidates inline CreatorRunPanel + debug panels) | — |
| resourcePickerWindow (ORPHAN) | Resources/Attach | Pick a resource to attach (image/file/yt/audio) | Stub (window) | ✓ via menu | — | — | ✗ | ✓ attaches to input | ✓ onResourceSelected | UNREACHABLE: no opener/branch/tile; inner `ResourcePickerMenu` used directly elsewhere | (resource-picker primitive) | **delete window** (menu is the live primitive) | delete (P1·S) |
| itemDetailWindow | Item-presentation | Generic read-only detail for any `item_presentation` entity w/o bespoke window | Solid | ✗ | ✓ seeds name/about instantly | ✗ (read-only) | ◑ all scalar fields formatted | ✗ | — | read-only; fetches via registry `detailSource`; graceful all states | (item-presentation registry) | keep-separate-justified (universal fallback) | — |

---

## Table B — Utility, Surface & Construction

| Panel | Header actions | Footer (+variant) | Sidebar | 2nd panel | Tabs | Persist (collect/urlSync/heavy/autosave) | Pop-out | Tray (snap/preview) | Ref/callback | Surface reg | Std ctrls (agents/help) | Help-assistant ctx | Canonical core | E2E state | Underused utilities | Action (P·E) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| contextSwitcherWindow | ✗ | ✗ | ✗ | ✗ | — | ✗/✗/✗/✗ | default | default | opener (no cb) | ✗ | ✗ | ✗ | ◑ canonical `HierarchyTree` + `useHierarchyReduxBridge` | ✓ DB→Redux `appContextSlice` (Surface-A writer) | header/footer/surface/help; urlSync | add surface+std-ctrls (P2·M) |
| scopeEditWindow | ✗ | ✗ (form buttons in body) | ✗ | ✗ | — | ✗/✗/✗/✗ | default | default | opener (no cb) | ✗ | ✗ | ✗ | ✓ canonical `ScopeForm` (createScope/updateScope thunks) | ✓ DB→Redux scope slices (self-hydrates on open) | footerRight for actions; surface/help | move actions→footer; surface (P2·S) |
| hierarchyCreationWindow | ✗ | ✓ bar (Cancel/Create) | ✗ | ✗ | — | ✗/✗/✗/✗ | default | default | opener (no cb) | ✗ | ✗ | ✗ | ◑ own form (NOT shared with createProject/scopeEdit) | ◑ writes via `useHierarchy` mutations (react-query, not slice) | surface/help; AI-create (has none) | merge project branch; surface (P2·M) |
| contextAssignmentWindow (UNREG) | ✗ | ◑ field owns footer | ✗ | ✗ | — | ✗/✗/✗/✗ (inline-controlled) | default | default | ✗ (no opener) | ✗ | ✗ | ✗ | ✓ canonical `ContextAssignmentField` (setEntityScopes chokepoint) | ✓ DB→Redux scope tree + 60s TTL data cache | overlayId, opener, tray, surface | register overlay+opener (P2·M) |
| projectsWindow | ✗ | ✗ | ✗ | ✗ | — | ✗/✗/✗/✗ | default | default | opener (no cb) | ✗ | ✗ | ✗ | ◑ `HierarchyCascade`+`useNavTree`; rows are local `CompactProjectItem` (dead chevrons) | ◑ DB→Redux nav tree (read); no write path | New button, row→route, header, surface | wire rows + New + tile (P1·M) |
| createProjectWindow | ✗ | ◑ panel owns footer | ✗ | ✗ | ◑ Manual/Use-AI (in ProjectCreatePanel) | ✗/✗/✗/✗ (ephemeral) | default | default | **opener + callback group ✓** (created/ai-created/window-close) | ✗ | ✗ | ✗ | ✓ canonical `ProjectCreatePanel` (shared w/ Sheet + /projects/new) | ✓ DB→Redux + `invalidateAndRefetchFullContext` on AI | surface/help; std header tab API | exemplar; add surface (P2·S) |
| creatorHub | ◑ titleNode | ✓ rich-ish (active agent/conv + creator chip, self-reading units) | ✓ tab-list sidebar (resizable) | ✗ | ✓ 17 (bespoke, sidebar-driven) | ✓/✓ `creator_hub`/✗/◑ onCollectData(activeTab) | default | default | opener (no cb) | ✗ | ✗ | ◑ footer shows active agent/conv (manual, not the S2 wiring) | ✓ reuses CreatorRunTabContent + debug panels (shared cores) | ✓ conversation-focus slice → shared cores | first-class tab API (S4); surface; std-ctrls | adopt tab API when S4 lands (P2·L) |
| resourcePickerWindow (ORPHAN) | ✗ | ✗ | ✗ | ✗ | — | ✗/✗/✗/✗ | — | — | ✗ none | ✗ | ✗ | ✗ | inner `ResourcePickerMenu` canonical (used direct) | n/a (window never mounts) | entire window is dead | DELETE (P1·S) |
| itemDetailWindow | ✓ titleNode + actionsRight (copy-id) | ✗ | ✗ | ✗ | — | ✗/✗/✗/✗ (ephemeral) | default | default | opener (no cb) | ✗ | ✗ | ✗ | ✓ canonical (item-presentation registry `detailSource`) | ◑ direct Supabase fetch (untyped client) — not via a slice | surface/help; could host actions/edit | add surface (P2·S) |

---

## Table C — Availability & Placement

| Panel | Opener? | Ref wired (popout/cb) | Portable vs route-locked | Tools Grid (tile/category) | Placement issue | Bespoke call sites (count + surfaces) | Usage gap | Action (P·E) |
|---|---|---|---|---|---|---|---|---|
| contextSwitcherWindow | ✓ `useOpenContextSwitcherWindow` (+Controller) | ✗ | portable | ✓ `tile.context-switcher` / general | ok | 0 (Tools-Grid only) | under-surfaced; no in-context entry from scope/project UIs | add bespoke entries (P2·M) |
| scopeEditWindow | ✓ `useOpenScopeEditWindow` (+Controller) | ✗ | portable | ✗ no tile | not in Tools Grid | 1 — `ContextAssignmentField` (inline scope create/edit) | thin reach; one caller | add tile (P2·S) |
| hierarchyCreationWindow | ✓ `useOpenHierarchyCreationWindow` (data type still `unknown` — TODO in opener) | ✗ | portable | ✓ 2 tiles (`new-organization`, project seed) / general | opener `data` type is loose (`unknown`, TODO) | 0 bespoke (tiles only) | tighten opener type; project branch redundant w/ createProject | type opener + reroute project (P2·M) |
| contextAssignmentWindow (UNREG) | ✗ no opener (inline `open`/`onClose`) | ✗ | route-locked (caller-rendered) | ✗ | not registered as overlay | 1 — context-lab demo only | can't be opened app-wide; production follow-up never done | register overlay+opener (P2·M) |
| projectsWindow | ✓ `useOpenProjectsWindow` (+Controller) | ✗ | portable | ✗ **MISSING TILE** | **confirmed gap** (master note) | **0** | unreachable for users (no tile, no caller) | add tile + bespoke + wire rows (P1·M) |
| createProjectWindow | ✓ `useOpenCreateProjectWindow` (callback-aware) | **callback ✓** (popout default) | portable | ✗ (ephemeral; intentional) | ok | **3** — War Room `WarRoomProjectPicker`, `ProjectsHub`, sidebar `navActions` "Add Project" | none (well distributed) | — (exemplar) |
| creatorHub | ✓ `useOpenCreatorHub` (+Controller, deep-link `initialTab`) | ✗ | portable | ✓ `tile.creator-hub` / creator (gated) | ok | 1 — `SidebarCreatorHubToggle` (Crown, footer) | ok (Crown + tile) | — |
| resourcePickerWindow (ORPHAN) | ✗ **NONE** | ✗ none | **UNREACHABLE** | ✗ | **registered but no open path** | 0 (window); inner menu used directly 5+ (cx-chat, cx-conversation, ResourcePickerButton, public-chat) | **cannot be opened — dead registry/catalogue rows** | **delete window** (registry+catalogue) (P1·S) |
| itemDetailWindow | ✓ `useOpenItemDetailWindow` (+Controller) | ✗ | portable | ✗ (contextual; intentional — opened per clicked entity) | ok | 1 — `useOpenItemPresentation` (the universal item-click fallback → effectively many surfaces) | ok (the fallback for all item types) | — |

---

## Notes / evidence
- Surface registration: grep of `features/surfaces` for all 8 overlayIds = **0 hits** → none is a registered surface (S3 rollout).
- `contextSwitcherWindow` is a **Surface-A writer** — `useHierarchyReduxBridge` dispatches `setOrganization`/`setScopeSelections`/`setProject`/`setTask` to `appContextSlice` (the load-bearing global-context invariant). Correct, not a bug.
- `scopeEditWindow` self-hydrates the agent-context scope slices on open (`fetchScopeTypes`/`fetchScopes`) because it can be opened from a surface reading a different tree.
- `createProjectWindow` callback contract mirrors curated-icon-picker / image-uploader; `callbacks.ts` documents the 4-step group/emit/dispose flow. War-room picker auto-selects the created project via `onCreated`.
- `creatorHub` footer uses self-reading status units (mirror `NoteMetadataBar`) — a good footer-status pattern, but it is hand-rolled, not the S2 help-assistant KV wiring.
- `hierarchyCreationWindow` writes via `useHierarchy` react-query mutations, NOT a Redux slice — the one panel here whose create path bypasses the slice→core E2E ideal.
