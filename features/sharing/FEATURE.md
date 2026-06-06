# FEATURE.md — `sharing`

**Status:** `stable`
**Tier:** `1` — foundation for every collaborative surface
**Last updated:** `2026-04-22`

> Single source of truth for the sharing and permissions system. For hands-on usage patterns (copy-paste snippets for wiring sharing into a new feature), see [`README.md`](./README.md). This doc covers the architecture, invariants, and agent-relevant internals.

---

## Purpose

One RLS-backed permissions system that makes any resource type shareable with users, organizations, or the public. Every collaborative feature in the app — prompts, notes, agents, canvases, tasks, chats, flashcards, and more — plugs into this system. There is one `permissions` table, one component set, one RPC surface.

---

## Entry points

**Components** (`features/sharing/components/`)
- `ShareButton.tsx` — self-contained button that opens `ShareModal`; shows Private/Shared/Public status
- `ShareModal.tsx` — three-tab dialog (Users / Organizations / Public), the only UI surface owners need
- `PermissionsList.tsx` — list of current grants with inline level edit + revoke
- `PermissionBadge.tsx` — visual permission-level badge (viewer / editor / admin)
- `tabs/ShareWithUserTab.tsx` — user search + invite form
- `tabs/ShareWithOrgTab.tsx` — org picker (constrained to caller's orgs)
- `tabs/PublicAccessTab.tsx` — toggle + link copy for `is_public = true`

**Hooks** (`utils/permissions/hooks.ts`)
- `useSharing(resourceType, resourceId, enabled)` — full CRUD used inside `ShareModal`
- `useSharingStatus(resourceType, resourceId)` — lightweight `is_public` check safe for list cards
- `useIsOwner(resourceType, resourceId)` — ownership check from the resource row
- `useCanEdit(resourceType, resourceId)` / `useCanAdmin(...)` — level gating for UX
- `usePermissionCheck({ resourceType, resourceId, requiredLevel })` — generic gate
- `useSharedWithMe(resourceType?)` — resources directly granted to the current user (no hierarchy)
- `usePermissions(...)` / `useResourcePermissions(...)` — raw permission lists

**Services**
- `utils/permissions/service.ts` — all DB calls; every write routes through a `SECURITY DEFINER` RPC
- `features/sharing/emailService.ts` — client-side resource-shared notification (legacy; prefer server route)
- `lib/email/exportService.ts` → `emailShareLink()` — email-link-to-self helper

**API routes**
- `POST /api/sharing/notify` — server-side sharing notification (used by `shareWithUser()` fire-and-forget)
- `POST /api/sharing/email-link` — email the share URL to the current user

**Public barrels**
- `features/sharing/index.ts` re-exports both the components and everything in `@/utils/permissions`
- Consumers should import from `@/features/sharing` or `@/utils/permissions` — never from internal paths

---

## Data model

### Database

| Table / object | Role |
|---|---|
| `permissions` | The single grants table. Row per (resource_type, resource_id, target). Target is exactly one of: `granted_to_user_id`, `granted_to_organization_id`, or `is_public` sentinel. Columns: `permission_level` (`viewer` / `editor` / `admin`), `created_at`, `created_by`. **Org-share moderation (2026-06-06):** `status` (`active` default / `pending` / `rejected`), `reviewed_by`, `reviewed_at`, `review_note`. A `rejected` grant no longer confers access — `has_permission` and `check_resource_access` both filter `COALESCE(status,'active') <> 'rejected'`. Additive + default-safe: every prior grant is `active`. |
| `<resource>.is_public` | Public visibility lives on the **resource row**, not the permissions table. Owner-controlled, toggled via `make_resource_public` / `make_resource_private`. |
| `<resource>.user_id` | Ownership is always the resource row's `user_id`. No explicit "owner" permission row exists. |

### Key RPCs (all `SECURITY DEFINER`)

Writes:
- `share_resource_with_user(p_resource_type, p_resource_id, p_target_user_id, p_permission_level)`
- `share_resource_with_org(p_resource_type, p_resource_id, p_target_org_id, p_permission_level)` — also validates caller's org membership
- `update_permission_level(...)`
- `revoke_resource_access(...)` — user grant
- `revoke_resource_org_access(...)` — org grant
- `make_resource_public(...)` / `make_resource_private(...)` — flip `is_public` on the resource row
- `review_org_share(p_permission_id, p_status, p_note)` — org-share moderation. Sets the `status` of one org grant; gated on the caller being an `owner`/`admin` of the org the grant targets. `rejected` revokes team access via the `has_permission` / `check_resource_access` status filter. Consumed by `utils/permissions/orgModeration.ts` (`reviewOrgShare`); the org workspace v2 review queue uses it. See `features/organizations/FEATURE.md`.

Reads:
- `get_resource_permissions(p_resource_type, p_resource_id)` — owner-only; returns rows with resolved user/org display data
- `is_resource_owner(p_resource_type, p_resource_id)` — universal ownership check
- `check_resource_access(...)` — single RLS engine; evaluates owner, assignee, direct grant, project / workspace / org hierarchy in one query
- `has_permission(resource_type, resource_id, level)` — the function every RLS policy calls

### RLS enforcement

Every shareable resource table has a SELECT policy of the form `user_id = auth.uid() OR is_public = true OR has_permission(<resource_type>, id, 'viewer')`. UPDATE / DELETE policies bump the required level to `'editor'` / `'admin'`. Child tables (e.g. `cx_message`) check the parent resource, not themselves.

### Key types (`utils/permissions/types.ts` → re-exported from `utils/permissions/registry.ts`)

- `ResourceType` — union derived from the registry primary keys. Always exactly mirrors the live `shareable_resource_registry` rows (verified by parity test).
- `PermissionLevel` — `'viewer' | 'editor' | 'admin'`, ordered via `satisfiesPermissionLevel()`
- `Permission` / `PermissionWithDetails` — raw row vs. RPC-enriched row with user/org info
- `ShareActionResult` — `{ success, message?, error?, permission? }` — uniform return shape for every write
- `PermissionError` + `PermissionErrorCode` enum — typed error boundary
- `ShareableResourceEntry` — registry row shape (alias, canonical table, id/owner/public columns, label, URL template, `rlsUsesHasPermission`)

### Single source of truth: `shareable_resource_registry`

The DB table `public.shareable_resource_registry` is the **only** place where shareable resources are declared. Every component, RPC, and TypeScript type derives from this table:

- **DB-side resolver** — `public.resolve_shareable_resource(text)` maps an alias or canonical name to a registry row. All sharing RPCs (`share_resource_with_user`, `is_resource_owner`, `make_resource_public`, etc.) call this resolver — no more `CASE WHEN` ladders inside RPCs.
- **DB-side validation** — a `BEFORE INSERT/UPDATE` trigger on `permissions.resource_type` rejects any value that isn't a canonical `table_name` in the registry. Loud failure, not silent drift.
- **TS-side mirror** — `utils/permissions/registry.ts` exports `SHAREABLE_RESOURCE_REGISTRY` plus `ResourceType`, `getShareableResource`, `resolveTableName`, `getResourceTypeLabel`, `getResourceSharePath`. All consumed by `ShareModal`, `ShareButton`, `service.ts`, hooks.
- **Forcing-function test** — `utils/permissions/__tests__/registry.parity.test.ts` compares the TS mirror against a checked-in DB snapshot (`registry.db-snapshot.json`). If anyone updates one without the other, the test fails in CI before merge.

### Resource-type aliases

Aliases live in the registry's `resource_type` column. Canonical table names live in `table_name`. The two diverge only when a table name would be unfriendly in TS / RPC arguments (e.g. `agent` ↔ `agx_agent`, `prompt` ↔ `prompts`, `task` ↔ `ctx_tasks`). For new tables prefer the exact table name as the alias.

---

## Key flows

### 1. Sharing a resource with a user

1. Owner opens `ShareButton` → `ShareModal` mounts → `useSharing(resourceType, resourceId, isOpen)` fires `listPermissions()` via `get_resource_permissions` RPC.
2. Owner submits `ShareWithUserTab` form → `shareWithUser({ resourceType, resourceId, userId, permissionLevel })`.
3. `service.shareWithUser` calls `share_resource_with_user` RPC — RPC validates auth, ownership, level, duplicate.
4. On success, a fire-and-forget `fetch('/api/sharing/notify', ...)` kicks off the email. Notification failure does **not** fail the grant.
5. `useSharing.refresh()` re-fetches permissions; modal UI updates.

### 2. Making a resource public (or private)

1. Owner toggles in `PublicAccessTab`.
2. `makePublic()` / `makePrivate()` call `make_resource_public` / `make_resource_private` RPCs — both update `is_public` on the **resource row**, never the permissions table.
3. `useSharingStatus` re-reads `is_public` from the resource row on next mount (no cache busting needed).

### 3. Permission check at read time

1. Any authenticated client query on a shareable resource hits the table.
2. RLS policy invokes `has_permission(resource_type, id, 'viewer')` plus `is_public` / `user_id = auth.uid()` shortcuts.
3. Row is returned or silently omitted — no error, no client-side check required.
4. **UI-level checks** (`useCanEdit`, `useIsOwner`) only drive the UX: which buttons to disable, whether to show a "Save as Copy" warning. They are never the security boundary.

### 4. Surfacing shared items in list pages

Two supported patterns (see README for full snippets):

- **Custom RPC** — recommended. Define `get_<resources>_shared_with_me()` that joins `permissions` → resource table → `auth.users`, returning owner email + permission level. Call from a Server Component in parallel with the owned-items query.
- **Client hook** — `useSharedWithMe(resourceType)` returns a `Permission[]` from the permissions table; fetch resource details separately. Only reflects direct grants, **not** hierarchy-inherited access.

### 5. Email notifications

- **Resource shared with user** — server route `POST /api/sharing/notify` (called fire-and-forget from `shareWithUser()`). Uses `lib/email/client.ts` + `emailTemplates.resourceShared()`. Respects `user_email_preferences.sharing_notifications`.
- **Email link to self** — server route `POST /api/sharing/email-link`. User-initiated from `ShareModal` header button.
- `features/sharing/emailService.ts` is a parallel client-side path kept for legacy callers; new code should use the API routes (server owns `RESEND_API_KEY` + `EMAIL_FROM`).

### 6. Adding a new shareable resource type (the pattern)

The whole integration is now **two rows + one component**. RPCs, validation, label rendering, share URLs, and ownership checks are all driven by the registry — you do not touch any of them.

1. **Database schema** — make sure the table has `id` (uuid), `user_id` (uuid → `auth.users`), and `is_public` (bool, optional). Add RLS policies that include `has_permission(<canonical_table>, id, <level>)` so direct grants are actually enforced. (See "RLS rollout" follow-up below for tables that ship without `has_permission` initially.)
2. **DB registry** — one INSERT into `public.shareable_resource_registry`:
   ```sql
   INSERT INTO public.shareable_resource_registry
     (resource_type, table_name, id_column, owner_column, is_public_column,
      display_label, url_path_template, rls_uses_has_permission, is_active, notes)
   VALUES
     ('<alias>', '<table>', 'id', 'user_id', 'is_public',
      '<Label>', '/<path>/{id}', true, true, NULL);
   ```
3. **TS registry** — mirror the same row in `utils/permissions/registry.ts` under `SHAREABLE_RESOURCE_REGISTRY`.
4. **Refresh the snapshot** — `pnpm tsx scripts/regen-shareable-registry-snapshot.ts`. This rewrites `utils/permissions/__tests__/registry.db-snapshot.json` so the parity test passes.
5. **Drop in the UI** — `<ShareButton resourceType="<alias>" resourceId={id} resourceName={...} isOwner={...} />`. ShareModal auto-builds the share URL from the registry's `url_path_template`. Done.
6. **List pages (optional)** — create a `get_<resources>_shared_with_me()` RPC for efficient list rendering, or fall back to `useSharedWithMe(resourceType)`. Same pattern as `features/prompts/components/layouts/PromptsGrid.tsx`.
7. **Detail-page gating (optional)** — create a `get_<resource>_access_level(id)` RPC if you need rich UX (banner showing owner email, "save as my copy" warning). Reference: `features/prompts/components/builder/SharedPromptWarningModal.tsx`.

If you find yourself editing `service.ts`, the share RPCs, `ShareModal.getShareUrl()`, or any "resource-type → table-name" map: stop. That work has already been generalized into the registry and you are recreating it.

---

## Invariants & gotchas

- **One permissions table. Always.** Never create a per-resource permissions/ACL table. The entire system collapses without the shared shape.
- **RLS is the security boundary.** `useIsOwner` / `useCanEdit` / etc. are UX only. A bypassed client check must not be a privilege escalation.
- **`is_public` lives on the resource row, not `permissions`.** Read via `getResourceVisibility()` / `useSharingStatus()`. Writing `is_public = true` rows into the permissions table is legacy and must not be done in new code.
- **Never write directly to the `permissions` table from the client.** Every mutation must go through a `SECURITY DEFINER` RPC. Direct writes bypass ownership validation.
- **`useSharingStatus()` is intentionally lightweight.** It does NOT call `get_resource_permissions` — safe to mount on every grid card. Full permission details are only loaded when `ShareModal` opens.
- **Permission changes are immediate; no cache invalidation needed.** RLS evaluates per-query. There is no Redux cache of permissions to invalidate. The only client state is the modal's in-memory list, refreshed by `useSharing.refresh()`.
- **Exactly one target per permission row.** `grantedToUserId`, `grantedToOrganizationId`, and `isPublic` are mutually exclusive — `validatePermission()` enforces this.
- **Child resources inherit via parent checks.** E.g., `cx_message` RLS calls `has_permission('cx_conversation', conversation_id, 'viewer')`, not `has_permission('cx_message', ...)`. Don't register child tables as separate resource types.
- **Owner can always delegate.** Non-owners with `admin` cannot currently re-share — only the resource `user_id` passes the RPC's ownership check. If delegation becomes a requirement, change the RPCs, not the client.
- **Shared users editing an original surface a "Save as My Copy" warning** before writes land. Feature-level concern — see `features/prompts/components/builder/SharedPromptWarningModal.tsx` for the canonical pattern.
- **Unknown resource types fail loudly at three layers.** TypeScript rejects them at compile time (the `ResourceType` union is derived from the registry). The TS resolver `resolveTableName()` throws. The DB-side `resolve_shareable_resource()` raises an exception. The trigger on `permissions.resource_type` rejects the row. There is no path by which an unregistered string reaches a shipped feature.
- **`rls_uses_has_permission = false` is a known broken state, not a temporary glitch.** Several legacy tables (`agx_agent`, `prompts`, `notes`, `ctx_tasks`) have RLS policies that ignore `has_permission()`. Sharing rows insert successfully on these tables but RLS will not actually grant the grantee access. The registry surfaces this explicitly so we don't pretend it works. See "RLS rollout" follow-up below.

---

## Related features

- **Depends on:** `utils/permissions/*` (lives outside `features/` — the core logic), `features/organizations/` (org-as-target for shares), `lib/email/*` (notification delivery)
- **Depended on by:** `features/prompts/` (gold-standard integration), `features/agents/components/sharing/`, `features/notes/`, `features/canvas/`, `features/cx-chat/`, `features/cx-conversation/`, `features/tasks/`, `features/window-panels/windows/ShareModalWindow.tsx`, and every other resource type listed under `ResourceType`
- **Cross-links:**
  - [`features/scopes/FEATURE.md`](../scopes/FEATURE.md) — the broader scope / project / org hierarchy that `check_resource_access` evaluates on top of direct grants
  - `features/invitations/` — org invitation flow; separate system, don't fold it in
  - `features/organizations/` — target source for org-level shares
  - Reference integration: `features/prompts/` — list page, shared cards, edit-page banner, save-warning modal

---

## Current work / migration state

Stable. Active areas:
- **RLS rollout** (highest priority follow-up). The `rls_uses_has_permission` column flags four tables (`agx_agent`, `prompts`, `notes`, `ctx_tasks`) whose RLS policies don't yet call `has_permission()`. Direct grants on these tables succeed at the RPC layer but are ignored by RLS. Each policy needs to be amended with `OR has_permission('<canonical>', id, '<level>')` and tested. Track per-table progress by flipping the registry column to `true` once the policy is updated.
- `features/sharing/emailService.ts` is on a slow deprecation path — prefer the `/api/sharing/notify` server route for all new notification paths.

---

## Change log

- `2026-06-06` — Org-share moderation. Added `status` (`active`/`pending`/`rejected`) + `reviewed_by` / `reviewed_at` / `review_note` to `permissions`, a `permissions_org_status_idx`, and the `review_org_share(permission_id, status, note)` SECURITY DEFINER RPC (org owner/admin gated). `has_permission` and `check_resource_access` now exclude `status = 'rejected'` org/user grants (single additive `COALESCE(status,'active') <> 'rejected'` clause each — default-safe, no behavior change for existing grants). FE helpers in `utils/permissions/orgModeration.ts`. Lets org admins reject resources members contribute to the org from the org workspace v2 review queue. Migration: `migrations/perm_org_share_moderation.sql`.
- `2026-04-29` — codex: registry-driven sharing. Created `shareable_resource_registry` (DB) + TS mirror + parity test. Refactored all 9 sharing RPCs to consume `resolve_shareable_resource()`. Added validation trigger on `permissions.resource_type`. Removed legacy `getTableName()` and inline `resourcePaths` map. Documented `rls_uses_has_permission` gaps for follow-up.
- `2026-04-22` — claude: initial FEATURE.md extracted from README.md.

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change to sharing — new `ResourceType`, new RPC, new component, changed invariant — update this file's Data model / Invariants / Change log and keep `README.md` in sync with any new integration pattern. A stale sharing doc cascades into every feature that plugs into it.
