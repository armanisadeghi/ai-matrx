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
- `app/(core)/organizations/page.tsx` — the **launcher**: rich cards for the personal workspace + team orgs (logo, role accent, members, created), search, create. The parent surface to the workspace; matches the OrgWorkspace aesthetic.
- `app/(authenticated)/organizations/[orgId]/page.tsx` — org overview (any authenticated member can view); `[orgId]` resolves via `getOrganizationBySlugOrId()`
- `app/(core)/organizations/[orgId]/org-2/page.tsx` — **reimagined org workspace (experimental, parallel to the overview).** Same data, reorganized around the knowledge-system model: a stats hero, the Context & Scopes plane (reuses `OrgHomeScopeSection`), a Knowledge-graph deep-link (`/knowledge-graph?org=<slug>`), Resources grouped by **content role** (Utilities / Sources / Outputs / Workspaces), a Contribute (share-your-own) sheet, and an admin Member-contributions moderation queue. Drives its resource grid + counts from the **org resource catalogue** (below), not a hardcoded list.
- `app/(core)/organizations/[orgId]/resources/[kind]/page.tsx` — **catalogue-driven per-resource org page.** One page for every scopeable kind (`kind` = catalogue key), reached from the workspace tiles. Two halves: "Shared with {org}" (team view — org-owned + member-contributed) and "Yours to share" (your own items, one click from sharing). Renders `OrgResourceDetail`; links to the dedicated legacy route as "Full view" when one exists.
- `app/(authenticated)/organizations/[orgId]/{projects,tasks,notes,files,tables,workflows,shortcuts,templates,prompt-apps,prompts,agent-apps}/` — org-scoped resource views sharing `OrgResourceLayout.tsx`
- `app/(authenticated)/organizations/[orgId]/projects/[projectId]/` — project-scoped view within an org; `[projectId]` also accepts UUID or slug
- `app/(authenticated)/organizations/[orgId]/settings/page.tsx` — the **Manage** experience. Renders `OrgManage` — a single scrollable, sectioned page (identity header + sticky jump-nav, **no tabs**) that reuses the existing settings sub-components (General, Members, Invitations, Scopes link, Privacy, Email, Danger). Replaced the old tabbed `OrgSettings` (deleted).
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
- `features/organizations/resource-catalogue.ts` — **DEPRECATED for display/association** (banner in-file). The canonical token→presentation/query resolver is now `features/scopes/registry/entityRegistry.ts` (`getEntityInfo`), generated from `platform.entity_types` and used by the association cards. This catalogue drifted (e.g. bare `public.workflow`, `agent_app` vs canonical `app`) — read display/query metadata from `getEntityInfo` instead. It survives ONLY for the `iam.permissions` sharing surface (`shareKey`, `contributableEntries`, `getEntryByShareKey`, `moduleKey`, `CONTENT_ROLES`), still consumed by `/resources/[kind]`, the Contribute sheet, and `OrgShareReviewCard`. Delete it when that sharing UI migrates.
- `features/organizations/hooks/useOrgResourceInventory.ts` — generic owned (`organization_id`) + shared (`permissions`) counts per catalogue entry. **Retired from the org home** (replaced by `useContainerLinks` over `platform.associations`); still used by the per-kind `/resources/[kind]` detail surface pending migration.
- `features/organizations/components/OrgResourceRoleSection.tsx` — one content-role bucket as a labelled grid of count tiles. **No longer used by `OrgWorkspace`** (the card grid replaced it); remaining consumers tracked in the canonical-associations `WORK-QUEUE.md`.
- `features/organizations/components/ContributeResourceSheet.tsx` — "share your own": pick a kind → search your items → `shareWithOrg`. Reads already-shared ids via `listOrgSharedIdsForTable`.
- `features/organizations/components/OrgShareReviewCard.tsx` — admin moderation queue for member contributions (approve/reject/restore), reads `listOrgShareGrants`, writes `reviewOrgShare`. Title hydration resolves each grant's `permissions.resource_type` through the schema-qualified `getShareableResource()` (e.g. `agent` → `agent.definition`), not a bare `.from("agent")` that 404s on `public.agent`. This is the **access-control** surface — distinct from the `platform.associations` resource cards above.
- `features/organizations/components/OrgWorkspace.tsx` — the workspace body, rendered by the primary `/organizations/[orgId]` page (and the `/org-2` alias). **Its "Resources" section is now the canonical `AssociationCardGrid`** (`features/scopes/components/associations/`) over `platform.associations` — one card per cardable entity token, wrapped in a `PrimaryEntityProvider` for the org. This replaced the old catalogue/permissions count grid (`useOrgResourceInventory` + `OrgResourceRoleSection`), which is retired here. The "resources" hero stat is now the org's total incoming-edge count (`useContainerLinks().totalCount`).
- `features/organizations/components/OrgResourceDetail.tsx` — the per-resource page body (team view + your-own).
- `features/organizations/components/OrgManage.tsx` — the single-page Manage shell (replaced tabbed `OrgSettings`); identity header + sticky jump-nav + sections. Owns its single scroll container (the settings layout is now a passthrough provider — see `OrgSettingsLayoutClient`).
- `features/organizations/components/OrgScopeTree.tsx` — read-only scope-type→scope tree (no items) for the Manage Scopes section, with edit links.
- `features/organizations/components/OrgModuleSettings.tsx` — **live** per-module org-rule matrix (members-can-add, needs-approval, scopeable, auto-ingest, default access). Loads/saves via `features/organizations/orgModuleSettings.ts` → `org_module_settings` (admin-gated `set_org_module_setting` RPC). Members-can-add + needs-approval are enforced server-side in `share_resource_with_org`; the rest are saved for upcoming enforcement.
- `features/industries/components/OrgIndustriesSection.tsx` (rendered in `OrgManage.tsx`) — manage the org's **industry** memberships (`public.org_industries`). Industry is a platform taxonomy that gates [Shared Knowledge Resources](../rag/FEATURE.md#shared-knowledge-resources) and (later) seeds scope templates; super-admin edits via the `industry_assign_org` / `industry_unassign_org` RPCs, members see read-only. See [`features/industries/FEATURE.md`](../industries/FEATURE.md).
- `components/ui/context-menu.tsx` — radix right-click menu primitive (added for resource rows; reusable app-wide).
- `features/organizations/peek/` — pluggable **resource Peek** system. `PeekProps` contract, shared `PeekDialog`/`PeekField` shell, a lazy `registry` (catalogue key → peek component), and `ResourcePeekHost`. Add a kind by dropping `kinds/<Kind>Peek.tsx` (default export, `PeekProps`) + one registry line; unregistered kinds show "Peek — coming soon". Live for: agent (adapter over `AgentSneakPeekModal`), file, note, agent_app, skill, workflow, content_template, conversation, flashcard, canvas, task, dataset, transcript.
- `features/organizations/hooks/useOrgContributableItems.ts` — your-own items + one-call `share` (shared by the Contribute sheet and the resource page).
- `features/organizations/hooks/useOrgSharedItems.ts` — team view (org-owned + member-contributed) for one kind.
- `utils/permissions/orgModeration.ts` — `listOrgShareGrants`, `listOrgSharedIdsForTable`, `reviewOrgShare` (see `features/sharing/FEATURE.md` for the DB side).

**API endpoints**
- `POST /api/organizations/invite` — creates an `organization_invitations` row, generates token (crypto.randomUUID), sets 7-day expiry, sends email via Resend
- `POST /api/organizations/invitations/resend` — regenerates expiry and resends email
- `POST /api/projects/invite` — mirror for project-level invitations; writes to `ctx_project_invitations`
- `POST /api/projects/invitations/resend` — mirror for project resend
- `GET/PATCH /api/admin/invitation-requests[/id]` — admin triage of signup-access requests (separate "request an invite" flow, not org-member invites)

**Redux**
- No dedicated org slice. Active org is tracked in `lib/redux/slices/appContextSlice.ts` (`organization_id`, `organization_name`). All other org data is fetched per-hook via service calls — no cached Redux state.
- **Active-org enforcement (soft).** `appContextSlice` also holds `personal_organization_id` (the user's `is_personal` org, set once at hydration; never reset by `setOrganization`) and `orgBootstrapResolved` (true once bootstrap finishes). Selectors: `selectEffectiveOrganizationId` (= explicit org ?? personal — read by the API/scope layer so every request carries a valid org), `selectHasExplicitOrganization`, and `selectShouldPromptForOrganization` (= resolved **and** no org — the single gate for every "no org" UI cue, so none flash during boot). The **default org is the single durable source of truth** for cross-session restore: stored in user preferences (`organization.defaultOrganizationId`, synced to `user_preferences`) and accessed via `features/organizations/hooks/useDefaultOrganization.ts`. There is **no `localStorage` last-org mechanism.** Bootstrap + the sanctioned switcher live in `lib/redux/thunks/activeOrgBootstrap.ts`: `bootstrapActiveOrganization()` (dispatched once by the `features/shell/components/ActiveOrgBootstrap.tsx` island in `AppShell`, the live core/admin shell) reads the default **straight from the `user_preferences` row** — authoritative, no race with the client preferences sync — and resolves the active org by precedence: **default org → only org (auto-selected, no nudge) → null (nudge)**, then marks bootstrap resolved; `chooseActiveOrganization` is the Surface-A switcher write. UI: the in-menu switcher (`UserMenuOrgSection.tsx`) is always available, with a "Set as default" switch + Default-star badges; `HeaderOrgReminder.tsx` drops a one-time peek under the header while none is chosen (auto-dismiss + click-to-dismiss, opens the picker); the avatar (`UserMenuTrigger`) rings red while `selectShouldPromptForOrganization`. Canonical reusable pieces: `features/organizations/components/{OrganizationPickerPanel,DefaultOrgSwitch}.tsx`.

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

### Module-rule enforcement — status & remaining wiring

Per-module rules live in `org_module_settings` (set in Manage → Modules). Enforcement status:

| Rule | Status | Where enforced |
|---|---|---|
| `members_can_add` | **Live** | `share_resource_with_org` blocks non-admin members |
| `requires_approval` | **Live** | `share_resource_with_org` → grant `status = 'pending'`; surfaced in `OrgShareReviewCard` (Approve/Reject) |
| `default_permission` | **Live** | `share_resource_with_org` uses it when the caller omits the level (the Contribute flow does); pickers still pass explicit levels |
| `is_scopeable` | **Live (FE)** | `EntityScopeTagger` (Surface B write mode) blocks tagging a kind when off — disabled note + guarded `applyNext`. It's a governance preference (not access control), so a UI gate is the boundary; harden server-side in the assignment thunk if ever needed. |
| `auto_ingest` | **Live (backend)** | aidream `aidream/services/auto_ingest/router.py` `_module_auto_ingest_enabled` skips ingestion when off. Default ON (missing org/kind/row → enabled). |

**`is_scopeable` integration** (done): `EntityScopeTagger` calls `getOrgModuleSetting(orgId, moduleKey(getEntry(entityType)))` and checks `.isScopeable`. Controlled (filter) mode and unknown kinds (`agent_surface_binding`, `project_resource`) are never gated.

**`auto_ingest` mapping caveat** (small follow-up): the aidream gate resolves the router's `source_kind` → canonical table via `ShareableResourceRegistry`, then matches `org_module_settings.module_key`. It is fully functional for kinds whose `source_kind` maps cleanly (e.g. `note → notes`, `task → ctx_tasks`); aidream-internal source kinds (`cld_file`, `code_file`, `library_doc`, `scraped`, `repository`, `cx_message`, `project`, `transcript` (singular vs `transcripts`)) currently fall through to default-ON because their `source_kind` doesn't resolve to a registered `module_key`. Unify by registering/aliasing those source kinds in `shareable_resource_registry` (or extend the resolver) — benign until then (no incorrect skips).

---

## Change log

- `2026-06-27` — **Memberships RPC bridge reconciled onto the canonical Part-0a surface (`migrations/mbr_public_rpcs.sql`, ledgered).** The pre-existing `mbr_*` family was extended ADDITIVELY (no consumer breakage): `mbr_list` now returns a SUPERSET (adds `updated_at`, `metadata`; keeps `created_by`); NEW `mbr_list_for_user(p_user_id uuid, p_container_type text default null)` (explicit user, distinct from auth.uid()-only `mbr_for_user`); `mbr_add` upgraded to the canonical signature `(p_container_type, p_container_id, p_user_id, p_organization_id, p_role default 'member', p_status default 'active', p_metadata default '{}')` — `organization_id` (not `org_id`) required + verified via `iam.has_org_access`, idempotent on the existing `UNIQUE (container_type, container_id, user_id)` constraint (on-conflict undeletes + updates role/status/metadata); `mbr_set_role` renamed to canonical **`mbr_update_role`**; `mbr_remove` soft-deletes. `mbr_for_user`/`mbr_count`/`mbr_list_with_users` preserved untouched. All PUBLIC SECURITY-DEFINER, org-gated, `revoke from public` + `grant to authenticated`. `membershipsService.ts` gained `listForUser` + `updateRole` (with `setRole` now a thin alias) and the richer `add({ organizationId, metadata })`; `Membership` type gained `updatedAt` + `metadata`. Sole `add` consumer (`projects/service.ts`) updated `orgId` → `organizationId`. Applied via MCP + verified live in `pg_proc`; `pnpm db-types` regenerated; tsc + eslint clean.
- `2026-06-27` — **Canonical session-cached personal-org resolver (`current_personal_org_id`).** New DB RPC `public.current_personal_org_id()` (no-arg, SECURITY DEFINER, resolves `auth.uid()`'s auto-provisioned personal org) is now the single source for the never-null org fallback. New primitive `lib/organizations/personalOrg.ts` — `resolvePersonalOrgId()` (module-cached, ≤1 RPC/session), `ensureOrgId(orgId)` (`orgId ?? personal`), `primePersonalOrgId()`/`peekPersonalOrgId()`/`clearPersonalOrgIdCache()`. The active-org bootstrap (`activeOrgBootstrap.ts`) now fetches the personal org via this RPC (authoritative — replaces the `orgs.find(isPersonal) ?? orgs[0]` heuristic) and **primes the cache**, so downstream service callsites resolve a null org with zero extra round-trips. Cache lifetime = tab page lifetime; sign-out's full `window.location.href` nav drops it. **Closed null-org insert bugs** in `taskService.createTask` and `codeFilesService.createCodeFile`/`createCodeFolder` (were writing `organization_id: null`). **Converged** the scattered per-call `ensure_personal_organization(p_user_id)` resolvers onto the cached primitive: `projects/service.ts`, `tasks/services/projectService.ts`, `projects/importJson.ts`, `notes/service/notesService.ts` (createNote stays non-blocking + homeless-backfill), `podcasts/studio/runs/service.ts`, `war-room/service.ts`, `war-room/service/associations.ts` (still prefers the container's own org). **Intentionally NOT converted:** `lib/scheduler-client/claim.ts` — it resolves the org for an ARBITRARY task owner, not `auth.uid()`, so it keeps the parameterized RPC. Rule going forward: never insert an org-scoped row with a null `organization_id` — use `ensureOrgId`. RPC verified live over PostgREST (public profile, 200); tsc + eslint clean.
- `2026-06-26` — **Default-org preference + drop-down reminder (replaces the header pill + localStorage).** The active org now restores cross-session from a durable **`organization.defaultOrganizationId`** user preference (synced to `user_preferences`), accessed via the canonical `features/organizations/hooks/useDefaultOrganization.ts`. **Removed** the `localStorage:matrx:lastOrg` mechanism (`readLastOrg`/`writeLastOrg`/`LAST_ORG_STORAGE_KEY` + the `StoreProvider` org subscription) and the conflicting header pill `HeaderOrgIndicator.tsx`. `appContextSlice` gained `orgBootstrapResolved` + `setOrgBootstrapResolved` and `selectShouldPromptForOrganization` (= resolved and no org) — the single gate that stops the red avatar ring / reminder from flashing during boot. **Fixed: the bootstrap was never running** — its only dispatcher (`DeferredShellData`) is orphaned in the live core/admin shell; a new `features/shell/components/ActiveOrgBootstrap.tsx` island mounted in `AppShell` now triggers it. `bootstrapActiveOrganization()` reads the default authoritatively from the `user_preferences` row (no race with preferences sync) and resolves by precedence **default → only-org auto-select → nudge**, clearing a stale default if the user left that org. New UI: `features/shell/components/header/header-right-menu/HeaderOrgReminder.tsx` (one-time peek under the header, `motion/react` drop-in mirroring `ImageArrivalPeek`, auto-dismiss + click-to-dismiss) opening the canonical `features/organizations/components/OrganizationPickerPanel.tsx` (org list + `DefaultOrgSwitch.tsx`); `UserMenuOrgSection.tsx` gained the same default switch + Default-star badges. No DB migration — the preference rides the existing `user_preferences` JSONB.
- `2026-06-29` — **Org "Resources" cut over to the canonical association cards.** `OrgWorkspace`'s Resources section now renders `AssociationCardGrid` (one card per cardable entity token, over `platform.associations`) inside a `PrimaryEntityProvider`, replacing the permissions/`container_resource_counts` count grid — `useOrgResourceInventory` + `OrgResourceRoleSection` are retired from the org home (still used by `/resources/[kind]` pending migration). The hero "resources" stat is the org's total incoming-edge count. `resource-catalogue.ts` is **deprecated for display/association** (the canonical resolver is `features/scopes/registry/entityRegistry.ts#getEntityInfo`); it survives only for the `iam.permissions` sharing surface. `OrgShareReviewCard` title hydration now resolves `permissions.resource_type` through the schema-qualified `getShareableResource()` (fixes the `public.agent` PGRST205) and remains the access-control moderation surface — distinct from the association cards. See `features/scopes/FEATURE.md` (§Association cards) and the `.claude/skills/canonical-associations` playbook.
- `2026-06-25` — **Active-org soft enforcement (UI + API).** Step one of the shift from user-id-centric to org-id-centric. `appContextSlice` gained `personal_organization_id` + `setPersonalOrganization` (non-resetting), `selectEffectiveOrganizationId` (explicit ?? personal) and `selectHasExplicitOrganization`. New `lib/redux/thunks/activeOrgBootstrap.ts`: `bootstrapActiveOrganization()` (loads orgs, records the personal org, restores the last-used org from `localStorage` if still a member — does NOT auto-select, so the "no org" nudge shows) and `chooseActiveOrganization()` (Surface-A-compliant switcher write). `DeferredShellData` dispatches the bootstrap after auth resolves; `StoreProvider` persists `organization_id` to `localStorage:matrx:lastOrg` on every change (mirrors the theme-cookie lockstep). Header now shows the active org via `HeaderOrgIndicator` (switcher popover, red when none) and rings the avatar red when no org is explicitly selected. API auto-attach: `call-api.ts#resolveScope` and both agent execute thunks now read `selectEffectiveOrganizationId`, so the personal org rides along whenever none is chosen. Persisted client-side for now; a cross-device `last_organization_id` column is the natural hardening step. No DB migration.
- `2026-06-25` — **Canonical-DB cutover (projects vertical): membership + invitations.** Introduced two new sole-chokepoint services, mirroring `associationsService` 1:1 (`"use client"`, `requireUserId()`, `ScopesRpcResult` + never-throw, snake_case→camelCase mappers): `features/organizations/service/membershipsService.ts` (the only caller of the `mbr_*` RPCs over `iam.memberships` — `listForContainer`/`listWithUsers`/`forUser`/`counts`/`add`/`setRole`/`remove`) and `features/organizations/service/invitationsService.ts` (the only caller of the `inv_*` RPCs over `iam.invitations` — `listForTarget`/`getByToken`/`forMe`/`create`/`accept`/`revoke`/`resend`). `inv_accept` is atomic in the DB (creates the membership AND marks the invite accepted). Migrated `features/projects/service.ts` (members + invitations), `features/tasks/services/projectService.ts`, the accept page, and `ProjectReferencesPanel` off the legacy junction tables; `createProject` now writes the owner membership explicitly via `membershipsService.add` (the legacy creator-membership trigger no longer mirrors to `iam.memberships`). The two project invite API routes are now **email-only** — the row is created/refreshed client-side via `inv_create`/`inv_resend`, the route just sends the email (no invitation-table access). Container/target type = `'project'`. Consumers use `isScopesRpcErr` for narrowing (repo runs `strictNullChecks:false`).
- `2026-06-07` — **Members + Invitations are now ONE shared system.** Extracted the battle-tested org members/invitations UI into data-agnostic presentational components under `components/membership/` (`MembersPanel`, `InvitationsPanel`, `types.ts`). `features/organizations/components/MemberManagement.tsx` and `InvitationManager.tsx` are now thin wrappers: they fetch with the org hooks and supply org role rules (only owners grant owner; admins manage members only; personal orgs read-only with the purple notice as `footerNotice`) + the org accept-URL + `useUserConnections` contacts for quick-select. The project wrappers (`features/projects/components/{MemberManagement,InvitationManager}.tsx`) consume the same panels with project rules (no owner grant, project accept-URL, no contact source). Quick-action DM/email (messaging slice + `EmailComposeSheet`) and `UserIdentity` live inside `MembersPanel`, shared by both. The four wrapper signatures are unchanged so `OrgManage`/`ProjectManage` need no edits. Verified live on the org members page (`/organizations/titanium/settings?tab=members`) and project settings — both render identically to before; tsc + eslint clean.
- `2026-06-06` — **Shell nav: "My Orgs".** Added `/organizations` to `primaryNavItems` in `features/shell/constants/nav-data.ts` (label "My Orgs", `Building2` icon, dock order 3 — directly below Chat). Propagates to sidebar, mobile dock, mobile sheet, profile menu, dashboard grid, and legacy `appSidebarLinks`. Active-state CSS + favicon route entry included; guests hidden (`guestHidden: true`).
- `2026-06-06` — **Round 5: peek fan-out complete + default_permission enforcement.** 19/21 catalogue kinds now have a live Peek (added shortcut/list/workbook/quiz/sandbox/project; research + website remain). `share_resource_with_org` now resolves the grant level from the org module's `default_permission` when the caller omits it (the Contribute flow omits it; ShareModal/ShareNoteDialog still pass explicit levels). Added `getOrgModuleSetting(orgId, moduleKey)` as the single-key integration point for the remaining `is_scopeable` enforcement (scopes pickers). Documented `is_scopeable` + `auto_ingest` remaining wiring above.
- `2026-06-06` — **Round 4: bug fix + launcher cards + DB-backed module settings + Peek.** (1) Fixed the context-menu Root (orphaned Trigger) → resource pages work for all kinds. (2) Launcher cards rebuilt large, with org stats + embedded Context scope tree. (3) **Module settings are live** — DB-backed `org_module_settings` (members-can-add + needs-approval enforced in `share_resource_with_org`; pending shares surface in the moderation card with Approve/Reject); `shareable_resource_registry` gained `content_role` + `is_scopeable`. (4) Pluggable **Peek** system (`features/organizations/peek/`) with 13 live kinds (3 hand-built examples + 10 fanned out to subagents). All typecheck-clean; agent/file/note/conversation peeks verified live.
- `2026-06-06` — **Round 3: launcher + sharing UX + Manage depth.** (1) Rebuilt `/organizations` as a polished launcher (rich role-accented cards, search, stats) — the parent to the workspace. (2) Resource catalogue: added the **dual-role** "Sources & Outputs" bucket (Notes, Datasets, Workbooks) and `hideRowIcon` (drops the repetitive agent glyph in list rows). (3) Manage: fixed the dual-scroll (settings layout → passthrough; `OrgManage` owns one scroller), deleted the redundant org-switcher sidebar (`OrgSidebar`), added an inline **scope tree** (`OrgScopeTree`) and a per-module **settings matrix** (`OrgModuleSettings`, placeholder/tasklist). (4) Resource detail sharing UX: who-shared avatars, open-in-new-tab, right-click **context menu** (Open / New tab / Peek / Share|Unshare) via new `components/ui/context-menu.tsx`, agent **Peek** (`AgentSneakPeekModal`) + "coming soon" for other kinds; `useOrgSharedItems` carries `sharedBy`/`permissionId`; `orgModeration` adds `revokeOrgShare` + `listOrgSharedIdsForTable`. *Note: verified via typecheck + design render; full data-populated verification pending a dev-server restart (a local env issue left client-side supabase fetches stalled app-wide during the session).*
- `2026-06-06` — **Promoted the workspace to the primary org page**, added per-resource pages, and redesigned Manage. (1) `/organizations/[orgId]` now renders `OrgWorkspace` (extracted shared component); `/org-2` kept as a thin alias. (2) New catalogue-driven `/organizations/[orgId]/resources/[kind]` page (`OrgResourceDetail`) with a "Shared with org" team view + a "Yours to share" one-click panel — every scopeable kind now has a consistent org page; workspace tiles route here. Extracted `useOrgContributableItems` + `useOrgSharedItems`; `ContributeResourceSheet` reuses the shared hook. (3) Replaced the tabbed `OrgSettings` with `OrgManage` — a single scrollable, sectioned Manage page (identity header + sticky jump-nav, no tabs) reusing all existing settings sub-components; deleted `OrgSettings.tsx`.
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
