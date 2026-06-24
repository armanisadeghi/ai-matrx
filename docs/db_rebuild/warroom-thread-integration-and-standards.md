# War Room / Thread Integration + File-ID Standard + Layered Fetch (notes)

> What's applied to the DB now, the naming decision, the resource→thread edge map, the file-id-not-path standard, and the layered-fetch RPC design (the last is design notes for the rewrite, not built).

## 1. Naming — DECIDED: "thread"
"Tile" was a rendering concept that leaked into the data model; "thread" is the domain concept (a work-stream holding resources + a conversation). Canonical token is **`thread`** everywhere from now. The table rename `ctx_war_room_tiles → ...threads` happens in the schema-reorg wave. Your `ctx_war_room_assignments` table already used `thread`/`room`, so this is consistent with where you were heading.

## 2. Model (two container levels, one association system)
```
WAR ROOM (ctx_war_room_sessions)        token: war_room   — shared level
  │ contains many
  ▼
THREAD   (ctx_war_room_tiles)           token: thread     — primary resource container
```
- **Most resources attach to a THREAD.** Resources shared across the whole room (shared notes/audio/files, and the **room-level agent's cx_conversations**) attach to the **WAR ROOM**.
- Both are now first-class association targets. The room-level agent conversation is just `source=conversation → target_type='war_room'`.

## 3. Applied to the DB now (non-destructive; old tables untouched)
- `platform.associations.target_type` widened to include `thread`, `war_room`.
- `platform.entity_types` registered: `thread`, `war_room`, `studio_session`, `transcript`.
- **Backfilled all FIVE legacy mechanisms** (`ctx_war_room_assignments`, tile direct FKs `task_id`/`note_id`/`project_id`, `ctx_war_room_tile_notes`, `ctx_war_room_tile_audio_sessions`) into `platform.associations`. Result: **103 edges** — thread← studio_session 34, note 31, project 20, task 14, file 2; war_room← project 2.
- Token normalization applied: legacy `room → war_room`, `user_file → file`.

The five old tables remain live; the new code reads/writes `platform.associations` and the old ones get retired in cleanup.

## 4. Resource model — associate to the top-level resource, derive the content
A thread associates with the **top-level resource**, and content underneath is reached by traversal + a resolver — not by associating each fragment.
- **Audio:** thread → `studio_session`. The session resolver MUST return: **cld_file id (never a path)**, raw transcript, clean transcript, custom saves, the assistant `cx_conversation`, duration/status. (`studio_sessions.transcript_id → transcripts.segments`; `audio_storage_path` becomes a cld_file id — see §5.)
- **Files:** thread → `file` (cld_files id). The resolver returns the extracted content (raw/clean) from the file's processing, since that's what's actually wanted — not the binary.
- **Others:** thread → `task` / `project` / `note` / `conversation` directly.

## 5. File reference standard (RESOLVED + systematic) — three categories that must NEVER share a column
- **Canonical file table = `cld_files`** (10,712 rows; has `id`, `organization_id`, `file_path`, `deleted_at`). `user_files` was **empty and has been DROPPED**; the `file` token now points at `cld_files`; `get_task_associations` was repointed off `user_files`.

**Category A — our files** (anything imported into our system): referenced by a **`cld_files` id** (FK or association). NEVER a path/URL. The storage path string lives in exactly ONE place: `cld_files.file_path`.
**Category B — external references** (git repos, sources that live/change elsewhere): a URL is allowed, but the **column name must say so** (`repo_url`, `..._external_url`) AND a check must guarantee it never points at one of our own domains.
**Category C — public CDN-served assets** (podcast covers, favicons via Cloudflare): a public delivery URL, explicitly NOT a resource link; its own clearly-named column.

**Enforcement pattern (for the retrofit):** a reusable `platform._assert_external_url(text)` CHECK/trigger that rejects values matching our domain list, applied to every Category-B/C column; Category-A columns become `cld_files` FKs and the raw path is removed. Convert-vs-exempt inventory is in the handover notes.

**Convert these (our stored files → file id):** `audio_recording.file_url`/`.local_path`, `ctx_task_attachments.file_path`, `flashcard_images.file_path`, `notes.file_path`, `studio_sessions.audio_storage_path`, `studio_recording_segments.audio_path`, `transcripts.audio_file_path`/`.video_file_path`, `skl_resources.storage_path`, `attachments.file_url`, `sms_media.storage_path`, `user_files.storage_path` (folds into canonical), `rs_media`/`file_pages`/`pdf_unified_pages`/`file_analysis` thumbnails.

**Exempt (genuine external URLs / non-storage — stay strings):** favicons, `git_url`/`repo_url`, websites, `avatar_url`/`logo_url`, `og_image_url`, scraping `target_url`/`response_url`, MCP `endpoint_url`/`docs_url`, podcast external `audio_url`/`video_url`. Also exempt: **code-repo-relative paths** (`cx_code_message_file.file_path`, `cx_tool_call.file_path`) and the canonical file table's own `file_path` (that's where the path legitimately lives).

## 6. Layered fetch RPCs — DESIGN NOTES (for later; not built)
Three tiers so we only fetch what's needed:
- **Tier 1 — War room launch:** hydrate basics + counts + visible top-level association *references* (sessions, conversations, files, by type with counts) — **no core data**. One RPC: `war_room_hydrate(war_room_id)` → room meta, threads list (id/title/flavor/position), and per-thread association counts grouped by source_type, plus room-level associations.
- **Tier 2 — Thread activates:** `thread_hydrate(thread_id)` → that thread's full association list grouped by type (resolved enough to render tabs + counts), still not the heavy content.
- **Tier 3 — Tab activates:** `thread_tab_fetch(thread_id, tab)` where tab ∈ {project, tasks, notes, transcripts, chat, files} → fully fetch + resolve that resource type (e.g. transcripts tab → studio_session resolver returning clean text + cld_file id; files tab → file records + extracted content).
All three read `platform.associations` (+ the per-resource resolvers) and respect `iam.has_org_access`. The resolvers are where "associate to top-level, derive content" (§4) lives.

## 7. Open confirmations
- Canonical file table: `cld_files` vs `user_files` (§5).
- Token `war_room` vs `room` (I chose `war_room`; your rewrite sets the standard).
- Keep all five legacy war-room tables live during transition, retire in cleanup (assumed yes).
