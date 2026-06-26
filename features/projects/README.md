# Projects Feature

Organization-scoped project management system. Projects mirror the Organizations feature with full member management, role-based access, and invitation system.

## Architecture

Projects are owned by organizations (not users directly). Access is controlled via `project_members` with role-based RLS policies.

```
organizations → projects → project_members → auth.users
                         ↘ project_invitations → auth.users
                         ↘ tasks
```

## Database Schema

### `projects`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `name` | text | Required |
| `slug` | text | URL-safe, unique per org |
| `description` | text | Optional |
| `organization_id` | uuid | FK → organizations. Every project has a non-null org, including personal projects |
| `created_by` | uuid | FK → auth.users |
| `settings` | jsonb | Extensible config |

> **Personal-ness is org-derived.** `ctx_projects.is_personal` was **dropped** — a project is "personal" **iff its owning organization's `organizations.is_personal` is true** (every user has exactly one personal org). Never treat `organization_id IS NULL` as "personal" anymore. Read personal-ness from the org: join `organizations(is_personal)`, or use the RPC-derived `NavProject.is_personal`. The canonical `createProject` service in `features/projects/service.ts` resolves missing org input to the user's real personal org via `ensure_personal_organization` and writes that id.

### `project_members`
| Column | Type | Notes |
|--------|------|-------|
| `role` | project_role | `owner \| admin \| member` |
| `joined_at` | timestamptz | Auto-set |
| `invited_by` | uuid | FK → auth.users |

### `project_invitations`
Mirrors `organization_invitations` — email-based, token-based, 7-day expiry.

## Role Hierarchy

```
owner > admin > member
```

| Permission | owner | admin | member |
|------------|-------|-------|--------|
| View project | ✅ | ✅ | ✅ |
| Edit settings | ✅ | ✅ | ❌ |
| Manage members | ✅ | ✅ | ❌ |
| Invite members | ✅ | ✅ | ❌ |
| Delete project | ✅ | ❌ | ❌ |

## RLS Policies

- **projects SELECT**: project member OR org owner/admin
- **projects INSERT**: org member, `created_by = auth.uid()`
- **projects UPDATE/DELETE**: project admin/owner OR org owner/admin
- **project_members**: members see all; admins manage all
- **project_invitations**: admins manage; invitee can read/delete own

## Routes

| Route | Description |
|-------|-------------|
| `/projects` | Personal projects hub (also lists org projects, linking back to their org routes) |
| `/projects/[id]` | Personal project detail. Segment is a UUID — slug is not globally unique (DB only enforces `UNIQUE (organization_id, slug)`), so the personal-scope route must use the UUID. Slug-shaped values are accepted as a back-compat fallback. |
| `/projects/[id]/settings` | Personal project settings |
| `/org/[slug]/projects` | List org projects |
| `/org/[slug]/projects/[project-slug]` | Org project detail / task view. The segment accepts either the slug (unique within the org) or the project UUID. |
| `/org/[slug]/projects/[project-slug]/settings` | Org project settings (tabbed) |
| `/settings/projects` | User's projects across all orgs (routes each card to its correct personal- or org-scoped detail page) |
| `/invitations/project/accept/[token]` | Accept project invitation |

## Feature Directory

```
features/projects/
├── types.ts           — Project, ProjectWithRole, ProjectMember, ProjectInvitation, ProjectRole
├── service.ts         — CRUD, member management, invitation system
├── hooks.ts           — React hooks for components
├── index.ts           — Barrel exports
├── agent-context/     — Surface agent wiring for `matrx-user/projects` (see "Agent surface" below)
│   └── buildProjectsContextData.ts — pure contextData builder + PROJECTS_CONTEXT_MENU_PROPS + createProjectsExtraSections
└── components/
    ├── ProjectList.tsx
    ├── ProjectCard.tsx
    ├── CreateProjectModal.tsx — Thin compat wrapper over ProjectFormSheet (preserves old isOpen/onClose/onSuccess(CreatedProjectInfo) API); used by ResearchInitForm/ProjectList
    ├── ProjectFormCore.tsx    — Canonical chrome-less create form (name/slug/desc/owner). Single source of truth — don't fork
    ├── ProjectCreatePanel.tsx — Two-mode wrapper around the core: "Manual" (ProjectFormCore) + "Use AI" (AgentRunWrapper, agent 917074a0…). The body every create surface wraps
    ├── ProjectFormSheet.tsx   — Dialog (desktop) / Drawer (mobile) chrome over ProjectCreatePanel
    ├── ProjectSettings.tsx    — Tabbed settings (General, Members, Invites, Danger)
    ├── ProjectSidebar.tsx
    ├── GeneralSettings.tsx
    ├── MemberManagement.tsx
    ├── InvitationManager.tsx
    └── DangerZone.tsx
```

## Agent surface — `matrx-user/projects`

The project workspace (`ProjectWorkspace.tsx`, route `/projects/[projectId]`) is wired into the agent context system so agents bound to `matrx-user/projects` can act on the open project.

- **Manifest:** `features/surfaces/manifests/projects.manifest.ts` (`createProjectsScope`). Customs: `active_project_id/name/description`, `is_personal_project`, `active_organization_id/name`, plus list-level `selected_project_ids` / `project_count` (owned by a future list-surface mount, **not** the single-project workspace).
- **Emit contract:** `features/projects/agent-context/buildProjectsContextData.ts` — a PURE builder (live project + org + member/task counts → manifest scope, exact value names). Emits real baselines where the surface has them (`content` = project description, `selection` = browser selection, `context` = a status/priority/counts/role blob) + the customs above. Exports `PROJECTS_CONTEXT_MENU_PROPS` (`sourceFeature: "project-create"` — reused as the closest valid `SourceFeature`; `surfaceName`; `placementMode`) and `createProjectsExtraSections` (Manage settings / knowledge-graph navigation). `isEditable` is NOT baked in — each mount passes its own.
- **Mounts (in `ProjectWorkspace.tsx`):** the hero identity/overview is wrapped in a **presentational** `UnifiedAgentContextMenu` (`isEditable={false}`) for right-click agent actions on the read view; the in-place **description** editor (`InlineProjectDescription` → `ProTextarea`) receives `surfaceName` + `getApplicationScope` for its built-in surface "…" agent menu. The name editor is `ProInput` (no surface agent menu — covered by the surrounding presentational menu).
- **Follow-up (out of scope here):** the Manage page (`GeneralSettings.tsx`) reuses the same inline editors and can opt into the surface "…" menu by threading `surfaceName` + a `getApplicationScope`; the list surfaces (`ProjectsHub`/`ProjectList`) are the natural home for `selected_project_ids` / `project_count`.

## API Routes

- `POST /api/projects/invite` — Create invitation + send email
- `POST /api/projects/invitations/resend` — Resend invitation email

Both require authentication and project admin role (enforced by RLS).

## Key Hooks

```ts
useOrgProjects(organizationId)      // Projects in an org where user is a member
useUserProjects()                   // All user's projects across all orgs (incl. personal)
usePersonalProjects()               // Projects owned by the user's personal org
useProject(projectId)               // Single project
useProjectUserRole(projectId)       // Current user's role + permission flags
useProjectMembers(projectId)        // Member list with user details
useProjectMemberOperations(projectId) // updateRole, remove, leave
useProjectInvitations(projectId)    // Invitation list
useProjectInvitationOperations(projectId) // invite, cancel, resend
useProjectSlugAvailability(slug, orgId) // Debounced slug check
```

> **`useUserProjects` / `usePersonalProjects` / `useOrgProjects` are now derived from the Redux nav tree** (`features/agent-context`). They no longer issue their own queries — the single source of truth is the `get_user_full_context` RPC, hydrated into Redux on mount. Any project mutation must dispatch `invalidateAndRefetchFullContext()` so consumers stay in sync.

## Cross-cutting Cache Invalidation

Every project write path dispatches `invalidateAndRefetchFullContext()` from `features/agent-context/redux/hierarchyThunks` so `/projects`, `/org/[slug]/projects`, the `HierarchyCascade`, the `NoteSidebar`, the wizard, and any other nav-tree consumer all converge on the same data.

| Write path | Where | Notes |
|------------|-------|-------|
| Create (canonical) | `features/projects/service.ts createProject` | Always writes `ctx_projects` row + `ctx_project_members` owner row (no `is_personal` — personal-ness is org-derived) |
| Create modal (compat) | `CreateProjectModal` | Now a thin wrapper over `ProjectFormSheet` — every consumer (ResearchInitForm, ProjectList) gets the Manual + Use AI experience. Preserves the old `isOpen` / `onClose` / `onSuccess(CreatedProjectInfo)` / `redirectOnSuccess` contract (`redirectOnSuccess=false` → `skipRedirect`) |
| AI create | `ProjectCreatePanel` "Use AI" tab → `AgentRunWrapper` (agent `917074a0-fc06-4ff4-9805-4a517e04d08b`, sourceFeature `project-create`) | The agent writes the project **directly to the DB server-side**. On the run's `running/streaming → complete` edge, `AgentRunWrapper.onRunComplete` fires; the panel dispatches `invalidateAndRefetchFullContext()` (refreshes every nav-tree-derived consumer) and calls `onAiComplete()` for self-fetching surfaces (`ProjectsHub` → its local `refresh()` via the window's `ai-created` event) |
| Create core | `ProjectFormCore` | Canonical chrome-less form. Every surface (sheet, window, route) wraps this — never fork it |
| Create panel | `ProjectCreatePanel` | Two-mode body: "Manual" → `ProjectFormCore`; "Use AI" → `AgentRunWrapper` (agent `917074a0-fc06-4ff4-9805-4a517e04d08b`, sourceFeature `project-create`). Pass `enableAi={false}` for manual-only |
| Create sheet | `ProjectFormSheet` | Dialog/Drawer over `ProjectCreatePanel` (AI on by default; `enableAi` prop). Dispatches invalidation; redirects personal projects to `/projects/...` |
| Create window | `CreateProjectWindow` | WindowPanel over `ProjectCreatePanel` (overlay system; open via `useOpenCreateProjectWindow`). Consumers: War Room picker + the `/projects` hub "New project" button. Emits `created` (manual) and `ai-created` (AI) so self-fetching consumers refresh |
| Create route | `/projects/new` (`app/(core)/projects/new/page.tsx`) | Full-page `ProjectCreatePanel`; routes to `/projects/{id}/settings` on success |
| Update settings | `GeneralSettings` | Dispatches invalidation on save |
| Delete | `DangerZone` | Dispatches invalidation before navigating away |
| Hierarchy service create | `hierarchyService.createProject` | Delegates to canonical `createProject` — single owner of the write |

## Email Templates

Two project-specific templates in `lib/email/client.ts`:
- `emailTemplates.projectInvitation(...)` — Initial invite
- `emailTemplates.projectInvitationReminder(...)` — Resend reminder

## RPC Functions

| Function | Purpose |
|----------|---------|
| `get_project_members_with_users(p_project_id)` | Secure member + user details join |
| `get_user_projects(p_org_id?)` | User's projects with role and member count |
| `auth_is_project_member(project_id)` | RLS policy helper |
| `auth_is_project_admin(project_id)` | RLS policy helper |
| `auth_is_project_owner(project_id)` | RLS policy helper |

## Change Log

- `2026-06-25` — **Canonical-DB cutover: members + invitations moved to `iam.memberships` / `iam.invitations`.** All project member + invitation reads/writes now go through two new sole-chokepoint services — `membershipsService` (`mbr_*` RPCs) and `invitationsService` (`inv_*` RPCs) in `features/organizations/service/` — never the legacy `ctx_project_*` junction tables. `service.ts` member functions (`getProjectMembers`, role/remove with the last-owner guard, `getProjectUserRole`, the project-listing trio via a shared `loadUserProjectsWithRole` using batch `mbr_count`) and invitation functions (`inviteToProject`/`getProjectInvitations`/`cancel`/`resend`/`accept`/`getUserProjectInvitations`) were rewritten. `createProject` writes the owner membership explicitly (legacy trigger no longer mirrors to canonical). `acceptProjectInvitation` relies on the atomic `inv_accept` (membership + accept in one txn). The two invite API routes are now email-only. `features/tasks/services/projectService.ts` and the accept page migrated too.
- `2026-06-26` — Removed the Personal pseudo-org sentinel from project creation and navigation. `createProject`, JSON import, legacy task project creation, slug checks, and project listing hooks now resolve personal work to the user's real personal organization id.
- `2026-06-23` — Create-project window layout polish: default window geometry enlarged, outer body padding removed so the Use AI runner renders edge-to-edge, Manual/Paste JSON panes now use stable full-height layouts with footer actions pinned to the bottom, and project create name/description plus Paste JSON fields use `ProInput`/`ProTextarea` with live `matrx-user/projects` create context.
