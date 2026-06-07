# FEATURE.md — `tasks` + `projects`

**Status:** `active` — both features in production
**Tier:** `2`
**Last updated:** `2026-06-06`

> Combined doc. **Projects and Tasks are first-class _containers_** (like orgs and scopes): nearly every resource table carries both a `project_id` and a `task_id` column, so "what belongs to this project/task" is a direct FK query — the same shape as the org workspace's `organization_id`. Tasks nest under projects (`project_id`) and under each other (`parent_task_id`). They share the org-scoped architecture documented in [`features/scopes/FEATURE.md`](../scopes/FEATURE.md).

---

## Purpose

Org-scoped project management. Projects group work within an organization; tasks are todos with metadata (status, assignment, timestamps, attached conversations, attached transcripts, etc.) belonging to a project. The scope chain `org → project → task` is a central axis of the [scope system](../scopes/FEATURE.md).

---

## Entry points

**Routes (canonical, top-level — un-nested from orgs)**
- `app/(core)/projects/page.tsx` — **ProjectsHub** launcher; `?org=<slug|id>` / `?scope=<id>` filtered views. Self-fetches `ctx_projects` (RLS-filtered), not nav-tree-dependent.
- `app/(core)/projects/[projectId]/page.tsx` — **ProjectWorkspace** (resolves by slug or UUID): hero + nested task list + associated resources + scopes + advanced references.
- `app/(core)/projects/[projectId]/settings/page.tsx` — **ProjectManage** (single-page sectioned, no tabs): General / Scopes / Members / Invitations / Danger.
- `app/(core)/tasks/page.tsx` — `TasksDesktopShell` (3-pane); `app/(core)/tasks/[id]/page.tsx` — `TaskEditor`.
- **Legacy redirects:** `app/(core)/organizations/[orgId]/projects/**` → `/projects?org=` and `/projects/[id]`; `(transitional)/settings/projects` → `/projects`. `(transitional)/projects/**` removed.

**Feature code — `features/projects/`**
- `service.ts` (canonical CRUD + members + invitations + `getProjectReferences`), `hooks.ts`, `types.ts`
- `components/ProjectWorkspace.tsx`, `ProjectsHub.tsx`, `ProjectManage.tsx`, `ProjectTaskList.tsx` (new), plus `GeneralSettings`/`MemberManagement`/`InvitationManager`/`DangerZone`/`ProjectReferencesPanel`/`ProjectFormSheet`/`CreateProjectModal` (reused)
- `README.md` — user-facing guide

**Feature code — `features/tasks/`**
- `components/` (incl. `TaskEditor.tsx`, `TasksDesktopShell.tsx`, `TaskAssociatedResources.tsx` (new)), `hooks/`, `services/taskService.ts`, `utils/`, `types/`
- `redux/` — `taskUiSlice`, `selectors`, `thunks`, `taskAssociationsSlice` (M2M engine: `associateWithTask`/`dissociateFromTask` — UI panel pending)
- `widgets/` — task widgets

**The container primitive (shared, in `features/organizations/`)**
- `hooks/useContainerInventory.ts` — counts catalogue resources for any container by `{column: organization_id|project_id|task_id, value}`. `useOrgResourceInventory` delegates to it.
- `components/ContainerResourceSheet.tsx` — lists a kind's FK-linked items with peek/open (reused by project workspace + task editor).
- `resource-catalogue.ts` + `OrgResourceRoleSection.tsx` (now `onContribute` optional) — role-grouped tiles.

---

## Data model

**DB tables** (Supabase, project `txzxabzwovsujtloxrus`):
- `ctx_projects` — `id`, `organization_id` (FK → organizations; non-null after the personal-org backfill), `name`, `slug`, `description`, `created_by`, `settings`, timestamps. **No `is_personal` column** — a project is "personal" iff its owning org's `organizations.is_personal` is true (derive via the org, or read RPC-derived `NavProject.is_personal`).
- `ctx_tasks` — `id`, `title`, `description`, `project_id`, `parent_task_id` (subtasks), `status` (`incomplete`/`completed`), `priority` (enum), `due_date`, `assignee_id`, `organization_id`, `is_public`, `settings`
- `ctx_project_members` / `ctx_project_invitations` — membership + invites
- `ctx_task_comments` / `ctx_task_attachments` / `ctx_task_assignments` — task sub-records
- `ctx_task_associations` — generic task↔entity M2M (`get_task_associations` / `get_tasks_for_entity` / `associate*` RPCs)
- `getProjectReferences(projectId)` RPC — every table FK-referencing a project (`{schemaName, tableName, columnName, rowCount}`)

**Container insight:** nearly every resource table carries both `project_id` and `task_id`. FK-association is therefore universal and read via `useContainerInventory`. Projects/tasks are also scopeable (`ctx_scope_assignments`, entity types `project`/`task`) and counted in the org resource catalogue.

---

## Key flows

### Flow 1 — Create a project in an org

1. User (with org permission) creates a project → row inserted with `organization_id`.
2. Owner role granted; further members added via project invitations.

### Flow 2 — Create a task

1. User in a project creates a task → row inserted with `project_id`.
2. Task inherits org scope via join.
3. Conversations / transcripts / notes attached to the task stamp `task_id` on their own rows.

### Flow 3 — Task widgets

1. Task detail renders registered widgets (`features/tasks/widgets/`).
2. Widgets are mini-components that read/write against the task row or related data.
3. Extensible — new widgets register in the widget system without touching core task rendering.

### Flow 4 — Agent invocation scoped to a task

1. User runs an agent / shortcut from within a task context.
2. `appContext.taskId` is set; `assembleRequest` carries `scope.task_id`.
3. Conversation stamped with `task_id`; broker lookups resolve at task level first.

### Flow 5 — Invite a user to a project

1. Project owner / admin sends an invitation to an email.
2. Row in `project_invitations`; email sent via `features/email/`.
3. Acceptance adds `project_members` row.

---

## Invariants & gotchas

- **Every task has a project; every project has an org.** Personal projects may exist — verify the null-organization case before assuming otherwise.
- **Scope inheritance is explicit, not derived at the client.** Always carry the full scope chain on requests.
- **RLS enforces access.** UI-level filtering is for UX only.
- **Widgets render additively** — a failing widget must not break task detail.
- **Conversations attached to tasks carry the full scope chain** on `cx_conversation`. Don't re-stamp.
- **Project slugs / URL identifiers** — verify uniqueness scoping (per-org or global) before building routes that depend on them.

---

## Related features

- **Depends on:** `features/organizations/` (parent scope), `features/scope-system/`, `features/sharing/` (share grants orthogonal to membership), `features/invitations/` (and its `project_invitations` extension)
- **Depended on by:** `features/agents/` (task-scoped invocations), `features/transcripts/` (task-attached transcripts), `features/notes/` (project-scoped notes)
- **Cross-links:** [`../scopes/FEATURE.md`](../scopes/FEATURE.md), [`../organizations/FEATURE.md`](../organizations/FEATURE.md)

---

## Change log

- `2026-06-07` — claude: **Projects are now real PM containers + view==edit, no filter traps.** (1) Added `ctx_projects` columns `status` (planning/active/paused/completed/archived), `priority`, `start_date`, `target_date` — projects are no longer title-only. (2) New `ProjectInlineEditors` (`InlineProjectName`, `InlineProjectDescription`, `ProjectMetaRow`) — name/description/status/priority/dates/**organization** all edit IN PLACE and autosave via `updateProject` (no Edit/Save toggle, no separate edit page). Used on the workspace hero AND the Manage › General card (which is now directly editable). `UpdateProjectOptions` + service handle the new fields. (3) **Filter trap fixed:** `ProjectsHub` shows a visible, removable filter banner whenever `?org=`/`?scope=` is active (chip + X + "Show all projects" → `/projects`); `DangerZone` post-delete redirect now always goes to plain `/projects` (it used to send you to `/organizations/<slug>/projects`, which redirects to `/projects?org=` and silently trapped you in a filter).
- `2026-06-07` — claude: **`ProjectTaskList` made fully inline-editable (Linear/Things style).** Every task field is now editable from the project-workspace table — not just the name on add. Title is click-to-edit (`InlineTitle`: Enter/blur saves, Escape cancels); Priority is an inline `Popover` picker (None/Low/Med/High colored pill, None→null); Due is an inline `Popover` + `Calendar` with a Clear option (overdue shown red). All edits go through one optimistic `patchField` → `updateTask` with revert + `toast.error`, and work on parent rows AND subtasks. Quick-add row now sets name + priority + due before adding and has an **Advanced** chevron revealing a Description textarea (`createTask` supports `description`). New trailing actions column with an "Open" affordance that navigates to `/tasks/[id]` (the full `TaskEditor` is Redux-coupled to `selectSelectedTaskId` and can't render standalone from a prop, so navigation is used rather than a half-wired drawer). Self-fetch / complete-toggle / nested subtasks / collapsible Done / `onCountsChange` all preserved.
- `2026-06-06` — claude: **Project Manage › General redesigned + Organization made editable.** `GeneralSettings` is now a clean definition-row read view with inline edit (no nested header / double padding). Organization is a first-class **editable** field — an org picker over the user's orgs (incl. their personal org) that persists via `updateProject({ organizationId })` (added `organizationId` to `UpdateProjectOptions`; the service sets `organization_id`, never null). Slug + created stay read-only with reasons. Also widened the hub table's Organization column.
- `2026-06-06` — claude: **`ctx_projects.is_personal` dropped → personal-ness is org-derived.** The DB column no longer exists; a project is "personal" iff its owning org's `organizations.is_personal` is true (every project now has a non-null org after backfill). Removed `is_personal` from all `ctx_projects` `.select(...)` / insert payloads across `features/agent-context/redux/projectsSlice.ts`, `features/agent-context/service/hierarchyService.ts` (+ `HierarchyProject` shape), `features/projects/service.ts` (`createProject` insert, `getPersonalProjects` filter now joins `organizations(is_personal)`, `transformProjectFromDb` reads org join), `features/projects/components/{ProjectsHub,ProjectWorkspace,ProjectFormSheet}.tsx`, `app/(core)/invitations/project/accept/[token]/page.tsx`, `features/tasks/services/projectService.ts`. `ProjectsHub`/`ProjectWorkspace` now compute the "Personal" badge from the org's `isPersonal` (no longer `!organizationId`). `NavProject.is_personal` / `NavOrganization.is_personal` (RPC-derived) and `organizations.is_personal` / `ctx_templates.is_personal` are unchanged.
- `2026-06-06` — claude: **UX refinements.** (1) New `AssignedScopesDisplay` (read-only `Scope Type: Scope` + Organization line, resolving `ctx_scope_assignments → ctx_scopes → ctx_scope_types`) replaces the misused `EntityScopeTagger` on the project workspace — it now shows only *assigned* scopes by type, never the full available list. `EntityScopeTagger` remains the editor (Manage › Scopes). (2) Project workspace Tasks are now a table (Task/Priority/Due, subtasks indented). (3) Projects hub gained a Cards/Table dual view (sortable, searchable, full-width table) backed by one batched task-count query. **Note:** "Personal" badge keys off `is_personal` OR no org — a project can have both `organization_id` set AND `is_personal=true` (e.g. All Green Region Pages = Titanium + personal); the Scopes display correctly shows the real org regardless. Org-from-scope auto-assign is NOT implemented (the one project checked already had its org set).
- `2026-06-06` — claude: **reimagined Projects + enhanced Tasks as containers.** New `useContainerInventory` primitive (org delegates). New canonical top-level **ProjectWorkspace** (`/projects/[id]` — hero, nested ProjectTaskList with subtasks + quick-add, role-grouped associated resources via `project_id`, scope tagging, ProjectReferencesPanel), **ProjectsHub** (`/projects` with `?org=`/`?scope=` filters + live task previews), and **ProjectManage** (`/projects/[id]/settings`, single-page sectioned — no tabs). Task editor gained an **Associated resources** section (FK by `task_id`). Legacy org-nested + transitional project routes now redirect; `createProjectThunk` migrated to the canonical `features/projects/service.ts`. **Pending:** a UI panel for `ctx_task_associations` (M2M linked items) — the redux engine exists; only the panel is unbuilt. Full `features/tasks/services/projectService.ts` dedup still pending (used by `useTaskManager`/`ImportTasksModal` for `getProjectsWithTasks`/`ensureDefaultProject`).
- `2026-04-25` — Stopped using `features/projects/index.ts` and `features/tasks/redux/index.ts` as import entry points: call sites import from `service.ts` / `types.ts` / `hooks.ts` / `components/*` (projects) and from `taskUiSlice` / `selectors` / `thunks` / `taskAssociationsSlice` / `quickTasksWindowSlice` (tasks). Root `index.ts` files remain for re-exports only.
- `2026-04-22` — claude: initial combined FEATURE.md for tasks + projects.

---

> **Keep-docs-live:** schema changes to `projects` or `tasks`, widget system changes, or scope-column changes must update this doc and cross-check `features/scopes/FEATURE.md`.
