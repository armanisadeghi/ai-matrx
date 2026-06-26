# War Room — Canonical Cutover (BREAKING). Frontend + Backend update now.

Status: live on `txzxabzwovsujtloxrus`. Old paths removed, no compat layer. This doc is the contract; it now matches the live DB exactly.

## Big picture — the layering (read this first)
We are building ONE shared substrate that every feature reuses, and keeping features thin on top of it. Know which layer a thing lives in:

- **`platform`** = the universal substrate, shared by ALL features. Nothing feature-specific lives here.
  - `platform.associations` — the single M2M spine. Every "X relates to Y" edge in the whole system.
  - `platform.entity_types` — the registry/module catalog (token → table, default visibility, is_component, category).
  - `platform.entity_relationships` — declared containment/composition edges that drive access cascade.
- **`iam`** = the access layer, shared by ALL features.
  - `iam.has_access(type, id, required)` — the one access decision. RLS and backend both call it.
  - `permissions` (grants/sharing), `iam.memberships`, `organization_members`, `iam.has_org_access`.
- **`public`** = the FEATURES themselves, including war room.
  - `wr_sessions`, `wr_threads` — the war room tables.
  - `public.war_room_threads()`, `public.thread_contents()` — the war room read API (feature-owned, PostgREST-exposed).

War room is just the first feature ported onto the substrate. It owns its tables and RPCs in `public`; it *uses* the spine/registry/resolver. It never puts anything in `platform`/`iam`.

## Renamed / removed (stop using immediately)
- `wr_tiles` → **`wr_threads`**. `wr_sessions.active_tile_id` → **`active_thread_id`**.
- Dropped columns: `wr_threads.session_id`, `wr_threads.project_id`, `wr_threads.task_id`, `wr_sessions.project_id`, `wr_sessions.is_public`. Their truth moved (see below). Do not reintroduce.
- Dropped views: all `ctx_war_room_*`, and the `wr_tiles` shim.
- In `graveyard` (do not reference): `wr_assignments`, `wr_tile_notes`, `wr_tile_audio_sessions`, `wr_tile_attachments`.

## Tables (current columns)
- `wr_sessions` (war room): `id, user_id, organization_id, title, description, icon, color, context_scope_ids, active_thread_id, last_opened_at, is_deleted, created_at, updated_at, anchor_type, anchor_id, created_by, updated_by, version, visibility`.
- `wr_threads` (thread): `id, user_id, note_id, context_organization_id, context_scope_ids, active_tab, is_pinned, is_hidden, position, title, is_deleted, created_at, updated_at, flavor, anchor_type, anchor_id, organization_id, created_by, updated_by, version, visibility`.
- `note_id`, `flavor`, `active_tab`, `is_pinned`, `is_hidden`, `active_thread_id` are feature-owned UI state — keep using them. `flavor` may be derived from `anchor_type` if you prefer; your call.

## Membership, content, anchor — where each truth lives
- **Room ↔ thread membership** (M2M; a thread may be in many rooms or none): `platform.associations` edge `thread -> war_room`. Attach = insert that edge; detach/orphan = delete it.
- **Thread content**: associations edges `note -> thread`, `studio_session -> thread`, `file -> thread`. Direction is always **child -> parent** (`source -> target`). Write content by inserting/deleting edges.
- **Room ↔ project**: associations edge `war_room -> project`. (No more `project_id` column.)
- **Anchor**: on the row — `anchor_type` ∈ (`project`,`task`,`canvas`) + `anchor_id`. Drives the Dynamic tab. Never an association.

## Read API (feature-owned, in `public`)
- `supabase.rpc('war_room_threads', { room_id })` → thread ids in a room.
- `supabase.rpc('thread_contents', { thread_id })` → `(module_type, module_id, origin, anchor_type, anchor_id)`.
  - `origin`: `thread` (own) or `anchor` (inherited from the anchored project/task).
  - Tabs by `module_type`: `note`→Notes, `studio_session`→Audio, `file`→Files, `conversation`/`agent`→Agents; anchor → Dynamic. Unmapped (e.g. `rs_topic`) → Research/ignore.
- Both run as the caller (RLS-respecting). They read the spine; they do not bypass access.

## Access (RLS live)
- One function: `iam.has_access(type, id, required)` (`viewer`<`editor`<`admin`). Every `wr_sessions`/`wr_threads` policy calls it.
- Per-row `visibility`: `private`<`internal`<`link`<`public`, default **`private`**.
- **Private = owner + explicit grant only. No project/org cascade.** Your own private rooms are still fully visible to *you* (owner always passes) — private hides them from *others*, not from you. Set `visibility='internal'` to make a room/thread org-visible.
- Share via `permissions` rows with `resource_type` `'war_room'` / `'thread'` (NOT `'ctx_war_room_sessions'`).
- Existing data: all current rooms are `private`. No bulk migration needed — owners see their own. Only flip to `internal` where you actually want org visibility.

## Backend (service role) — REQUIRED
- Service role **bypasses RLS**. Gate every war_room/thread read/write by calling `iam.has_access(type, id, required)` for the acting user, or run under the user's JWT. Do not reimplement access logic.
- The overnight "Dream" job runs with no session: execute it **as the room owner** so it only synthesizes what the owner can see.

## Frontend implementation (locked 2026-06-25)

- **Orphan inbox:** `/war-room/all` — dedicated "Unassigned" section/card. Browse-only: list threads with no `thread → war_room` edge; actions = attach to existing room or open in a new room for full interaction. Not a DB row.
- **`active_thread_id`:** Keep — persist/restore focused thread on room open (replaces `active_tile_id`).
- **`note_id` on `wr_threads`:** Still live; keep reading/writing for now (feature UI state per table list above). **Pending DB drop** — frontend will move to `note → thread` association only once column is removed. Do not add new logic that depends on it long-term.
- **`flavor`:** Dropping — `anchor_type` (`canvas`|`project`|`task`) is the single discriminator. UI picker maps `canvas` ↔ label "thread".
- **Standards cleanup (DB agent, in flight):** drop `user_id` (use `created_by`), `context_organization_id`, `context_scope_ids` → scope associations, `note_id` → note association, `is_pinned`/`is_hidden` → `user_entity_state`, `is_deleted` → `deleted_at`, dead `wr_assignment_session_id` RPC.