# App Cutover — Done (frontend lane)

Concise, append-only record of **frontend/app** cutover work that is shipped, so the DB agent and I never double-up. DB-side status lives in `db-status.md`; this is the app mirror. One line per item: what + where + verify.

## Shipped
- **ctx_ junctions — FE fully off all 6.** Chokepoint services own the canonical homes: `membershipsService` (`mbr_*`→`iam.memberships`), `invitationsService` (`inv_*`→`iam.invitations`), `commentsService` (`cmt_*`→`platform.comments`); task-assoc RPCs read `platform.associations`. Consumers migrated (projects, tasks, invitations accept, hierarchy). `rg` for the 6 junction tables = 0 in app code. *Impersonation-verified.*
- **cld_ file permissions — reads on canonical.** Frontend reads file grants from `public.permissions` (`resource_type='file'`); realtime sub + converters repointed; enum `viewer|editor|admin` → domain `read|write|admin`. Grant **writes stay on the Python REST surface** (aidream — not app). Dead `cld_user_group*` code removed. *(commit 846ee712d)*
- **Stale cutover comments** updated to name the canonical `platform.associations` bridge.
- **cx_conversation FE field-swap — shipped.** Sharing now writes `visibility` directly (was a silent no-op: the shared sharing service routed conversation toggles through `make_resource_public/_private`, which only set the now-ignored `is_public`). Fix in `utils/permissions/service.ts` (`VISIBILITY_ENUM_RESOURCE_TYPES` → direct `visibility` write; other ~14 types unchanged). Ownership reads → `created_by`; access via RLS + `created_by===me` (no client `has_access` grant; `public.has_permission` only checks the grants table, not `visibility`). Verified: owner history 200/5 convos, sharing round-trip via MCP. **→ DB can now drop `cx_conversation.is_public`/`user_id`.**

- **`cld_` → `files` schema — FE cutover shipped.** All `cld_*` table access moved to the `files` schema (prefix dropped) via `supabase.schema('files').from('<name>')`; one typed helper `features/files/filesDb.ts`; realtime `postgres_changes` filters flipped to `schema:'files'`; type refs now resolve via `Database['files']`. Two dynamic-table registries (`utils/permissions/registry.ts`, `features/organizations/resource-catalogue.ts`) gained optional `schemaName`/`physicalTable` so the `files` entry routes through `.schema()` while keeping its grant/`resource_type` key. `db-types` script now pulls `public`+`files`+`workflow`; types regenerated. `cld_file_permissions` untouched (stays public; FE already on `public.permissions`). **`wf_`→`workflow`: 0 FE refs, nothing to do.** Verified: grep clean, full type-check 0 new errors.
- **Files made FULLY canonical (FE aligned).** DB canonicalized `files.files`/`files.folders` (owner_id→`created_by`, visibility free-text→`platform.visibility` enum [`shared`→`link`], `folder` entity + containment, sharing via `public.permissions` `resource_type` `file`/`folder`, bespoke perms OFF). FE: reads `created_by`; visibility enum mapped; token `cld_files`→canonical `file` + new `folder` in the permissions registry; `file`/`folder` added to `VISIBILITY_ENUM_RESOURCE_TYPES` (sharing writes `visibility` directly); `isResourceOwner` resolves files schema. REST/RPC `owner_id` sites (Python `FileRecord`, `cld_get_user_file_tree`) correctly left. Verified type-clean.
- **notes visibility expand (FE aligned).** `notes` gained the `visibility` enum column → added `visibility` to the 3 NoteRecord construction sites (default `private`).
- **cx_conversation `is_public`/`user_id` DROPPED (DB) → FE caught up.** Removed the deprecated `userId`/`isPublic` mirrors; fixed 3 hard breaks the drop surfaced (cx-chat request INSERT, voiceTranscriptWriter, cx-dashboard filter → `created_by`/`visibility`). Other cx_ children's own `user_id` untouched. type-check 0; parity 45/45. *(commit b7f35c983)*

## Live verification (port 3007, real data, admin session)
- **WORKS:** file browser (real folders + recents via `get_user_file_tree`), folder nav, side-panel file viewer, **chat** (canonicalized `cx_conversation`, real messages load). **`files` schema exposure CONFIRMED** (403s, not 404/PGRST106, prove PostgREST resolves it).
- **BROKEN — KNOWN_DEFECTS D18 (DB lane):** `files.share_links` + `files.file_versions` return **403 to the owner** — canonical RLS pass not applied (1–2 policies vs 5 on `files.files`/`folders`). Cascades to full-page `/files/f/[id]` "File not found". Fix = `iam.apply_rls` v2 on those two.
- **FE fix shipped:** `SingleFileShell` no longer silently swallows the fetch error (loud-recovery) — surfaces RLS/403 instead of a misleading "not found".
- **Not a cutover issue:** PDF byte download fails via the Python backend (`server.app.matrxserver.com`), separate.

- **Registry parity restored (40/40)** + **pre-commit hook fixed.** TS `SHAREABLE_RESOURCE_REGISTRY` now mirrors all 40 DB rows (was 20 — pre-existing drift the honest snapshot regen exposed); parity test 45/45. Fixed `check-doctrine` `execSync` ENOBUFS (no `maxBuffer`) that was silently aborting commits on the large types diff.

**→ Files/notes cutover CLOSED on the FE.** (Remaining: D18 RLS = DB agent, reported done; browser spot-check pending.)

## Flags for the DB / your side
- **Registry data-quality (from parity sync):** `folder` `url_path_template` (`/files/folder/{id}`) ≠ live route (`/files/folders/`); `wf_trigger` template has two `{id}` but the consumer replaces only the first; 3 list/settings rows have no `{id}` (fine). Reconcile in the DB registry.
- **PostgREST must expose the `files` schema** (`db-schemas` setting) for `.schema('files')` to resolve at runtime — DB-config side.
- **File resource token has two names floating:** canonical `entity_types`/DB-registry token is `file`, but the FE permissions registry + `shareKey` still use `cld_files` (resolves today via `resolve_shareable_resource` table_name match). Reconcile to `file` when canonicalizing the other roots.
- **`types/database.types.ts` is stale for `cx_conversation`** (missing `visibility`; FE worked around with a derived type). Regenerate `pnpm db-types` when convenient (held off — concurrent sessions).
- **`shareable_resource_registry` + `make_resource_*` RPCs still name `is_public`/`user_id` for `cx_conversation`** — FE bypasses them for this type; align registry/RPCs to `visibility`/`created_by` when canonicalizing the other roots.

## Deferred / not app-lane
- cx_ children + other roots, wf_, ctx_scope_assignments DB readers → **DB agent**.
- cld_ grant-WRITE path + `cld_events`→`log_activity` → **aidream (Python REST)**, not the React app.
- Schema-per-subsystem rename → after the 4 target conflicts are resolved; FE adopts new schema-qualified types when the DB lands them.
