# App Cutover — Done (frontend lane)

Concise, append-only record of **frontend/app** cutover work that is shipped, so the DB agent and I never double-up. DB-side status lives in `db-status.md`; this is the app mirror. One line per item: what + where + verify.

## Shipped
- **ctx_ junctions — FE fully off all 6.** Chokepoint services own the canonical homes: `membershipsService` (`mbr_*`→`iam.memberships`), `invitationsService` (`inv_*`→`iam.invitations`), `commentsService` (`cmt_*`→`platform.comments`); task-assoc RPCs read `platform.associations`. Consumers migrated (projects, tasks, invitations accept, hierarchy). `rg` for the 6 junction tables = 0 in app code. *Impersonation-verified.*
- **cld_ file permissions — reads on canonical.** Frontend reads file grants from `public.permissions` (`resource_type='file'`); realtime sub + converters repointed; enum `viewer|editor|admin` → domain `read|write|admin`. Grant **writes stay on the Python REST surface** (aidream — not app). Dead `cld_user_group*` code removed. *(commit 846ee712d)*
- **Stale cutover comments** updated to name the canonical `platform.associations` bridge.

## In progress
- **cx_conversation FE field-swap** — write `visibility` (not `is_public`), read `created_by` (not `user_id`), gate via `has_access`. Unblocks the DB dropping `is_public`/`user_id`. *(subagent running)*

## Deferred / not app-lane
- cx_ children + other roots, wf_, ctx_scope_assignments DB readers → **DB agent**.
- cld_ grant-WRITE path + `cld_events`→`log_activity` → **aidream (Python REST)**, not the React app.
- Schema-per-subsystem rename → after the 4 target conflicts are resolved; FE adopts new schema-qualified types when the DB lands them.
