# FEATURE.md — `organizations` + `invitations`

**Status:** `stable`
**Tier:** `2`
**Last updated:** `2026-05-13`

> Combined doc for `features/organizations/` and `features/invitations/`. Orgs are the multi-tenant primitive; invitations are the flow that admits users to orgs (and, in mirrored form, to projects). Architecture mirrors `features/projects/`.

---

## Purpose

Organizations are the top-level multi-tenant scope in the app — every user belongs to at least one (their personal org), and teams are additional orgs that bundle members, projects, tasks, and shared resources. Invitations are the email-based flow that brings a new user into an existing org or project.

---

## Entry points

**Routes** — all under `/organizations/` with a single `[orgId]` dynamic segment that accepts either UUID or slug
- `app/(authenticated)/organizations/page.tsx` — landing page listing all of the user's organizations
- `app/(authenticated)/organizations/[orgId]/page.tsx` — org overview (any authenticated member can view); `[orgId]` resolves via `getOrganizationBySlugOrId()`
- `app/(core)/organizations/[orgId]/org-2/page.tsx` — **reimagined org workspace (experimental, parallel to the overview).** Same data, reorganized around the knowledge-system model: a stats hero, the Context & Scopes plane (reuses `OrgHomeScopeSection`), a Knowledge-graph deep-link (`/knowledge-graph?org=<slug>`), Resources grouped by **content role** (Utilities / Sources / Outputs / Workspaces), a Contribute (share-your-own) sheet, and an admin Member-contributions moderation queue. Drives its resource grid + counts from the **org resource catalogue** (below), not a hardcoded list.
- `app/(authenticated)/organizations/[orgId]/{projects,tasks,notes,files,tables,workflows,shortcuts,templates,prompt-apps,prompts,agent-apps}/` — org-scoped resource views sharing `OrgResourceLayout.tsx`
- `app/(authenticated)/organizations/[orgId]/projects/[projectId]/` — project-scoped view within an org; `[projectId]` also accepts UUID or slug
- `app/(authenticated)/organizations/[orgId]/settings/page.tsx` — settings hub (members, invitations, general, scopes, danger zone)
- `app/(authenticated)/organizations/[orgId]/settings/scopes/` — scope config (see [`features/scopes/FEATURE.md`](../scopes/FEATURE.md))
- `app/(authenticated)/invitations/organization/accept/[token]/page.tsx` — accept org invitation
- `app/(authenticated)/invitations/project/accept/[token]/page.tsx` — accept project invitation

**Redirects** (in `next.config.js`)
- `/org/:orgId/**` → `/organizations/:orgId/**` (permanent) — old slug-only path
- `/org` → `/organizations` (permanent)

**Hooks** (`features/organizations/hooks.ts`)
- `useUserOrganizations()` — current user's orgs with role + member counts; sorted personal-first
- `useOrganization(orgId)` — single org by id
- `useOrganizationOperations()` — `create`, `update`, `remove`
- `useOrganizationMembers(orgId)` — members with user profile
- `useMemberOperations(orgId)` — `updateRole`, `remove`, `leave`
- `useUserRole(orgId)` — returns `{ role, isOwner, isAdmin, canManageMembers, canManageSettings, canDelete }`
- `useOrganizationInvitations(orgId)` — pending invitations for an org
- `useInvitationOperations(orgId)` — `invite`, `cancel`, `resend`
- `useUserInvitations()` — invitations addressed to the current user, with `accept(token)`
- `useSlugAvailability(slug, debounceMs)` — debounced uniqueness check

**Services**
- `features/organizations/service.ts` — full CRUD: orgs, members, invitations. Uses `supabase` client; invitation create/resend proxy to API routes (email needs server env)
- `features/organizations/userSearch.ts` — `searchUserByEmail()` via the `lookup_user_by_email` RPC (never reads `profiles.email` directly)
- `features/invitations/emailService.ts` — sends approval/rejection emails for the *invitation-request* admin flow (separate from org invitations; see Gotchas)

**Org workspace v2 — resources-by-role primitives** (powering the `org-2` route)
- `features/organizations/resource-catalogue.ts` — the curated catalogue mapping each scopeable entity to a **content role** (`utility | source | destination | container`), an icon/accent, its public table (for owned counts + contribute queries), its `shareKey` (= canonical table name stored in `permissions.resource_type`, accepted by the `share_resource_with_org` resolver), a title column, and an optional org sub-route. **Keys on the canonical table name, not the sharing `ResourceType` union** — the DB `shareable_resource_registry` (36 rows) is broader than the TS mirror (17), so the catalogue stays independent of which subset has been mirrored. When the DB registry grows a `content_role` / `is_scopeable` column, generate this from it. Helpers: `CONTENT_ROLES`, `entriesByRole`, `contributableEntries`, `getEntryByShareKey`.
- `features/organizations/hooks/useOrgResourceInventory.ts` — generic owned (`organization_id`) + shared (`permissions`) counts per catalogue entry; one grouped permissions query + one head-count per table. `null` = no count path (informational tile).
- `features/organizations/components/OrgResourceRoleSection.tsx` — one content-role bucket as a labelled grid of count tiles.
- `features/organizations/components/ContributeResourceSheet.tsx` — "share your own": pick a kind → search your items → `shareWithOrg`. Reads already-shared ids via `listOrgSharedIdsForTable`.
- `features/organizations/components/OrgShareReviewCard.tsx` — admin moderation queue for member contributions (approve/reject/restore), reads `listOrgShareGrants`, writes `reviewOrgShare`.
- `utils/permissions/orgModeration.ts` — `listOrgShareGrants`, `listOrgSharedIdsForTable`, `reviewOrgShare` (see `features/sharing/FEATURE.md` for the DB side).

**API endpoints**
- `POST /api/organizations/invite` — creates an `organization_invitations` row, generates token (crypto.randomUUID), sets 7-day expiry, sends email via Resend
- `POST /api/organizations/invitations/resend` — regenerates expiry and resends email
- `POST /api/projects/invite` — mirror for project-level invitations; writes to `ctx_project_invitations`
- `POST /api/projects/invitations/resend` — mirror for project resend
- `GET/PATCH /api/admin/invitation-requests[/id]` — admin triage of signup-access requests (separate "request an invite" flow, not org-member invites)

**Redux**
- No dedicated org slice. Active org is tracked in `lib/redux/slices/appContextSlice.ts` (`organization_id`, `organization_name`). All other org data is fetched per-hook via service calls — no cached Redux state.

---

## Data model

**Database tables** (Supabase)
- `organizations` — `id, name, slug (unique), description, logo_url, website, created_by, is_personal, settings, created_at, updated_at`. RLS: members can SELECT; owners/admins can UPDATE; only owners DELETE.
- `organization_members` — `id, organization_id, user_id, role, joined_at, invited_by`. Composite unique on `(organization_id, user_id)`.
- `organization_invitations` — `id, organization_id, email, token, role, invited_by, invited_at, expires_at, email_sent, email_sent_at`. Unique on `(organization_id, email)` — code `23505` maps to "already invited".
- `ctx_projects` — project rows, scoped by `organization_id`
- `ctx_project_members` — project membership
- `ctx_project_invitations` — project invitation tokens (same shape as `organization_invitations`, different FK)
- `admin.invitation_requests` — signup-access requests, admin-approved, triggers `features/invitations/emailService.ts`

**Key types** (`features/organizations/types.ts`)
- `OrgRole = 'owner' | 'admin' | 'member'` — three roles, no `viewer`
- `Organization`, `OrganizationWithRole` (adds `role`, `memberCount`)
- `OrganizationMember`, `OrganizationMemberWithUser`
- `OrganizationInvitation`, `OrganizationInvitationWithOrg`
- `CreateOrganizationOptions`, `UpdateOrganizationOptions`, `InviteMemberOptions`

**Permission helpers** (pure, in `types.ts`)
- `canManageMembers(role)` — true for `owner` | `admin`
- `canManageSettings(role)` — true for `owner` | `admin`
- `canDeleteOrg(role)` — true for `owner` only
- `isHigherRole(a, b)` — `owner(3) > admin(2) > member(1)`

---

## Key flows

### (a) Create an org — creator becomes owner

1. UI: `CreateOrgModal` collects name + slug. `validateOrgName`, `validateOrgSlug` run client-side; `useSlugAvailability` debounces server check.
2. `createOrganization()` in `service.ts`:
   - Validates + checks `isSlugAvailable(slug)`.
   - `requireUserId()` from `@/utils/auth/getUserId`.
   - `INSERT INTO organizations` with `is_personal: false`, `created_by: userId`.
   - `INSERT INTO organization_members` with `role: 'owner'`.
3. Returns `OrganizationResult`. Caller refreshes `useUserOrganizations`.

### (b) Invite a user by email

1. UI: `InvitationManager` → `useInvitationOperations(orgId).invite({ email, role })`.
2. Client `inviteToOrganization()` POSTs `/api/organizations/invite` (cannot call Resend from client — `RESEND_API_KEY` and `EMAIL_FROM` are server-only).
3. Server route (`app/api/organizations/invite/route.ts`):
   - Auth-checks the inviter.
   - `crypto.randomUUID()` → token.
   - `expires_at = now + 7 days`.
   - INSERTs `organization_invitations` (unique on `(org, email)` → `23505` = already invited).
   - Looks up org name + inviter display name.
   - `sendEmail()` with `emailTemplates.organizationInvitation(orgName, inviterName, url, expiresAt)` where url = `${SITE_URL}/invitations/organization/accept/${token}`.
   - On email success, updates `email_sent = true, email_sent_at = now`.
4. Recipient opens email → `/invitations/organization/accept/[token]`:
   - Fetches invitation by token, checks expiry client-side, verifies `invitation.email === user.email`, checks no existing membership.
   - On Accept → `acceptInvitation(token)` in `service.ts`: INSERTs `organization_members` with invitation's role + `invited_by`, then DELETEs the invitation row.
   - Redirects to `/organizations/{id}/settings`.

### (c) Invite to a specific project (distinct from org invitation)

- Use when the invitee needs project access but not broad org access (or is being added to a project in an org they already belong to).
- Flow mirrors (b) but hits `/api/projects/invite`, writes `ctx_project_invitations`, and the accept route is `/invitations/project/accept/[token]`.
- On accept, `acceptProjectInvitation()` (in `features/projects/service.ts`) INSERTs `ctx_project_members`. **Does not automatically add the user to the parent org** — org membership is a separate concern.
- Email template: `emailTemplates.projectInvitation(projectName, orgName, inviterName, url, expiresAt)`.

### (d) Role hierarchy — who can do what

| Action | owner | admin | member |
|---|:-:|:-:|:-:|
| View org + members | yes | yes | yes |
| Invite members | yes | yes | no |
| Cancel/resend invitations | yes | yes | no |
| Update other members' roles | yes | yes | no |
| Remove members | yes | yes | no |
| Edit org settings (name, logo, website) | yes | yes | no |
| Delete organization | yes | no | no |
| Transfer ownership | yes | no | no |
| Leave organization | yes (unless last owner) | yes | yes |

RLS enforces these at the database layer. Service functions (`updateMemberRole`, `removeMember`) use `.select()` after mutating and treat zero returned rows as "RLS blocked, not permitted" — they do NOT fail hard on RLS; they fail gracefully with `"You may not have permission..."`.

### (e) Switching active org in the UI

1. User clicks an org in sidebar / switcher (`OrgSidebar.tsx` or app-level switcher).
2. Dispatch `appContextSlice.setOrganization({ id, name })`.
3. **Slice resets all descendants on org change:** `scope_selections = {}`, `project_id = null`, `task_id = null`, `conversation_id = null`. A stale project from a previous org cannot leak across.
4. All downstream hooks (`useContextScope`, agent invocations via `call-api.ts`) read `appContext` for the new scope.
5. Route navigation is independent — switching the active context does not auto-navigate. URL-driven routes (`/organizations/[orgId]/...`) sync the OTHER direction: on route load, resolve `orgId` → call `setOrganization`.

### (f) Slugs in routes

- All org routes now live under `/organizations/[orgId]/` where `[orgId]` accepts **either a UUID or a slug**. Resolution is handled by `getOrganizationBySlugOrId(slugOrId)` in `service.ts` (UUID detected by regex; anything else is treated as a slug).
- Navigation links always use the canonical slug (e.g., `org.slug`) when one exists, so bookmark-friendly URLs are the norm.
- Project routes similarly use `[projectId]` accepting UUID or slug via a matching resolver inside the project page.
- `generateSlug(name)`: lowercase, `[^a-z0-9]+ → -`, trim leading/trailing hyphens.
- `validateOrgSlug`: 3–50 chars, `[a-z0-9-]` only.
- Rename semantics: `updateOrganization` does NOT accept `slug` in `UpdateOrganizationOptions` — slugs are effectively immutable post-creation. If slug change is needed, do it via direct SQL / admin flow.

---

## Invariants & gotchas

- **Slug is globally unique, URL-safe, and lowercase.** `isSlugAvailable()` runs before insert; DB also has a unique constraint. Slug is not in `UpdateOrganizationOptions` — treat as immutable.
- **Every org must have at least one owner.** `updateMemberRole` and `removeMember` block the last-owner case explicitly (pre-check + select-count of `role = 'owner'`). `leaveOrganization` just calls `removeMember(self)` so the same guard applies — a sole owner cannot leave their own org.
- **Personal orgs (`is_personal = true`) cannot be deleted.** `deleteOrganization` pre-checks and returns `error: 'Cannot delete personal organization'`. Every user gets a personal org at signup via the `on_auth_user_created` trigger on `auth.users`, which calls `public.create_personal_organization()`, which delegates to the idempotent `public.ensure_personal_organization(uuid)` RPC. The trigger does NOT block user creation on failure — failures land in `public.system_personal_org_failures` (super-admin readable) for detection + repair. The `ensure_personal_organization(uuid)` RPC is callable by `authenticated` and `service_role`; the frontend may call it defensively if a missing personal org is ever detected.
- **Invitation tokens are UUIDs, expire in 7 days.** Generated server-side via `crypto.randomUUID()`. Expiry is checked in the accept page (client-side date comparison) AND by a `.gt('expires_at', now)` filter in `getUserInvitations` / `acceptInvitation`.
- **Invitation uniqueness is per `(organization_id, email)`.** Re-inviting the same email returns `23505` → "User already invited". Use `resendInvitation` to bump the expiry instead.
- **Invitation email must match the authenticated user's email on accept.** `acceptInvitation` filters `.eq('email', getUserEmail())`. Case-insensitive compare in the accept page as well. A user signed in with a different email sees "This invitation is for X".
- **`/api/organizations/invite` and `/api/projects/invite` MUST run server-side.** `RESEND_API_KEY` and `EMAIL_FROM` are server env only. Do not try to send invitation emails from the client.
- **Accepting a project invitation does NOT add the user to the parent org.** Orgs and projects have independent membership tables. If the user is not in the org, they may or may not be able to use the project depending on RLS — verify with `features/scopes/FEATURE.md` before assuming access.
- **`features/invitations/emailService.ts` is a different flow.** It handles the "request access to sign up" admin approval/rejection emails (see `/api/admin/invitation-requests`), not org-member invitations. Do not wire it into org flows.
- **`organization_members` updates/deletes silently succeed with 0 rows when RLS blocks.** Service layer compensates by requiring `.select()` + row-count check. Any new mutation against `organization_members` must follow this pattern or it will report false success.
- **No Redux cache for org data.** Each hook refetches from Supabase. `refresh()` is exposed on every list hook — call it after any mutation (the operation hooks in `hooks.ts` already do this internally; external callers of `service.ts` directly must do it themselves).
- **`lookup_user_by_email` is an RPC, not a table read.** Never query `profiles.email` directly — email lives in `auth.users` which is not directly selectable from the client.

---

## Related features

- **Depends on:** `lib/redux/slices/appContextSlice.ts` (active org state), `features/email/` + `lib/email/client.ts` (Resend integration + templates), `@/utils/auth/getUserId` (user id/email helpers), `@/utils/supabase/{client,server}`
- **Depended on by:** `features/projects/` (project FKs `organization_id`), `features/scope-system/`, `features/tasks/`, `features/sharing/`, `features/agents/` (agent ownership + multi-scope), every `/organizations/[orgId]/**` route
- **Cross-links:**
  - [`features/scopes/FEATURE.md`](../scopes/FEATURE.md) — scopes sit between org and project in the hierarchy
  - [`features/sharing/FEATURE.md`](../sharing/FEATURE.md) — cross-org/user/project sharing of resources
  - [`features/projects/README.md`](../projects/README.md) — projects mirror this architecture
  - [`features/agents/FEATURE.md`](../agents/FEATURE.md) — agents are org-scoped; shortcuts/apps are multi-scope

---

## Current work / migration state

Stable. No active migration. If org or project invitation flows evolve, keep `/api/organizations/invite` and `/api/projects/invite` in lockstep — they are deliberately parallel and diverging them will create surprising behavior.

---

## Change log

- `2026-06-06` — Added the **reimagined org workspace** at `app/(core)/organizations/[orgId]/org-2/page.tsx` (experimental, parallel to the existing overview). It reorganizes the org around the knowledge-system model: stats hero, Context & Scopes plane, a `/knowledge-graph?org=<slug>` deep-link, **Resources grouped by content role** (Utilities / Sources / Outputs / Workspaces), a Contribute (share-your-own) sheet, and an admin Member-contributions moderation queue. New platform primitives: `resource-catalogue.ts` (entity → content-role catalogue, keyed on canonical table names so it's independent of the partial TS shareable-registry mirror), `hooks/useOrgResourceInventory.ts` (generic owned+shared counts), `components/OrgResourceRoleSection.tsx`, `components/ContributeResourceSheet.tsx`, `components/OrgShareReviewCard.tsx`, and `utils/permissions/orgModeration.ts`. DB side: org-share moderation columns + `review_org_share` RPC on `permissions` (see `features/sharing/FEATURE.md`). Also made `/knowledge-graph` accept `?org=<slug|id>` (resolves slug→id, falls back to active context). **Follow-ups to discuss:** entities with no dedicated org sub-route (skills, conversations, flashcards, quizzes, canvases, transcripts, lists, workbooks, websites) currently tile as informational + feed Contribute — they need real org list routes; add `content_role` / `is_scopeable` to `shareable_resource_registry` and generate the catalogue from it; optional org-level "require approval before a contribution is visible" preference (the `pending` status already exists in the DB).
- `2026-05-27` — Fixed silent personal-org provisioning failures. Audit found 9 users (out of 70) with no personal org, spanning Oct 2024 → May 2026. Root causes: (a) the trigger predates the earliest affected users and didn't exist for them; (b) the function silently swallowed every failure via an outer `EXCEPTION WHEN OTHERS`; (c) for anonymous Supabase users (`email IS NULL`), `LENGTH(SPLIT_PART(NULL, '@', 1)) < 3` evaluates to NULL, not TRUE, so the username fallback never ran and the slug ended up NULL, violating the NOT NULL check. Migration `fix_create_personal_organization_null_email_and_audit` (1) extracted the work into an idempotent `public.ensure_personal_organization(uuid)` RPC with robust NULL-handling and a UUID-suffix slug fallback that cannot structurally collide; (2) rewrote the trigger to delegate to it and capture failures in a new `public.system_personal_org_failures` audit table instead of swallowing them; (3) backfilled the 9 orphaned users. Follow-up migration `lock_down_personal_org_functions` revoked EXECUTE from anon/PUBLIC on both functions (kept `authenticated` + `service_role` on `ensure_personal_organization` so the frontend can self-heal if needed). All 70 users now have exactly one personal org each.
- `2026-04-25` — Removed use of the `features/organizations/index.ts` barrel: imports now target `hooks.ts`, `service.ts`, `types.ts`, and concrete files under `components/` (keeps re-export file for any stragglers; no API change).
- `2026-04-22` — claude: initial combined doc for organizations + invitations.
- `2026-05-06` — Organization logo upload now opts into the official image uploader's shared image-panel preview action in both create and general-settings edit flows.
- `2026-05-13` — Unified route refactor: merged `/org/[slug]/**` and `/organizations/[id]/**` into a single `/organizations/[orgId]/**` tree that accepts both UUID and slug. Added `/organizations/page.tsx` landing page. Deleted old `/org/` and `/organizations/[id]/` route trees. Added permanent Next.js redirects from old paths. Updated `service.ts` with `getOrganizationBySlugOrId()`. All project feature components (`ProjectCard`, `ProjectFormSheet`, `CreateProjectModal`, `DangerZone`, `ProjectSidebar`) updated to build links under `/organizations/`.
- `2026-05-13` — Consolidated all invitation accept pages under one namespace. Moved `/invitations/accept/[token]` → `/invitations/organization/accept/[token]` and `/project-invitations/accept/[token]` → `/invitations/project/accept/[token]`. Future resource invitations (notes, agents, etc.) plug in as `/invitations/<type>/accept/[token]`. Updated all email URL builders (`utils/email/emailService.ts`, `app/api/organizations/invite`, `app/api/organizations/invitations/resend`, `app/api/projects/invite`, `app/api/projects/invitations/resend`), the in-app copy-link button in `features/organizations/components/InvitationManager.tsx`, and the post-login redirect targets in both accept pages.
- `2026-05-13` — General settings save: apply `updateOrganization`’s returned row via `onOrganizationUpdated` + `OrgSettings` `displayOrganization` state so view mode updates immediately; `OrgSettingsLayoutProvider` + `invalidateAndRefetchFullContext()` keep the settings shell header and hierarchy consumers in sync without a full page reload.
- `2026-06-03` — Per-org auto-ingest toggle (Step 3.1 of the KG activation plan). New `OrgPrivacyTab` mounted in `OrgSettings.tsx` between Scopes and Invites, gated by the existing `canManageSettings` rule. Reads / writes `organization_preferences` Supabase-direct via the new `features/organizations/hooks/useOrgAutoRagPreference.ts` (mirrors `features/kg-suggestions/hooks/useAutoRagPreference` but keyed on `organization_id`). Surfaces the auto-rag switch, an inline editable daily budget, and a live "today's usage" progress bar with a 24h-window reset hint.

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change to org membership, role rules, invitation tokens/expiry, or the `appContextSlice` integration, update this file and append to the Change log. The invitation flow spans client service, API route, email template, and accept page — changes that touch one almost always need to touch the others, and this doc is the single place that ties them together.
