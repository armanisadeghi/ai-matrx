# DB Rebuild — Running Handover Notes (Frontend + Backend)

> Living document. Captures the **contracts** the teams must follow and **what's already live in the DB**, so the final FE/BE handover writes itself. Append as decisions land.

## The contracts (rules to build against)
1. **Relationships live in `platform.associations`.** Read and write relationships there — not via scattered `project_id`/`task_id` FK columns and not via the old per-feature M2M tables. During transition, one-directional mirror triggers keep the **old columns → associations** in sync, so reading `platform.associations` is already safe/complete for project & task. New code should **write** associations directly.
2. **Files are `cld_files` ids — never paths.** Three categories that must never share a column: (A) our files → `cld_files` id (FK/association); (B) external refs (git/website) → a clearly-named `*_url` column that is checked to never point at our own domains; (C) public CDN assets (covers/favicons) → their own clearly-named delivery-URL column. `user_files` is dropped; `cld_files` is canonical.
3. **"Thread" is the word.** Room = `war_room` (`ctx_war_room_sessions`), Thread = `thread` (`ctx_war_room_tiles`, to be renamed). Resources attach to a **thread**; room-wide things (shared notes/audio/files, the room-level agent's `cx_conversations`) attach to the **war_room**.
4. **`org_id` is the tenancy owner, not an association.** It stays a real column on every table (standardized, eventually `NOT NULL`). Never model org as an association.
5. **Association vs Active Context never mix.** Durable "belongs to" → `platform.associations`. Runtime "what I'm focused on now" → active-context state. Different storage, different UI.
6. **Standard columns** (coming via base retrofit, per `db-core-standards-and-automation.md`): `id, org_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata` — uniform on every Base-1 table; `updated_at`/`version` are trigger-maintained; soft-delete via `deleted_at`.

## What's LIVE in the DB now (non-destructive foundation)
- Schemas: `iam, knowledge, work, platform, history, internal`.
- `platform.entity_types` (registry; `file → cld_files`, plus scope/scope_type/context_item/project/task/note/agent/conversation/prompt/thread/war_room/studio_session/transcript).
- `platform.associations` — unified edge table, RLS (org-first via `iam.has_org_access`). Backfilled ~234 edges incl. war-room (thread/war_room targets). Coexists with old tables.
- **Mirror triggers** (`_mirror_proj` ×21, `_mirror_task` ×12) on the litter tables → auto-sync project/task FK writes into associations (one-directional, proven).
- War-room: all five legacy relationship mechanisms backfilled into associations (thread← studio_session/note/project/task/file; war_room← project).
- `history.row_versions` (partitioned) + shared triggers `platform._touch_row` / `_stamp_actor` / `_version_capture` (defined; attach per-table during transition — history capture proven on a POC).
- `iam.has_org_access(uuid)` RLS helper; `platform._base_entity` template; `platform._mirror_fk_to_assoc` generic mirror.

## Backend team
- Repoint relationship writers/readers to `platform.associations`; for war room + transcription, write associations **directly** in the rewrite (no mirror needed there).
- Build the **layered-fetch RPCs** (Tier 1 war_room launch → counts + top-level refs; Tier 2 thread → its association list; Tier 3 tab → full resolve). Specced in `warroom-thread-integration-and-standards.md`.
- **studio_session resolver contract:** given a session, return `cld_files` id (not path), raw transcript, clean transcript, custom saves, assistant `cx_conversation`, status/duration.
- Convert Category-A file paths → `cld_files` ids; add `platform._assert_external_url` checks to Category-B/C columns. Inventory: convert `audio_recording.file_url/local_path`, `ctx_task_attachments.file_path`, `flashcard_images.file_path`, `notes.file_path`, `studio_sessions.audio_storage_path`, `studio_recording_segments.audio_path`, `transcripts.audio_file_path/video_file_path`, `skl_resources.storage_path`, `attachments.file_url`, `sms_media.storage_path`, page/thumbnail tables. Exempt: external URLs, code-repo-relative paths, `cld_files.file_path` itself.
- Attach `_version_capture('<token>')` per table as you touch it (exclude content-heavy + extreme-churn tables, or extend the strip-list).

## Frontend team
- Read relationships through the new RPCs (associations-backed); render by `source_type` with counts; lazy-load by tier.
- Use **thread** vs **war room** consistently (kill the tile/thread UI confusion).
- File references are `cld_files` ids resolved via the file service; never render or store raw paths.

## Removed / changed objects (for the cleanup ledger)
- DROPPED: `user_files` (empty; policies + `update_user_files_updated_at` trigger went with it).
- CHANGED: `get_task_associations` (removed dead `user_files` branch; now `cld_files`-only). `cld_count_user_files` unchanged (name only; already used `cld_files`).
- REGISTRY: `file` token repointed `user_files → cld_files`.

## Open decisions
- Token `war_room` vs `room` (chose `war_room`).
- Reference cardinality (single vs multi) for attribute reference-values; required-slot enforcement style.
- History retention window + per-table version opt-outs; whether to enforce `entity_types` via FK.
- The 15 null-`org_id` legacy task edges + remaining text-typed litter FKs (handled per-table during transition).
