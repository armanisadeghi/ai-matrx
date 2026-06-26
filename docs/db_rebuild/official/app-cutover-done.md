# App Cutover — Done (frontend lane)

Concise, append-only record of **frontend/app** cutover work that is shipped, so the DB agent and I never double-up. DB-side status lives in `db-status.md`; this is the app mirror. One line per item: what + where + verify.

## Shipped
- **ctx_ junctions — FE fully off all 6.** Chokepoint services own the canonical homes: `membershipsService` (`mbr_*`→`iam.memberships`), `invitationsService` (`inv_*`→`iam.invitations`), `commentsService` (`cmt_*`→`platform.comments`); task-assoc RPCs read `platform.associations`. Consumers migrated (projects, tasks, invitations accept, hierarchy). `rg` for the 6 junction tables = 0 in app code. *Impersonation-verified.*
- **cld_ file permissions — reads on canonical.** Frontend reads file grants from `public.permissions` (`resource_type='file'`); realtime sub + converters repointed; enum `viewer|editor|admin` → domain `read|write|admin`. Grant **writes stay on the Python REST surface** (aidream — not app). Dead `cld_user_group*` code removed. *(commit 846ee712d)*
- **Stale cutover comments** updated to name the canonical `platform.associations` bridge.
- **cx_conversation FE field-swap — shipped.** Sharing now writes `visibility` directly (was a silent no-op: the shared sharing service routed conversation toggles through `make_resource_public/_private`, which only set the now-ignored `is_public`). Fix in `utils/permissions/service.ts` (`VISIBILITY_ENUM_RESOURCE_TYPES` → direct `visibility` write; other ~14 types unchanged). Ownership reads → `created_by`; access via RLS + `created_by===me` (no client `has_access` grant; `public.has_permission` only checks the grants table, not `visibility`). Verified: owner history 200/5 convos, sharing round-trip via MCP. **→ DB can now drop `cx_conversation.is_public`/`user_id`.**

## Flags for the DB / your side
- **`types/database.types.ts` is stale for `cx_conversation`** (missing `visibility`; FE worked around with a derived type). Regenerate `pnpm db-types` when convenient (held off — concurrent sessions).
- **`shareable_resource_registry` + `make_resource_*` RPCs still name `is_public`/`user_id` for `cx_conversation`** — FE bypasses them for this type; align registry/RPCs to `visibility`/`created_by` when canonicalizing the other roots.

## Deferred / not app-lane
- cx_ children + other roots, wf_, ctx_scope_assignments DB readers → **DB agent**.
- cld_ grant-WRITE path + `cld_events`→`log_activity` → **aidream (Python REST)**, not the React app.
- Schema-per-subsystem rename → after the 4 target conflicts are resolved; FE adopts new schema-qualified types when the DB lands them.
