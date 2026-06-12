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
| `organization_id` | uuid \| null | FK → organizations. Every project now has a non-null org (backfilled) |
| `created_by` | uuid | FK → auth.users |
| `settings` | jsonb | Extensible config |

> **Personal-ness is org-derived.** `ctx_projects.is_personal` was **dropped** — a project is "personal" **iff its owning organization's `organizations.is_personal` is true** (every user has exactly one personal org). Never treat `organization_id IS NULL` as "personal" anymore (it's always false after the backfill). Read personal-ness from the org: join `organizations(is_personal)`, or use the RPC-derived `NavProject.is_personal` (`get_user_full_context` / `get_user_nav_tree` still emit it). The canonical `createProject` service in `features/projects/service.ts` writes the row + `ctx_project_members` owner entry (and accepts the UI sentinel `PERSONAL_PSEUDO_ORG_ID = '00000000-0000-0000-0000-000000000001'` as input — it normalizes the sentinel to `NULL` before insert). All other write paths (`features/agent-context/service/hierarchyService.createProject`) delegate here.

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
└── components/
    ├── ProjectList.tsx
    ├── ProjectCard.tsx
    ├── CreateProjectModal.tsx
    ├── ProjectSettings.tsx    — Tabbed settings (General, Members, Invites, Danger)
    ├── ProjectSidebar.tsx
    ├── GeneralSettings.tsx
    ├── MemberManagement.tsx
    ├── InvitationManager.tsx
    └── DangerZone.tsx
```

## API Routes

- `POST /api/projects/invite` — Create invitation + send email
- `POST /api/projects/invitations/resend` — Resend invitation email

Both require authentication and project admin role (enforced by RLS).

## Key Hooks

```ts
useOrgProjects(organizationId)      // Projects in an org where user is a member
useUserProjects()                   // All user's projects across all orgs (incl. personal)
usePersonalProjects()               // Personal projects only (organization_id IS NULL)
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
| Create modal | `CreateProjectModal` | Dispatches invalidation. New `redirectOnSuccess` prop (default `true`) — set to `false` when embedded in a wizard so the user stays in place; the modal hands the new project to `onSuccess(project)` for inline auto-selection |
| Create sheet | `ProjectFormSheet` | Dispatches invalidation; redirects personal projects to `/projects/...` (no `/org/personal/...` route exists) |
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
