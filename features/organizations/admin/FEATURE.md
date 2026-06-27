# FEATURE.md — `organizations/admin` (Org-admin user management)

**Status:** `beta`
**Tier:** `2` (sub-feature of `organizations`)
**Last updated:** `2026-06-27`

> The org-admin console: an org owner/admin manages the org's **users** — roster, usage, budgets, tiers, suspend, invite, remove, and resource reassignment. Lives under `features/organizations/admin/`; routes under `/organizations/[orgId]/admin`. Parent: [`../FEATURE.md`](../FEATURE.md).

---

## Purpose

Matrx is membership-first (a user joins many orgs), but enterprises onboard an org and manage its people. This is that surface. It does **everything an enterprise org admin expects**: see every member, who's active vs dormant, file usage, spend; set per-member budgets / storage caps / tiers; suspend / remove; invite; and **reassign a departing user's org-scoped resources** to someone else.

**Multi-org invariant (load-bearing):** a user belongs to many orgs, so admin power is **scoped to this org only**. Metrics, controls, and reassignment never reach the user's personal-org resources or another org's data. Reassignment moves only rows where `organization_id = <this org>`.

---

## Authorization — DB-enforced, org-admin gated

Every read and write goes through the `public.org_admin_*` RPC family; each RPC begins with `public.is_org_admin(p_org_id)` (owner/admin of the org via `organization_members`). The UI gate (`OrgAdminBoundary` / `useOrgAdminGate`) is UX only — **the DB is the real gate.** This is the org-level analogue of the `protected-resources` pattern (RLS deny + SECURITY DEFINER RPC + audit), gated by org-admin instead of `is_super_admin()`.

- `iam.org_member_controls` and `iam.org_admin_audit` have RLS enabled with **no policies → default-deny**; they are not PostgREST-exposed. Access is RPC-only.
- Never add a second write path. New governance op = a new `org_admin_*` RPC + an audit write.

---

## Data model

- **`iam.org_member_controls`** `(organization_id, user_id)` unique — the governance OVERLAY on `public.organization_members`: `status` (`active|suspended`), `suspended_*`, `member_level`, `tier_override` (`files.account_tiers.id`), `storage_cap_bytes`, `monthly_budget_mcents`, `notes`, `metadata`, Base columns. Keyed by `(org,user)` so it survives a future membership migration to `iam.memberships`.
- **`iam.org_admin_audit`** — one row per governance action (`member.suspend` / `member.reactivate` / `member.remove` / `controls.update` / `resources.reassign`). The single "who changed what" log for the org.
- Membership itself stays on **`public.organization_members`** (this overlay does not migrate it). Migration of org membership onto `iam.memberships` is deferred to the DB transition.

**Metrics sources (read by `org_admin_list_members`):** org-scoped file usage from `files.files` (`organization_id`+`created_by`); org-scoped last activity from `chat.conversation`; account-wide storage from `files.user_storage_usage`; account-wide spend/requests/last-request from `chat.user_usage_summary`.

---

## RPC surface (`migrations/iam_org_member_governance.sql`)

| RPC | Purpose |
|---|---|
| `org_admin_list_members(org)` | Roster + per-member org-scoped metrics + global usage context |
| `org_admin_overview(org)` | Aggregate tiles (members, active, suspended, storage, spend) |
| `org_admin_get_member(org, user)` | One member: roster row + resource breakdown |
| `org_admin_list_member_resources(org, user)` | Registry-driven count of the member's org-scoped resources per type |
| `org_admin_reassign_member_resources(org, from, to, types?)` | Reassign ownership of org-scoped resources (registry-driven, drift-tolerant owner-column resolution) |
| `org_admin_set_member_controls(org, user, …)` | Upsert budget / storage cap / tier / level / notes |
| `org_admin_set_member_status(org, user, status, reason?)` | Suspend / reactivate (owners can't be suspended; can't change own status) |
| `org_admin_remove_member(org, user, reassign_to?)` | Remove member; optional reassign-then-remove (last-owner + self guards) |
| `org_admin_list_audit(org, limit?)` | Governance audit log |

**Registry-driven:** resource listing/reassignment iterate `public.shareable_resource_registry`, include only tables that physically have `organization_id`, and resolve the owner column tolerant of registry drift (`registry owner_column → created_by → user_id → owner_id → owner_user_id`). Add a shareable resource → it's covered automatically.

---

## Entry points

**Routes** (under `app/(core)/organizations/[orgId]/admin/`, `[orgId]` = UUID or slug):
- `/admin` — dashboard: overview tiles + member roster + invite + audit log
- `/admin/users/[userId]` — member detail: identity, status actions, usage metrics, controls, resource summary
- `/admin/users/[userId]/resources` — member's org-scoped resource inventory + reassign

**Surfaced from:** `OrgManage` header → "Manage users" button (owners/admins, non-personal orgs).

**Feature code** (`features/organizations/admin/`):
- `types.ts` — domain types mirroring the RPC contracts
- `service.ts` — the single client chokepoint for the `org_admin_*` RPCs (snake→camel mapping)
- `hooks.ts` — `useOrgAdminGate` (resolve+role), `useOrgRoster`, `useOrgMemberDetail`
- `utils.ts` — `formatBytes` / `formatMcents` / `usdToMcents` / `gbToBytes` / `formatRelativeTime` / `activityBucket`
- `components/` — `OrgAdminBoundary`, `OrgAdminDashboard`, `MemberRosterTable`, `MemberDetailView`, `MemberResourcesView`, `MemberControlsForm`, `ReassignResourcesDialog`, `OrgAdminAuditTable`

**Invite** reuses the existing `InvitationManager` (org invite flow) — not reinvented.

---

## Invariants

- **Org-scoped only.** Never read/write/reassign outside `organization_id = <this org>`. Personal resources are untouchable here.
- **One RPC family, one audit log.** All governance writes flow through `org_admin_*`; each writes `iam.org_admin_audit`.
- **Guards live in the DB:** owners can't be suspended; you can't change your own status; the last owner can't be removed; reassign target must be a member.
- **Reuse, don't fork:** invite via `InvitationManager`; role/remove for the *Members* settings tab still use `MemberManagement` — this console is the heavier admin surface, not a replacement.

---

## Known limitations / follow-ups

- **Controls are advisory in v1.** `monthly_budget_mcents`, `storage_cap_bytes`, `tier_override` are stored, tracked, and displayed but **not yet hard-enforced** in the upload/usage paths. Enforcement (wire into the `files` quota block + `chat.user_usage_summary` gating) is the next pass. Surfaced to admins in `MemberControlsForm`.
- **Reassigning files** updates `files.files.created_by` but does not recompute the cached `files.user_storage_usage` counters for old/new owner. Re-mint of those counters is a follow-up.
- **Suspend** sets the governance status and shows everywhere in admin; it does not yet block the suspended user's sessions/requests (enforcement pass).
- `tier_override` / `member_level` are free-text in the form; a tier picker sourced from `files.account_tiers` is a polish follow-up.

---

## Change Log

- **2026-06-27** — Feature created. `iam.org_member_controls` + `iam.org_admin_audit` + 9 `org_admin_*` RPCs (`migrations/iam_org_member_governance.sql`); routes `/organizations/[orgId]/admin{,/users/[userId]{,/resources}}`; roster/detail/resources/controls/reassign/audit UI; "Manage users" entry in `OrgManage`. Controls advisory (enforcement deferred).
