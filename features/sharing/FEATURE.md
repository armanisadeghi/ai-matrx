# FEATURE.md — `sharing`

**Status:** `stable`
**Tier:** `1` — foundation for every collaborative surface
**Last updated:** `2026-07-15`

> Single source of truth for the sharing and permissions system. For hands-on usage patterns (copy-paste snippets for wiring sharing into a new feature), see [`README.md`](./README.md). This doc covers the architecture, invariants, and agent-relevant internals.

---

## Purpose

One RLS-backed permissions system that makes any resource type shareable with users, organizations, or the public. Every collaborative feature in the app — prompts, notes, agents, canvases, tasks, chats, flashcards, and more — plugs into this system. There is one `permissions` table, one component set, one RPC surface.

---

## Entry points

**Components** (`features/sharing/components/`)
- `ShareButton.tsx` — self-contained button that opens `ShareModal`; shows Private/Shared/Public status
- `ShareModal.tsx` — three-tab dialog (Users / Organizations / Public), the only UI surface owners need
- `ShareLinkPanel.tsx` — "Anyone with the link" no-login token links (mint / copy / revoke / view-count), rendered in the Public tab
- `DuplicateToEditButton.tsx` — canonical **"Make a copy & use it"** for a view-only sharee / public / anon viewer; forks the resource into the caller's account (signed-out → sign-up → finish). Shared by `/s/[token]`, `/p/e`, and in-app view surfaces
- `resourceIcons.ts` — token → Lucide icon map for share cards/previews (fallback: `Share2`)
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
- **`useAccess(resourceType, id)`** (`utils/permissions/access.ts`) — the **view-vs-edit gate**. One resolver → `{ level: 'none'|'view'|'edit'|'admin', isOwner, exists, loading }` over the `get_resource_access` RPC (owner/grants/org/membership/reachability/public, resolving the same model RLS enforces; anon sees public as `view`). Helpers `accessSatisfies` / `canEditAccess` / `canViewAccess` + isomorphic core in `access-core.ts`. **Every study tool + feature gates on this — don't roll a bespoke owner/edit check.** See "View-vs-edit access gate" below.
- `useSharedWithMe(resourceType?)` — resources directly granted to the current user (no hierarchy)
- `usePermissions(...)` / `useResourcePermissions(...)` — raw permission lists

**Server guard**
- `utils/permissions/requireAccess.ts` (`server-only`) — `requireAccess(resourceType, id, level, { redirectTo })` gates a Server Component: a sharee below `level` is redirected (e.g. `[id]/edit` → `[id]`), never dropped into an editor whose RLS writes silently fail. `resolveAccess(...)` returns the level without redirecting. Server twin of `useAccess`.

**Services**
- `utils/permissions/service.ts` — all DB calls; every write routes through a `SECURITY DEFINER` RPC
- `utils/permissions/shareLinks.ts` — no-login link tokens (mint/list/revoke/`resolveShareToken`) + `forkSharedResource` / `isForkable` (duplicate-to-edit fork RPCs)
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
| `shareable_resource_registry.content_role` / `.is_scopeable` (2026-06-06) | The knowledge-model classification on the registry: `content_role` ∈ source/destination/utility/container/hybrid; `is_scopeable` bool. Backend (scope-association pipeline) + the FE org catalogue read these. |
| `org_module_settings` (2026-06-06) | Per-org per-module rules. `(organization_id, module_key)` unique; `module_key` = canonical table name for shareable kinds (so the share RPC matches it). Columns: `members_can_add`, `requires_approval`, `default_permission`, `auto_ingest`, `is_scopeable`. RLS: org members SELECT; writes only via `set_org_module_setting` (owner/admin). `members_can_add` + `requires_approval` are enforced in `share_resource_with_org`. |

### Key RPCs (all `SECURITY DEFINER`)

Writes:
- `share_resource_with_user(p_resource_type, p_resource_id, p_target_user_id, p_permission_level)`
- `share_resource_with_org(p_resource_type, p_resource_id, p_target_org_id, p_permission_level)` — also validates caller's org membership
- `update_permission_level(...)`
- `revoke_resource_access(...)` — user grant
- `revoke_resource_org_access(...)` — org grant
- `make_resource_public(...)` / `make_resource_private(...)` — flip `is_public` on the resource row
- `set_org_module_setting(p_org_id, p_module_key, p_members_can_add, p_requires_approval, p_default_permission, p_auto_ingest, p_is_scopeable)` — owner/admin-gated upsert of one module's org rules. FE: `features/organizations/orgModuleSettings.ts`.
- `share_resource_with_org(...)` — **now enforces module rules**: blocks the share if `members_can_add = false` and the caller isn't owner/admin; sets the new grant's `status = 'pending'` when `requires_approval = true` (and caller isn't admin); when `p_permission_level` is NULL it uses the module's `default_permission` (fallback `viewer`) — the contribute flow omits the level, pickers pass it explicitly. Defaults (no settings row) preserve the prior always-active viewer behavior.
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
4. On success, a fire-and-forget `fetch('/api/sharing/notify', ...)` sends only the recipient/resource identifiers. The route derives the sharer identity from the authenticated session, proves a matching active `iam.permissions` row created by that caller, then uses its server client to resolve recipient preferences/email. Notification failure does **not** fail the grant.
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
4. **Refresh the snapshot + verify no live drift** — `pnpm tsx scripts/regen-shareable-registry-snapshot.ts` rewrites `utils/permissions/__tests__/registry.db-snapshot.json` so the parity test passes, then `pnpm check:shareable-registry` (the `--check` drift guard) confirms the committed snapshot equals the LIVE registry. **Both are mandatory on any registry migration.** The parity test alone only diffs the TS mirror against the *committed* snapshot — a live-DB row nobody snapshotted is invisible to it (that gap shipped the `assessment` enum bug); `check:shareable-registry` is the loud screamer that closes it.
5. **Drop in the UI** — `<ShareButton resourceType="<alias>" resourceId={id} resourceName={...} isOwner={...} />`. ShareModal auto-builds the share URL from the registry's `url_path_template`. Done.
6. **List pages (optional)** — create a `get_<resources>_shared_with_me()` RPC for efficient list rendering, or fall back to `useSharedWithMe(resourceType)`. Same pattern as `features/prompts/components/layouts/PromptsGrid.tsx`.
7. **Detail-page gating (optional)** — create a `get_<resource>_access_level(id)` RPC if you need rich UX (banner showing owner email, "save as my copy" warning). Reference: `features/prompts/components/builder/SharedPromptWarningModal.tsx`.

If you find yourself editing `service.ts`, the share RPCs, `ShareModal.getShareUrl()`, or any "resource-type → table-name" map: stop. That work has already been generalized into the registry and you are recreating it.

### NOT ShareModal: data-store / library publishing

[Shared Knowledge Resources](../rag/FEATURE.md#shared-knowledge-resources) (`features/rag/` library stores) are shared by an **ownership-asymmetry** model: a system org owns the content, READ is granted via `rag.data_store_grants` (audience global / industry / org), and WRITE stays gated by data-store ownership. The publish UI (`DataStorePublishPanel`) deliberately *mirrors* `ShareModal`'s structure but uses its own grant RPCs over HTTP.

`data_store` **is** in `shareable_resource_registry` (so Relationship Manager / reachability know it is a conveying container — `file→data_store` Conveys viewer), with `rls_uses_has_permission=false` and `is_link_shareable=false`. That registration is for cascade recognition only. **Do NOT** wire `ShareButton` / `useSharing` / `iam.permissions` for data stores — publishing stays on `DataStorePublishPanel` + `data_store_grants`.

---

## View-vs-edit access gate, public lanes & duplicate-to-edit (P7)

The product layer over the plumbing: shared content works like Google Docs/Quizlet — a view-sharee gets a great read-only experience + a fork button, never an RLS error.

**The gate.** `useAccess(resourceType, id)` (client) / `requireAccess(resourceType, id, level, {redirectTo})` (server) both read `public.get_resource_access(p_resource_type, p_resource_id)` → `{level, is_owner, exists}`. That RPC is **registry-driven** (`resolve_shareable_resource`): canonical entity_types tokens resolve via `iam.has_access` (full model), legacy tables via `has_permission`, and **anon sees a public row as `view`** (owner → `admin`+`is_owner`). It resolves the same access RLS enforces — this is the UX layer, **RLS is still the boundary**.

- Wire it once per tool per ROUTING.md §2: `[id]` view-gated, `[id]/edit` edit-gated (`requireAccess(..., 'edit', {redirectTo:'[id]'})`). Reference: `app/(core)/education/flashcards/[setId]/edit/page.tsx` + `SetDetailView` (hides Edit/visibility for view-only sharees, shows `DuplicateToEditButton`).

**Two public lanes (don't merge them):**
- **`/s/[token]`** — token-authorized, **noindex**. The token is the authorization (`resolve_share_token`, anon). Any registered type.
- **`/p/e/[resourceType]/[id]`** — id-addressed, **indexable** (`robots: index`), for `visibility='public'` only. Anon RLS `pub_read` is the authorization (no token). Server loader `app/(public)/p/e/loadPublicResource.ts`: flashcard sets get rich cards via the anon `get_public_flashcard_set` SECURITY DEFINER RPC; other types read the base row generically. Private/missing → `notFound()`. This is the SEO/community-library lane (P6-C).

**Duplicate-to-edit.** `DuplicateToEditButton` → `forkSharedResource(type, id, shareToken?)` (per-family `fork_shared_*(p_id, p_token)` SECURITY DEFINER RPCs). Surfaced automatically where `useAccess` returns `view` on an editable surface. Forkable today: `conversation`, `fc_set`, `quiz_sessions` — extend `forkSharedResource` + `isForkable` + add a `fork_shared_<type>` RPC for a new family.

**Fork authorization (3 token-less lanes + 1 token lane — get this exact):** a fork is authorized iff the type `is_link_shareable` AND one of: (1) resource `visibility IN ('public','link')` — owner-set broad-read states, token-less; (2) `iam.has_access(type,id,'viewer')` — an explicit grant / owner / org access, token-less; (3) a **valid, active share token for THAT resource** is presented — this is the ONLY thing that authorizes forking a *private* resource shared purely by no-login link. The token is validated by the single `public.share_link_authorizes(token, type, id)` predicate (active + unexpired + not-exhausted + resource-match — the same conditions `resolve_share_token` enforces on the read path; a fork does not consume a view). **Only `/s/[token]` passes `shareToken`; every other surface (`/p/e`, in-app view, library cards) omits it and relies on lanes 1–2.** Never re-add a caller-independent "does any active link exist for this resource" check — that was the P7 hole (see change log 2026-07-10).

**Adopting the gate in a new tool:** register the type (Key flow #6), then `requireAccess` on `[id]/edit`, `useAccess` in the `[id]` view surface, and drop `DuplicateToEditButton` where level is `view`. Zero new code in `utils/permissions` — proven unchanged on `note` (generic public path) after `fc_set` (rich path).

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
- **Sharing propagates to children via association conveyance — configure it in `platform.association_types`, never hand-wire.** A container→content pair (`source_type`, `target_type`, `container_side`, `conveys_max`) declares that access to the container conveys to its contents, capped at `conveys_max`; `platform.reachability` is the flattened cache and `iam.has_access` reads it. Both a container's **explicit grants/membership/ownership** AND its **own visibility** convey: making a flashcard set `public` makes its cards readable by a non-owner (read only — `public`/`link`/`internal` convey `viewer`, never write; grants convey up to `conveys_max`). Add a row to `platform.association_types` to make a new parent→child pair propagate — do NOT propagate visibility onto child rows or add per-feature checks. (fc_card→fc_set conveyance + `iam.has_access` container-visibility branch: 2026-07-07.)
- **`rls_uses_has_permission = false` is a known broken state, not a temporary glitch.** A table with this flag has RLS that ignores the grant path — sharing rows insert but RLS won't grant the grantee access. As of the 2026 canonical-RLS rollout, every table on `iam.apply_rls` resolves grants via `iam.has_access(token,…)` (token-agnostic `has_permission`), so canonicalized types (`note`, `agent`, `conversation`, `task`, …) are `true` and grants really grant (verified live for `note` 2026-07-07). The flag still marks the genuinely-legacy `rls_uses_has_permission=false` rows (e.g. `analysis_recipes`, `auto_ingest_batch`, `file_*` satellites, `scraper_*`) whose own RLS models don't call the grant path.

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

Stable. Grants **really grant**: every table on canonical RLS (`iam.apply_rls`) resolves grants via token-agnostic `iam.has_access` (verified live for `note`, `fc_set` 2026-07-07), so `rls_uses_has_permission=true` for all canonicalized types. The flag now only marks genuinely-legacy rows whose own RLS model doesn't call the grant path (`analysis_recipes`, `auto_ingest_batch`, `file_*` satellites, `scraper_*`) — a known state, not a TODO. Active areas:
- `features/sharing/emailService.ts` is on a slow deprecation path — prefer the `/api/sharing/notify` server route for all new notification paths.
- The TS registry mirror (`utils/permissions/registry.ts`) is reconciled with the DB and the parity test is green (2026-07-07).

---

## Change log

- `2026-07-15` — **Share-notification identity hardening.** `/api/sharing/notify` no longer trusts caller-supplied sharer names or treats an arbitrary recipient UUID as authorization. It validates UUID/resource-type input, resolves the canonical registry token, requires the matching non-rejected `iam.permissions` grant created by the authenticated caller, derives the sharer from the session, and resolves recipient preferences/email only after that proof. `get_user_emails_by_ids` is now platform-admin/service-only.
- `2026-07-13` — **Standalone `/administration/sharing` page deleted** — absorbed into the Relationships hub at `/administration/relationships/sharing` (redirect in `next.config.js`). Same two RPCs (`admin_list_share_policies` / `admin_set_share_policy`) now drive the per-row **Link policy** side panel (`SharePolicyColumnEditor` in `features/admin/relationships/`) on the registry table that already owns full row CRUD. See `features/admin/relationships/FEATURE.md`.
- `2026-07-10` — **Registry snapshot re-synced to live DB + live-drift guard.** The parity test only diffs the TS mirror against the *committed* `registry.db-snapshot.json`, never the live DB — how the `assessment` enum row shipped un-mirrored. Regenerated the snapshot from live (picked up `assessment`, `learn_doc`, `wf_node_data_slot`), synced `utils/permissions/registry.ts` (3 rows added; `learn_doc.isPublicColumn='visibility'` mirrored faithfully — flagged as a likely DB-registry defect, see FOUND_DEFECTS), parity test green (62/62). Added `pnpm check:shareable-registry` (`regen-…--check`) — pulls the live registry and screams on drift vs the committed snapshot; documented as mandatory on any registry migration (Key flow #6 step 4).
- `2026-07-10` — **P7 SECURITY FIX: `fork_shared_*` authorized link-forks without a token (`migrations/fork_shared_token_authorization_fix.sql`).** The `fork_shared_flashcard_set` / `fork_shared_conversation` / `fork_shared_quiz` RPCs authorized a link-based fork with a **caller-independent** `EXISTS(active share_link for this resource)` clause — it took no token and validated nothing about the caller, so ANY authenticated stranger could fork a **private** resource the instant its owner had ever minted one viewer link (`get_resource_access='none'`, no token). Live-reproduced on `fc_set` (stranger → full owned copy). Fix: added `p_token` to all three RPCs and replaced the caller-independent branch with `public.share_link_authorizes(token,type,id)` — the single validity predicate mirroring `resolve_share_token` (active + unexpired + not-exhausted + resource-match). `visibility IN ('public','link')` (owner-set broad-read) and `iam.has_access` (grant/owner) stay token-less; the token is required only to fork a private link-shared resource. FE: `forkSharedResource(type,id,shareToken?)` + `DuplicateToEditButton.shareToken` — `/s/[token]` passes it, all other surfaces omit it. Verified live: (a) stranger + no token + private-with-link → REJECTED; (b) token holder → success; (c) public + no token → success; (d) owner → success; (e) wrong token → REJECTED; (f) revoked token → REJECTED. See "Fork authorization" above.
- `2026-07-07` — **Share contact list: stop direct `iam.invitations` reads.** `useUserConnections` (feeds `ShareWithUserTab`, task assignee picker, org invitation manager) queried `iam.invitations` directly → `42501 permission denied` on `/notes`, `/war-room`, etc. Replaced with `invitationsService.listForTarget('organization', orgId)` (`inv_list` SECURITY DEFINER RPC). Also hardened cross-route `PGRST116` noise: `userPreferencesSlice` remote fetch + several missing-row reads now use `.maybeSingle()` instead of `.single()`.
- `2026-07-11` — **`data_store` registered in `shareable_resource_registry`** (`migrations/register_data_store_shareable.sql`). Clears Relationship Manager `conveying_container_not_shareable` for `file→data_store` (library_member). `rls_uses_has_permission=false`, `is_link_shareable=false`, `content_role=container` — cascade recognition only; publishing stays on `DataStorePublishPanel` / `rag.data_store_grants`. TS mirror + snapshot synced.
- `2026-07-07` — **P7: view-vs-edit access gate + indexable public lane + duplicate-to-edit** (`migrations/access_gate_get_resource_access.sql`, `public_flashcard_set_read.sql`). New `public.get_resource_access(type,id)` resolver (registry-driven; canonical→`iam.has_access`, legacy→`has_permission`, anon→public-as-view) behind `useAccess` (client, `access.ts`/isomorphic `access-core.ts`) + `requireAccess` (server guard, `requireAccess.ts`). Second public lane `app/(public)/p/e/[resourceType]/[id]` — id-addressed, **indexable**, `visibility='public'` only, anon `pub_read` (the token lane `/s/[token]` stays noindex); flashcard sets get cards via anon `get_public_flashcard_set` RPC, other types read generically (`loadPublicResource.ts`); private/missing 404. `DuplicateToEditButton` (extracted from the `/s` fork button) is the shared "Make a copy" surfaced wherever `useAccess` returns `view`. Flashcards is the reference: `[setId]/edit` requireAccess-gated, `SetDetailView` hides Edit/visibility + offers Make-a-copy for view-only sharees + links public sets to `/p/e`. `note` adopts the primitive unchanged (generic public path). Verified live (owner→admin, sharee→view redirect, anon public 52-card viewer, private 404). See "View-vs-edit access gate" section. Also cleaned the stale RLS-rollout note (grants really grant since 2026-06-26).
- `2026-07-07` — **Guest takeover: fork-a-shared-resource into your own account.** Three SECURITY DEFINER RPCs (applied direct-in-DB, not migration files) let a recipient copy a shared resource to their personal org and use it — the "share it and they use it" model: `fork_shared_conversation` (chat + messages + tool_calls → continue chatting), `fork_shared_flashcard_set` (set + member cards + fc_detail + membership edges → study with own progress), `fork_shared_quiz` (copy with progress/results reset → take it fresh). Each gates on the resource actually being shared (`is_link_shareable` + active share_link / public·link visibility / `has_access`), assigns `created_by`=caller + personal org, and is `authenticated`-only. Verified live (guest-owned copies, 20-card set, non-shared rejected). FE: `forkSharedResource()` + `ForkAndUseButton` on `/s/[token]` ("Continue this chat" / "Study these flashcards" / "Take this quiz"); logged-out → `/sign-up?redirectTo=/s/[token]` then finish the fork (acquisition). Remaining guest-use work (agent run-as-guest, agent-app SEO indexing, read-only child views for chat/set/quiz) tracked in [`docs/handoffs/SHARING_GUEST_FEATURES_HANDOFF.md`](../../docs/handoffs/SHARING_GUEST_FEATURES_HANDOFF.md).
- `2026-07-07` — **Share-link policy model + admin control panel + broad enablement (`migrations/share_link_policy_and_admin.sql`).** Made "what is publicly link-shareable, and which columns anon sees" an admin-editable policy, not a code constant:
  - Registry gains `is_link_shareable` (bool — offers the no-login link AND a per-type kill switch: false stops `resolve_share_token` serving even already-minted tokens) alongside `public_columns` (the anon allowlist). `resolve_share_token` + `create_share_link` both honor it.
  - **Seeded safe allowlists + enabled link sharing for 27 user-content types** (notes, content templates, code, canvas, flashcards/quizzes, transcripts/audio sessions, chat conversations, agents [non-secret fields only — id/name/description/variable_definitions/tags, NEVER messages/settings/tools], agent cards, agent apps, projects/tasks/threads/war rooms, research, udt). Deliberately OFF: PII (`wc_claim`), secrets (`wf_trigger.webhook_secret`, scraper credentials), storage locations, private DMs, and internal satellites (`file_*` analysis, redaction crypto, sandbox, ingest batches, scope suggestions).
  - **`get_share_capabilities(type)`** (authenticated) drives the owner UI: the "Anyone with the link" panel shows only when `is_link_shareable`, and the Public toggle shows only when `supports_public` (has a visibility/public column) — so a type that genuinely can't be public shows a clean "not available" note instead of erroring on click (fixes the make_public 42703 wart for the ~12 no-visibility internal types).
  - **Admin control panel** (now at `/administration/relationships/sharing` — the standalone `/administration/sharing` page was absorbed into the Relationships hub 2026-07-13 and redirects) via `admin_list_share_policies()` / `admin_set_share_policy(type, is_link_shareable, columns[])` — see [protected-resources]: the registry governs anon exposure, so writes are `is_super_admin()`-gated and only persist columns that physically exist. Lists every type with its status + a column-picker allowlist editor.
  - Public renderer (`/s/[token]`) extended: markdown (note/content_template), code, flashcard, and a content-aware generic that renders `content` for any allowlisted type.
- `2026-07-07` — **No-login share links + DM-on-share + full registry reconciliation.** Three connected additions:
  1. **Canonical no-login link sharing** (`migrations/share_links_canonical_system.sql`). New `platform.share_links` (token, resource_type, resource_id, permission_level, expires_at, max_uses, use_count, is_active, created_by). The token IS the authorization: anon-callable `resolve_share_token(p_token)` (SECURITY DEFINER, granted to `anon`) validates the token, resolves the registry row, and returns the resource JSON — deliberately bypassing `iam.has_access` (which refuses anon). It does NOT touch the resource's `visibility` (that would leak to logged-in org members via `has_access`); it strips `embedding`/`search_tsv`/`search_vector`. Owner RPCs: `create_share_link` / `list_share_links` / `revoke_share_link`. RLS: owner-only direct table access; anon reaches it ONLY through the RPC. FE: `utils/permissions/shareLinks.ts` + `ShareLinkPanel` (in the Public tab) + public route `app/(public)/s/[token]/` (server resolve → `SharedResourceView` dispatcher: note renderer via `BasicMarkdownContent`, generic `EntityCard`-style fallback for any type, + a "Create your own" acquisition CTA). Verified live: anon resolves a note token and reads content, embedding stripped.
  2. **In-app DM on share.** `shareWithUser` now also fires a fire-and-forget DM (lazy `sendDirectActionMessage`) carrying a `resource_shared` `action_data` kind → `ResourceSharedCard` (message-action registry) renders a clickable `EntityCard` ("X shared a Note with you", opens the resource). Replaces the deleted note "accept a shared link" flow (grants are immediate via RLS; the DM is the notification). `ShareWithUserOptions.resourceName` threads the title through `useSharing`.
  3. **Registry mirror fully reconciled + token/table split.** `utils/permissions/registry.ts` regenerated from the DB (all 53 active rows). Two canonical values are now distinct: `resourceType` = the entity **token** (stored in `iam.permissions.resource_type`, passed to RPCs) and `tableName`(+`schemaName`) = the **physical** table for `.from()` reads — the obsolete `physicalTable` field is gone. New `resolveResourceToken()`. Fixed a latent bug: `orgResources` filtered `iam.permissions.resource_type` on the physical table name (`resolveTableName`) instead of the token → org-shared counts silently returned 0 for canonicalized types. `usesVisibilityEnum()` now derives from `isPublicColumn == null` (registry-driven; the old hardcoded set had stale tokens `cx_conversation`/`agent_app` and missed canvas/project/thread). Parity test made schema-aware (multiple `definition` tables across schemas). Retires FOUND_DEFECTS D30.
- `2026-07-07` — **Sharing was 100%-broken for every canonicalized table; fixed at the registry + hardened the RPCs (`migrations/sharing_registry_canonical_owner_column_fix.sql`).** The 2026 canonicalization moved tables onto the base contract (`created_by` / `visibility`) but left their `platform.shareable_resource_registry` rows declaring the pre-reorg `owner_column='user_id'` / `is_public_column='is_public'`. `resolve_shareable_resource()` then handed the RPCs a column that no longer exists, so `is_resource_owner` / `get_resource_permissions` / `share_resource_with_user` threw `42703 column "user_id" does not exist` (proven live on `/notes`: `listPermissions` red error, share-with-user impossible). **Two-layer fix:** (1) **structural** — new `public.shareable_owner_column(schema,table,registry_owner)` resolves the effective owner column (registry col if it physically exists, else canonical `created_by`); `is_resource_owner`, `share_resource_with_user`, `share_resource_with_org` now use it, so a future table that canonicalizes before its registry row is updated Just Works. `make_resource_public`/`make_resource_private` only write `is_public_column` when it physically exists **and** is boolean (kills the `is_public_column='visibility'` double-set bug). (2) **data** — every active registry row realigned to its live table: stripped double-qualified `table_name` (`scraper.crawl_runs`→`crawl_runs`), deactivated rows whose table was dropped (`prompt`, `prompt_actions`, `pdf_redaction_audits`, `redaction_mapping`, `scope_*_suggestion`, `user_analysis_preferences`), `owner_column`→`created_by` where the declared col was gone (`note`, `conversation`, `workflow`), `is_public_column`→NULL wherever the table has the `visibility` enum. Verified live end-to-end for `note` (owner check, share-with-user, list, public/private toggle, revoke, **grantee RLS-visible**). TS mirror + snapshot synced for `note`/`conversation`/`workflow`. **Known pre-existing debt (NOT this bug):** the TS mirror (`utils/permissions/registry.ts`) is still badly drifted from the DB registry (missing rows `code_file`/`fc_card`/`fc_set`/`dm_conversation`/`project`/`thread`/`war_room`/`research_*`/`note_folder`/`agent_card`/`feature_doc`/`studio_session`/`wc_claim`; wrong key `canvas_items`→`canvas_item`; stale rows for the now-deactivated tables) — the parity test has 38 pre-existing failures. The DB-side RPC fix means sharing works for those types regardless; the mirror reconciliation is tracked separately (see FOUND_DEFECTS).
- `2026-07-02` — **Cloud-file grant converter: GAP (1) resolved + public grants modeled honestly.** GAP (1) from the `2026-06-25` entry below is closed — `iam.permissions.expires_at` (timestamptz, nullable) now exists and the files converter (`dbRowToCloudFilePermission`) wires it through to the domain's `expiresAt` (was hardcoded `null`). Also fixed a latent bug: a **public** grant (`is_public=true`, both grantee FKs null) had been collapsed into a `granteeType:"user"` grant with `granteeId:""`, silently mislabeling "anyone with access" as an empty user grant. The file domain's `GranteeType` now includes `"public"`; public grants are excluded from member counts / avatar stacks and shown as "Anyone with access" in `PermissionsDialog`, with public toggled via the resource's visibility rather than a by-grantee revoke. GAP (2) — the `shareable_resource_registry` `cld_files` vs `platform.entity_types` `file` token mismatch for owner-side grant management — remains open DB-owner work.
- `2026-06-26` — **Sharing-grant token unified with the access model (`migrations/sharing_token_unification.sql`).** The DB canonical-RLS rollout exposed that grants are keyed on `table_name` (`notes`, `agx_agent`, `cx_conversation`) while `iam.has_access` passes the **entity token** (`note`, `agent`, `conversation`) — so a grant was silently ignored the moment a table moved onto `has_access` (proven: a shared note invisible to the grantee). Fix is structural, not a re-key: **`has_permission` is now token-agnostic** (resolves the passed token through the registry and matches grants under EITHER form), the one wrong `has_access` literal was fixed (`cx_conv_select` → `conversation`), registry `resource_type` aligned to the entity token (`cx_conversation`→`conversation`, `transcripts`→`transcript`; TS mirror + snapshot synced), and a **guard trigger** now forces `shareable_resource_registry.resource_type = entity_types.token` for governed tables so the two registries can't drift. This also resolves the `rls_uses_has_permission` follow-up for any table on canonical RLS — grants now actually grant. Full finding + remaining cleanup (physical re-key, `is_public`→`visibility`, bespoke `note_shares`/`shared_with`): `docs/db_rebuild/canonical-sharing-unification.md`.
- `2026-06-25` — **File grants cut over to `public.permissions` (canonical) on the cloud-file FE read path.** Per the canonical DB cutover (§1a of `docs/db_rebuild/03-app-agent-cutover-instructions.md`), `features/files` stopped reading the canonical-duplicate legacy cld_ file-permission table and now reads grants from `public.permissions` (`resource_type='file'`). Note this partially supersedes the `2026-06-24` entry below: the cloud-file feature's permission *reads* are now canonical `permissions` rows, even though the `shareable_resource_registry` row for files still carries `rls_uses_has_permission=false` (the `cld_files` table's own RLS resolver + `cld_share_links` are unchanged). **Two DB-owner GAPs flagged:** (1) `public.permissions` has no `expires_at` — file-grant expiry unrepresentable on canonical; (2) registry token mismatch — `shareable_resource_registry` knows `cld_files` but the canonical resolver/`platform.entity_types` use token `file`; reconcile so owner-side grant management on `permissions` for `resource_type='file'` authorizes via `is_resource_owner`.
- `2026-06-24` — Repoint the "files" shareable resource off the phantom `user_files` table (a never-used duplicate, now dropped) onto the real cloud file system `cld_files`. Registry row + TS mirror + snapshot now use `resource_type`/`table_name` = `cld_files`, `owner_column` = `owner_id`, `url_path_template` = `/files/f/{id}`. **`rls_uses_has_permission` flipped to `false`**: `cld_files` enforces its OWN model (`cld_user_has_permission_grant` + `cld_file_permissions`/`cld_share_links`), so a generic `permissions` row would NOT grant cloud-file access — use the cld_* share system. No file shares existed in `permissions`, so nothing orphaned. Fixed all consumers (org files page, FilePeek, kg-suggestions source preview, resource-catalogue, ProjectReferences/ShareModalWindow maps) to query `cld_files` with `file_name`/`size_bytes` + `deleted_at IS NULL`. Migration: `migrations/sharing_resource_registry_repoint_files_to_cld_files.sql`. (Note: parity test has 2 pre-existing unrelated failures — `transcripts` row mismatch + ~22 live registry rows never mirrored to the TS file; out of scope here.)
- `2026-06-18` — Fix public/private switch not updating after toggle: `useSharing()` now tracks `isPublic` and refreshes visibility alongside permissions after mutations; `useSharingStatus()` exposes `refresh()` + optional `enabled` gate. ShareModal/ShareModalWindow/AgentSharePanel consume `isPublic` from `useSharing`; ShareButton re-fetches status on modal close.
- `2026-06-06` — Module rules + registry roles. Added `content_role` + `is_scopeable` to `shareable_resource_registry` (seeded). New `org_module_settings` table + RLS + `set_org_module_setting` RPC (owner/admin). `share_resource_with_org` now enforces `members_can_add` (block) + `requires_approval` (→ `pending`), defaults preserving prior behavior. FE: `features/organizations/orgModuleSettings.ts`, live `OrgModuleSettings` matrix. Migration: `migrations/org_module_settings_and_registry_roles.sql`.
- `2026-06-06` — Org-share moderation. Added `status` (`active`/`pending`/`rejected`) + `reviewed_by` / `reviewed_at` / `review_note` to `permissions`, a `permissions_org_status_idx`, and the `review_org_share(permission_id, status, note)` SECURITY DEFINER RPC (org owner/admin gated). `has_permission` and `check_resource_access` now exclude `status = 'rejected'` org/user grants (single additive `COALESCE(status,'active') <> 'rejected'` clause each — default-safe, no behavior change for existing grants). FE helpers in `utils/permissions/orgModeration.ts`. Lets org admins reject resources members contribute to the org from the org workspace v2 review queue. Migration: `migrations/perm_org_share_moderation.sql`.
- `2026-04-29` — codex: registry-driven sharing. Created `shareable_resource_registry` (DB) + TS mirror + parity test. Refactored all 9 sharing RPCs to consume `resolve_shareable_resource()`. Added validation trigger on `permissions.resource_type`. Removed legacy `getTableName()` and inline `resourcePaths` map. Documented `rls_uses_has_permission` gaps for follow-up.
- `2026-04-22` — claude: initial FEATURE.md extracted from README.md.

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change to sharing — new `ResourceType`, new RPC, new component, changed invariant — update this file's Data model / Invariants / Change log and keep `README.md` in sync with any new integration pattern. A stale sharing doc cascades into every feature that plugs into it.
