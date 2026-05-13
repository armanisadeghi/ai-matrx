# FEATURE.md — `tasks` + `projects`

**Status:** `active` — both features in production
**Tier:** `2`
**Last updated:** `2026-04-25`

> Combined doc. Tasks live under projects; they share the org-scoped architecture documented in `features/projects/CONCEPT-scope-system-redux-architecture.md`.

---

## Purpose

Org-scoped project management. Projects group work within an organization; tasks are todos with metadata (status, assignment, timestamps, attached conversations, attached transcripts, etc.) belonging to a project. The scope chain `org → project → task` is a central axis of the [scope system](../scope-system/FEATURE.md).

---

## Entry points

**Routes**
- `app/(authenticated)/projects/` — project list + detail
- `app/(authenticated)/tasks/` — task list + detail
- `app/(authenticated)/invitations/project/` — project-scoped invitation accept page (org invitations live at `/invitations/organization/`)

**Feature code — `features/projects/`**
- `components/`, `hooks.ts`, `service.ts`, `types.ts`, `index.ts`
- `CONCEPT-scope-system-redux-architecture.md` — the scope-architecture seed doc
- `README.md` — user-facing guide

**Feature code — `features/tasks/`**
- `components/`, `hooks/`, `services/`, `utils/`, `types/`, `index.ts`
- `redux/` — slice + selectors
- `sql/` — schema / migration artifacts
- `widgets/` — task widgets (renderable mini-components within task detail)

---

## Data model

**DB tables** (verify in Supabase; names representative):
- `projects` — `id`, `organization_id`, `name`, `description`, owner/roles, timestamps
- `tasks` — `id`, `project_id`, `status`, `assignees[]`, `due_at`, content, links to `cx_conversation` rows
- `project_members` / `task_assignments` — M2M membership
- `project_invitations` — invitations scoped to a specific project

The scope columns `organization_id` on projects, `project_id` on tasks, plus derived `organization_id` on tasks (via join) make these first-class citizens in the [scope system](../scope-system/FEATURE.md).

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
- **Cross-links:** [`CONCEPT-scope-system-redux-architecture.md`](../projects/CONCEPT-scope-system-redux-architecture.md), [`../organizations/FEATURE.md`](../organizations/FEATURE.md), [`../scope-system/FEATURE.md`](../scope-system/FEATURE.md)

---

## Change log

- `2026-04-25` — Stopped using `features/projects/index.ts` and `features/tasks/redux/index.ts` as import entry points: call sites import from `service.ts` / `types.ts` / `hooks.ts` / `components/*` (projects) and from `taskUiSlice` / `selectors` / `thunks` / `taskAssociationsSlice` / `quickTasksWindowSlice` (tasks). Root `index.ts` files remain for re-exports only.
- `2026-04-22` — claude: initial combined FEATURE.md for tasks + projects.

---

> **Keep-docs-live:** schema changes to `projects` or `tasks`, widget system changes, or scope-column changes must update this doc and cross-check `features/scope-system/FEATURE.md`.
