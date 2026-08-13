# FEATURE.md — Users & Access administration

**Status:** `stable`
**Tier:** `1`
**Last updated:** `2026-07-23`

---

## Purpose

`/administration/users` is the super-admin control plane for accounts and the
access relationships around them. It brings the reciprocal user ↔ organization
views into the same route-tabbed hub as preferences, admin levels, invitations,
entitlements, usage, email, and announcements.

The organization surface is a projection over the canonical IAM model. It does
not own or duplicate organization or membership data.

---

## Entry points

- `app/(admin)/administration/users/layout.tsx` — shared tabbed shell; inherits the super-admin gate from the admin layout.
- `app/(admin)/administration/users/page.tsx` — complete account roster, including each user's active organization memberships.
- `app/(admin)/administration/users/organizations/page.tsx` — reciprocal organization/member directory and management surface.
- `features/admin/users/components/AccountsTableClient.tsx` — account table and user-focused organization deep links; reads `?user=<id>` to focus one account.
- `features/admin/users/components/AdminUserRef.tsx` — **THE door for a user.** The name links to the account; the chevron menu carries every per-user destination. Used by all 12 surfaces that name a user.
- `features/admin/users/components/OrganizationsAdminClient.tsx` — organization list, member list, user focus, and membership controls.
- `app/api/admin/users/route.ts` — server-only auth roster plus profile, admin-level, and organization projections.
- `app/api/admin/users/organizations/route.ts` — super-admin-only directory and membership mutation endpoint.
- `features/admin/users/server/organizationMembershipAdmin.ts` — shared server projection and audited mutation caller.

---

## Data model

- `iam.organizations` is the organization authority.
- `iam.memberships` is the membership authority. Organization memberships use `container_type='organization'`, `container_id=organization_id`, and roles `owner | admin | member`.
- `iam.organization_member` is the active, soft-delete-aware read view used by the admin projection because the base membership table is intentionally not exposed to the Data API.
- `iam.org_admin_audit` records super-admin membership mutations.
- `auth.users` and `users.profiles` supply account identity and display fields.

No new table or Redux slice is owned by this feature.

---

## Key flows

### User → organizations

1. The account roster loads the full auth roster and canonical organization directory on the server.
2. Each user row shows its organization names and count.
3. The Organizations action opens `/administration/users/organizations?user=<id>`.
4. The organization list narrows to that user's memberships while the selected organization still shows its complete member roster.

### Organization → users

1. The Organizations tab lists every shared, personal, and system organization, including organizations with zero memberships; each row carries the canonical 2–3 letter abbreviation from `iam.organizations`.
2. Selecting an organization shows every active member with role and join date.
3. A member action pivots back to every organization for that user.

### Manage membership

1. The API route verifies `requireSuperAdmin()` for every method.
2. The server calls `public.admin_manage_organization_membership` through the authenticated session so `auth.uid()` remains the acting administrator.
3. The database function validates the action and role, locks the organization's active memberships, protects the last owner, constrains personal-organization repair to restoring the creator or removing legacy extra members, performs canonical add/reactivate, role change, or soft removal, and writes `iam.org_admin_audit`.
4. The client reloads both reciprocal projections after success.

---

## Invariants & gotchas

- Never create an admin-only organization or membership table. Extend the canonical IAM projection.
- The browser never receives a secret key and never writes `iam.memberships` directly.
- Super-admin is verified at both the API boundary and the database mutation boundary.
- Personal organizations are visible but constrained to repair operations: restore the creator as owner or remove legacy extra members. `personal` means one individual's space, not a small shared organization.
- An organization cannot lose or demote its last owner.
- Removal is a soft delete. Re-adding the same user reactivates the canonical membership row.
- Account and organization screens link to the same Organizations tab; do not build separate per-user and per-organization membership managers.
- **A user is named through `AdminUserRef`, never a bare `<span>` or uuid.** There is still no canonical `/users/<id>` route and no `user` token in the entity registry, so `EntityRef` has nothing to resolve — `AdminUserRef` is the stand-in that declares the per-user destination set exactly once. Consume it; do not hand-roll a link list beside it. When a canonical user route exists, one edit there lights up every surface.
- **A door is only added after reading the target route and confirming it consumes the param.** Both `?user=` destinations added on 2026-08-09 were previously broken promises: Accounts read no param at all, and the Accounts row menu advertised an "Admin level" filter that `…/users/admins` silently ignored. A link to a route that ignores its param is worse than no link, because it looks like it worked.
- The name is a real anchor, not a click handler, so middle-click and cmd-click work. Where a user's name genuinely cannot be an anchor (inside a `<label>` or a button that means something else), render `AdminUserDoorControls` as a sibling instead — an anchor nested in interactive content is invalid DOM. All 12 call sites were verified clear on 2026-08-09.
- **Never put `href` on a `MatrxDataTable` column whose cell renders `AdminUserRef`.** A column declaring `href` makes the table wrap the whole cell in a `<Link>` (`MatrxDataTable.tsx`), which would nest the name's anchor inside another anchor. Every current user column renders its own cell and declares no `href`; that is deliberate, not an oversight. Row-click navigation is safe alongside it — the table already ignores clicks originating inside an `<a>`.

---

## Doctrine compliance

**Searches performed**

- Routes/components: `administration/users`, `OrganizationManagement`, `OrganizationList`, `OrganizationCard`.
- Data/services: `iam.organizations`, `iam.memberships`, `organization_member`, `membershipsService`, `mbr_*`, `org_admin_*`.
- Shared UI: `MatrxDataTable`, `SearchableSelect`, shared confirmation dialog, shadcn dialog/select/badge/button primitives.

**Primitives reused or extended**

- Extended the existing Users & Access tab shell and account roster.
- Reused `MatrxDataTable` for both reciprocal lists and `SearchableSelect` for existing-account lookup.
- Reused the canonical IAM organization/membership rows, active-membership view, soft-delete lifecycle, role vocabulary, and admin audit table.
- Introduced one narrowly scoped database function because existing `mbr_*` operations are organization-access scoped and cannot safely provide a global super-admin control plane.

---

## Change log

- `2026-08-13` — The Accounts roster is now agent-READABLE: `AccountsTableClient` mounts a `SurfaceRuntimeProvider` for `matrx-admin/users` and emits 20 surface values through the new builder `features/admin/users/lib/admin-users-scope.ts`. Two behavioural notes for anyone editing this file. **(1) `MatrxDataTable` is now in `controlled-local` mode** — search, column filters, sort and page live in `queryState` here, not inside the table (the table still does the filtering). That is what lets the page report how many accounts match the admin's live query; `visible_user_count` is computed by calling the table's own `filterAndSortRows`, so it cannot drift from what the table renders. Keep it that way rather than counting rows by hand. **(2) `getScope` must stay SYNCHRONOUS** — the Surface Context window polls it every 400ms while open, so a fetching emitter would hammer `/api/admin/users` behind an idle debug panel; every emitted value is a derivation over state this component has already rendered. Privacy posture is deliberate and documented in the manifest header: roster-wide values are counts only, `roster_sample` is capped at 10 and carries **no email addresses**, and only the account focused via `?user=` ships admin-relevant fields. **No agent write targets, by design** — admin level, magic links, password resets, email/DM sending and the onboarding toggle are all permissions / credentials / outbound communication and stay human; the ruling is argued in full in `admin-users.manifest.ts`.
- `2026-08-09` — No Dead Ends sweep: a named user is now reachable. Accounts and `…/users/admins` both honour `?user=<id>`, and `AdminUserRef` makes the name itself a link (Door #1) with "Account" and "Admin level" joining its menu. Closes FOUND_DEFECTS D138's most-hit symptom; a canonical `/users/<id>` route and a `user` registry token remain open.
- `2026-08-08` — Codex: made the shared Users & Access shell a deliberate two-row mobile header with an independently scrollable, touch-safe tab rail; added accessible navigation/back labels so child admin routes no longer inherit the prior title/tab overlap.
- `2026-07-23` — Codex: organization projections and the directory table now include the canonical compact abbreviation alongside name and slug.
- `2026-07-22` — Codex: added the reciprocal user ↔ organization admin directory, inline account membership visibility, guarded membership management, and audited super-admin database mutation path.
