# FEATURE.md — Users & Access administration

**Status:** `stable`
**Tier:** `1`
**Last updated:** `2026-07-22`

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
- `features/admin/users/components/AccountsTableClient.tsx` — account table and user-focused organization deep links.
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

1. The Organizations tab lists every shared, personal, and system organization, including organizations with zero memberships.
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

- `2026-07-22` — Codex: added the reciprocal user ↔ organization admin directory, inline account membership visibility, guarded membership management, and audited super-admin database mutation path.
