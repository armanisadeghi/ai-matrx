# War Room — Canonical Cutover (live contract) + integration notes

> War room is the **first feature ported onto the canonical substrate** — the worked reference for porting any feature. Status: **live** on `txzxabzwovsujtloxrus`, old paths removed, no compat layer; this doc matches the live DB. Canonical rules: `official/db-rulebook.md`. (Merged from `breaking/war-room-cutover-handoff.md` + `warroom-thread-integration-and-standards.md`, 2026-06-26.)

## Layering — know where a thing lives
- **`platform`** = universal substrate (nothing feature-specific): `platform.associations` (the single M2M spine — every "X relates to Y" edge), `platform.entity_types` (registry), `platform.entity_relationships` (declared containment/composition for access cascade).
- **`iam`** = access layer: `iam.has_access(type, id, required)` (the one access decision — RLS *and* backend call it), `permissions`, `iam.memberships`, `organization_members`, `iam.has_org_access`.
- **`public`** = the features themselves: `wr_sessions`, `wr_threads`, and war room's read API (`war_room_threads()`, `thread_contents()`). War room owns its tables/RPCs in `public`; it *uses* the spine/registry/resolver, never writes to `platform`/`iam`.

## Naming — DECIDED: "thread"
"Tile" was a rendering concept that leaked into the data model. Canonical token is **`thread`** everywhere. Room = `war_room`. `wr_tiles → wr_threads`, `active_tile_id → active_thread_id`.

## Renamed / removed (do not reintroduce)
- `wr_tiles` → **`wr_threads`**; `wr_sessions.active_tile_id` → **`active_thread_id`**.
- Dropped columns: `wr_threads.session_id`, `.project_id`, `.task_id`; `wr_sessions.project_id`, `.is_public`. Truth moved (below).
- Dropped views: all `ctx_war_room_*`, the `wr_tiles` shim.
- In `graveyard` (do not reference): `wr_assignments`, `wr_tile_notes`, `wr_tile_audio_sessions`, `wr_tile_attachments`.

## Tables (current columns)
- `wr_sessions` (war_room): `id, user_id, organization_id, title, description, icon, color, context_scope_ids, active_thread_id, last_opened_at, is_deleted, created_at, updated_at, anchor_type, anchor_id, created_by, updated_by, version, visibility`.
- `wr_threads` (thread): `id, user_id, note_id, context_organization_id, context_scope_ids, active_tab, is_pinned, is_hidden, position, title, is_deleted, created_at, updated_at, flavor, anchor_type, anchor_id, organization_id, created_by, updated_by, version, visibility`.
- `note_id, flavor, active_tab, is_pinned, is_hidden, active_thread_id` are feature-owned UI state — keep.

## Where each truth lives
- **Room ↔ thread membership** (M2M; a thread may be in many rooms or none): `platform.associations` edge `thread -> war_room`. Attach = insert; detach/orphan = delete.
- **Thread content**: edges `note -> thread`, `studio_session -> thread`, `file -> thread`. Direction is always **child -> parent** (`source -> target`).
- **Room ↔ project**: edge `war_room -> project` (no `project_id` column).
- **Anchor**: on the row — `anchor_type ∈ (project, task, canvas)` + `anchor_id`. Drives the Dynamic tab. Never an association.

## Read API (feature-owned, in `public`, RLS-respecting)
- `rpc('war_room_threads', { room_id })` → thread ids in a room.
- `rpc('thread_contents', { thread_id })` → `(module_type, module_id, origin, anchor_type, anchor_id)`. `origin`: `thread` (own) or `anchor` (inherited). Tabs by `module_type`: `note`→Notes, `studio_session`→Audio, `file`→Files, `conversation`/`agent`→Agents; anchor → Dynamic; unmapped (e.g. `rs_topic`) → ignore.

## Access (RLS live)
- One function: `iam.has_access(type, id, required)` (`viewer<editor<admin`). Every `wr_sessions`/`wr_threads` policy calls it.
- Per-row `visibility`: `private<internal<link<public`, default **`private`**. **Private = owner + explicit grant only, no project/org cascade** (owner always sees their own; `internal` = org-visible).
- Share via `permissions` rows with `resource_type` `'war_room'` / `'thread'` (NOT `'ctx_war_room_sessions'`).
- Existing data: all rooms `private`; no bulk migration.

## Backend (service role) — REQUIRED
Service role bypasses RLS → gate every war_room/thread read/write by calling `iam.has_access(...)` for the acting user, or run under the user's JWT. The overnight "Dream" job runs **as the room owner**.

## Frontend (locked 2026-06-25)
- **Orphan inbox** `/war-room/all` — browse-only list of threads with no `thread → war_room` edge; attach to a room or open in a new one. Not a DB row.
- **`active_thread_id`** — persist/restore focused thread (replaces `active_tile_id`).
- **`note_id` on `wr_threads`** — still live, keep reading/writing; **pending DB drop** → move to `note → thread` association once removed. Don't add long-term logic depending on it.
- **`flavor`** — dropping; `anchor_type` (`canvas`|`project`|`task`) is the single discriminator (`canvas` ↔ label "thread").
- **Standards cleanup (DB agent, in flight):** drop `user_id` (use `created_by`), `context_organization_id`, `context_scope_ids`→scope associations, `note_id`→note association, `is_pinned`/`is_hidden`→`user_entity_state`, `is_deleted`→`deleted_at`, dead `wr_assignment_session_id` RPC.

---

## Resource model — associate to the top-level resource, derive content
A thread associates with the **top-level resource**; content underneath is reached by traversal + a resolver, not by associating each fragment.
- **Audio:** thread → `studio_session`. The session resolver returns: **cld_file id (never a path)**, raw transcript, clean transcript, custom saves, the assistant `cx_conversation`, duration/status.
- **Files:** thread → `file` (cld_files id). Resolver returns extracted content (raw/clean), not the binary.
- **Others:** thread → `task`/`project`/`note`/`conversation` directly.

## Layered-fetch RPCs — DESIGN NOTES (for the rewrite; not built)
Three tiers, fetch only what's needed; all read `platform.associations` + per-resource resolvers, respecting `iam.has_org_access`:
- **Tier 1 — room launch:** `war_room_hydrate(war_room_id)` → room meta, threads list (id/title/flavor/position), per-thread association counts by `source_type`, room-level associations. No core data.
- **Tier 2 — thread activates:** `thread_hydrate(thread_id)` → that thread's full association list grouped by type (enough to render tabs + counts).
- **Tier 3 — tab activates:** `thread_tab_fetch(thread_id, tab)` for tab ∈ {project, tasks, notes, transcripts, chat, files} → fully resolve that resource type.

## File reference standard (the file-id-not-path rule, war-room origin)
Three categories that must **NEVER share a column** (also captured for the rulebook in `_TO_FOLD_INTO_OFFICIAL.md`):
- **A — our files:** a `cld_files` id (FK/association). NEVER a path/URL. The path string lives only in `cld_files.file_path`.
- **B — external references** (git repos, sources elsewhere): a URL allowed, but the **column name must say so** (`repo_url`, `*_external_url`) AND a check guarantees it never points at our domains.
- **C — public CDN assets** (covers, favicons): a delivery URL in its own clearly-named column.
- Enforcement: reusable `platform._assert_external_url(text)` CHECK on every B/C column; A columns become `cld_files` FKs.
- **Convert (our stored files → file id):** `audio_recording.file_url`/`.local_path`, `ctx_task_attachments.file_path`, `flashcard_images.file_path`, `notes.file_path`, `studio_sessions.audio_storage_path`, `studio_recording_segments.audio_path`, `transcripts.audio_file_path`/`.video_file_path`, `skl_resources.storage_path`, `attachments.file_url`, `sms_media.storage_path`, page/thumbnail tables.
- **Exempt (genuine external / non-storage):** favicons, `git_url`/`repo_url`, websites, `avatar_url`/`logo_url`, `og_image_url`, scraping `target_url`/`response_url`, MCP `endpoint_url`/`docs_url`, podcast external `audio_url`/`video_url`, code-repo-relative paths (`cx_code_message_file.file_path`, `cx_tool_call.file_path`), and `cld_files.file_path` itself.
