# Cloud Files — Requests for the Python team

> **Owned by the Frontend team. The Python team reads this; we update it.**
>
> Anything the Python team wants to broadcast to us goes in
> [from_python/UPDATES.md](../from_python/UPDATES.md).
>
> This is the single canonical doc for everything the FE needs from
> the BE. Items move from `Open` → `Resolved` when the corresponding
> work ships and we've verified it on our side.
>
> Last updated: 2026-05-17 (post-audit; closed twelve items the Python
> team shipped between 2026-05-05 and 2026-05-17).

---

## Status legend

- 🔴 **blocking** — FE work is stalled until this lands.
- 🟡 **open** — asked, awaiting movement.
- 🟠 **deferred** — agreed not to do now; tracked for later.
- 🟢 **resolved** — shipped + verified on our side.

---

## Open items

The list is intentionally short. Every open item below is either
deferred by mutual agreement, or scoped to land alongside a product
feature that hasn't started yet. **Nothing here is blocking the FE
today.** If we discover something new and meaningful, it goes here
immediately — keeping this list lean is what makes it credible.

### 1. 🟠 Per-org tenancy

**Priority:** Deferred — schema columns added, no immediate business
need on the FE side. Will become urgent when the org product spec
lands.

**Context:** Single `owner_id` works for personal Drive. The instant
a customer says "my team needs shared folders" or "we want billing
per-org", the data model needs `organization_id` on every row.
Backend has the columns; routes are still single-owner.

**Ask:** When the org product lands, populate `organization_id` on
new uploads + add an org-aware variant of `cld_get_user_file_tree`
(or a new `cld_get_org_file_tree` RPC). The 6-arg `p_order_by` /
`p_limit` semantics from the user tree RPC should carry over so
the FE picks up the org tree with one branch change.

**Blocker?** No.

---

### 2. 🟠 Comments / annotations / file locking

**Priority:** Deferred — collaboration features for a later phase.

**Context:** No active customer ask. Listed so we don't forget when
multi-editor flows come back on the roadmap.

**Blocker?** No.

---

### 3. 🟠 Antivirus scan on upload

**Priority:** Deferred — compliance feature.

**Context:** S3 → Lambda → ClamAV (or vendor scan) on every upload
that lands in shared folders. For internal-only uploads we can
defer. Will become urgent before any enterprise customer with a
security review.

**Blocker?** No.

---

## Pending on the Python team's own roadmap

The Python team's [UPDATES.md §8](../from_python/UPDATES.md) already
self-tracks these. They're listed here only so the FE side has one
place to scan when picking the next dependency:

- **Subscriber-management REST surface for webhooks** (🟡) — `cld_webhooks`
  + `cld_webhook_deliveries` tables + dispatcher worker shipped in
  Bundle B3. Owner-side `/files/webhooks/*` CRUD is the follow-up.
  Becomes blocking the day we ship a "manage your webhooks" UI.
- **VFS: `fs_move` cross-adapter** (🟡) — same-adapter moves work; cross-adapter
  (e.g. Notes → My Files) currently 400s. Adapter-pair copy-then-delete is the follow-up.
- **VFS: Notes `list_versions` / `restore_version`** (🟡) — `note_versions`
  table exists; adapter doesn't expose them yet.
- **VFS: binary `fs_read`** (🟡) — TUS-uploaded binary content currently
  returns UTF-8-decoded bytes. Strict-binary needs a `binary: true`
  arg → base64 response shape. The cloud_files adapter already
  advertises `capabilities.binary = true` so the FE routes binary
  previews via `GET /files/{id}/url` until then.
- **Presigned PUT to S3** (⚪) — direct browser → S3 path. Big latency
  win for very-large uploads on top of the TUS path. Not urgent.

If any of these need to move ahead of the Python team's current
priorities, raise it here as a new item with concrete user impact.

---

## Resolved items

Most recent first. Concise — see [from_python/UPDATES.md §9](../from_python/UPDATES.md)
for the bundle-level changelog with commit hashes + migration files.

### 🟢 `cld_get_user_file_tree` — 5000-row default, `p_order_by`, count companion

**Resolved:** 2026-05-17 (migration 014, commit `da02e7cf`).

Default `p_limit` bumped 200 → 5000 (no more silent truncation for
ad-hoc callers). New `p_order_by` param accepts `name |
updated_at_desc | created_at_desc` (Recents UX no longer buries
fresh uploads on the last page). New `cld_count_user_files(p_user_id,
p_include_folders, p_include_deleted)` companion returns
`{files, folders, total}` for "page N of M" progress UI. Old 5-arg
overload dropped — calls now unambiguously resolve to the new
6-arg version.

**FE side:** `loadUserFileTree` paginates against the new shape and
will switch to `p_order_by: 'updated_at_desc'` for Recents-style
surfaces in a follow-up. Verified live: 6-arg signature in
`pg_proc`, `cld_count_user_files` exists.

---

### 🟢 `cld_get_user_file_tree` — public-files privacy leak closed

**Resolved:** 2026-05-17 (migration 014, commit `da02e7cf`).

Dropped `OR f.visibility = 'public'` from the file leg. RPC now
returns owner OR explicit-grant rows only. RPC also identity-locks
against `auth.uid()` (cross-user reads with someone else's `p_user_id`
throw `42501 forbidden`). Verified live: function body no longer
contains the leak; the FE defensive filter in `loadUserFileTree`
can be removed.

---

### 🟢 `system-files/` variant orphan rows — cleanup + structural prevention

**Resolved:** 2026-05-16 (migrations 012 + 013, commit `a47788d6`).

The Phase 1b/1c SOCIAL_BASELINE backfill cascade was traced (variants
re-processed as masters, up to 12 levels deep). Three layers of
defence shipped so it can't recur:

1. Write-path guard refuses any row already marked as derived.
2. Backfill `_next_batch` triple-filters by `parent_file_id IS NULL`
   + `file_path NOT LIKE 'system-files/%'` + `metadata.derived_from
   IS NULL`.
3. `cld_get_user_file_tree` / `cld_search_files` / `cld_list_trash`
   RPCs exclude `parent_file_id IS NOT NULL` and `system-files/%`.

Cleanup: 1,565 legit first-level variants got their lineage columns
stamped, 6,152 cascade-junk rows soft-deleted + S3 objects purged
(~134 MB reclaimed, zero errors). Verified live: all 1,496 remaining
alive `system-files/` rows have BOTH `parent_file_id` AND
`derivation_kind` populated; zero orphans. The FE workarounds in
`loadUserFileTree`, `loadFolderContents`, and the realtime
middleware can be removed.

---

### 🟢 Storage re-keying by `file_id` (Bundle E1 + backfill)

**Resolved:** 2026-05-17 (Bundle E1 code 2026-05-05; backfill ran
2026-05-17 against Matrx Main).

New `cld_files.canonical_storage_uri` column populated for every
alive row (6,540 / 6,540 = 100%). Storage now keyed at
`<owner>/<file_id>`, decoupled from logical `file_path`. Read paths
(download, signed URL, copy, share, thumbnail render) prefer
canonical when present and fall back to legacy. Renames + bulk
moves no longer touch S3.

---

### 🟢 TUS resumable uploads (>100 MB)

**Resolved:** 2026-05-05 (Bundle E2).

`/files/upload/tus` ships TUS Core 1.0.0 + Creation + Termination +
Creation-with-Upload, mounted alongside the buffered path.
`cld_uploads_inflight` registry maps TUS upload-ids to S3 multipart
upload-ids. Hard ceiling: 5 GB. Idempotency-key reuses in-progress
uploads. TUS uploads land directly at canonical S3 keys (no rekey
backfill needed). Thumbnails dispatch fire-and-forget on completion.

**FE side:** `tus-js-client` "just works" pointed at
`<API>/files/upload/tus` with `Authorization: Bearer <jwt>` and
`chunkSize ≥ 5 MiB`.

---

### 🟢 Range download / streaming on `/files/{id}/download`

**Resolved:** 2026-05-05 (Bundle D1; re-verified `d647c143`).

`StreamingResponse` pulls bytes directly from S3, never buffers the
full file. `Range: bytes=N-M` returns 206 with `Content-Range`.
Range past EOF returns 416. `Accept-Ranges: bytes` always
advertised. Public + CDN-configured + no version pin still 302s to
the CDN (CDN handles range natively). Ranged version-pinned reads
are still on the buffered path (rare; tracked as a future polish).

---

### 🟢 CDN-backed permanent URLs for `visibility = 'public'` files

**Resolved:** 2026-05-05 (Phase 0 + earlier).

Every response shape that carries a URL also carries `cdn_url`,
populated for public files (e.g. `Asset.variants["original"].cdn_url`,
`FileRecord.cdn_url`). The FE share-link UI now returns a true
permanent CDN URL on the "Get public link" path instead of the
expiring signed URL we used to return.

---

### 🟢 `POST /folders` accepts path-style `folder_path`

**Resolved:** 2026-05-17 (verified `da02e7cf`).

`_ensure_folder_chain` creates intermediate folders atomically.
**FE side:** the FE's `ensureFolderPath` supabase-js workaround
can be dropped.

---

### 🟢 `X-Request-Id` threaded into realtime echo payloads

**Resolved:** 2026-05-17 (commit `d647c143`).

matrx-connect middleware honours client-supplied `X-Request-Id`
(1–128 chars). Every cloud_sync write stamps `metadata.request_id`
via `_stamp_request_id`. **FE side:** the 2s timestamp-fuzzy dedup
fallback in the realtime middleware can be dropped — payloads now
carry the round-tripped request_id directly.

---

### 🟢 Webhooks / SSE for events beyond Supabase Realtime

**Resolved:** 2026-05-05 (Bundle B3) — *outbox + dispatcher only*.

`cld_events` + `cld_webhooks` + `cld_webhook_deliveries` schemas
shipped. Dispatcher worker polls unprocessed events (configurable
interval, default 5s, batch 100), HMAC-signs payloads with
`X-Cld-Signature: sha256=<hmac>`, retries with exponential backoff
(30s → 24h, 6 attempts), auto-disables after 50 consecutive failures.
Opt-in via `AIDREAM_CLD_EVENT_DISPATCHER=1`.

Subscriber-management REST surface (`/files/webhooks/*`) is a
deliberate follow-up — see the "Pending on the Python team's own
roadmap" section above. Subscriptions are managed via direct SQL
until then.

---

### 🟢 Realtime publishes `cld_share_links` events

**Resolved:** 2026-05-05 (Bundle B1).

`cld_share_links`, `cld_file_permissions`, and `processed_documents`
added to the `supabase_realtime` publication with `REPLICA IDENTITY
FULL`. Recommended FE filters in
[UPDATES.md §9](../from_python/UPDATES.md). Verified live:
publication membership confirmed.

---

### 🟢 S3 bucket CORS for browser `fetch()` of signed URLs

**Resolved:** 2026-05-05 (Bundle B4).

Canonical policy committed to `docs/cloud_files_s3_cors.json`
and applied to prod via `aws s3api put-bucket-cors`. Adds
`app.aimatrx.com`, Vercel preview origins, and localhost dev ports.
Exposes `Content-Range` + `Accept-Ranges` so Bundle D1 range
downloads work directly against S3.

**FE side:** fetch-based previewers can be migrated off the
`useFileBlob` same-origin proxy at our leisure (latency / bandwidth
win, not a correctness fix).

---

### 🟢 Server-side thumbnail / poster generation on upload

**Resolved:** 2026-05-05 (Bundle D2); massively extended through
Phase 1/1c/1d (commits 2026-05-05 through 2026-05-17).

Every file kind now gets `thumbnail_url` + `og_url` + `tiny_url`
variants on upload regardless of mime. Kind-specific extras:
`page1_url` for PDFs, `poster_url` for videos, real waveform PNGs
(pydub + Pillow) for audio. Exposed via
`Asset.variants` and as `FileRecord.thumbnail_url`. Legacy
`cld_files.thumbnail_*` columns dropped in migration 011 — wire
shape preserved via the variants resolver.

**FE side:** `MediaThumbnail` reads `file.thumbnailUrl`; grid view
shows real previews for every file kind.

---

### 🟢 RAG / processed-document integration into `/files`

**Resolved:** 2026-05-05 (Bundle C). All five sub-asks shipped.

- `GET /files/{file_id}/document` — latest processed_documents row
  anchored to a `cld_files.id`. 404s cleanly when not ingested.
- `POST /files/{file_id}/ingest` + `/ingest/stream` — file-centric
  wrappers; auto-injects `source_kind = 'cld_file'`.
- `GET /files/{file_id}/lineage-summary` — light parent + descendant
  count chip.
- `/rag/data-stores/*` — full REST surface (`GET`, `POST`, `PATCH`,
  `DELETE` + members + members-rich subresources).
- `processed_documents` added to the realtime publication; FE can
  subscribe instead of polling after ingest.

Shared service module `aidream/services/rag/processed_doc_lookup.py`
owns the cld_file → processed_documents query so both `files.py`
and the existing `document.py` route call the same code.

---

### 🟢 Virtual Filesystem Adapter — server-side parity

**Resolved:** 2026-05-05 (Bundle E3).

`/virtual/*` surface live with 11 endpoints. Six adapters registered:
`my_files`, `notes`, `code_files`, `aga_apps`, `prompt_apps`,
`tool_ui_components`. AI `fs_*` tools (`fs_read`, `fs_write`,
`fs_list`, `fs_rename`, `fs_delete`, `fs_move`, `fs_create`) wired
into the agent toolbelt. Wire standardizes on `expected_updated_at`
for optimistic concurrency; Notes adapter translates internally to
its `version: int` shape.

Three follow-ups self-tracked by the Python team (binary `fs_read`,
Notes versions, cross-adapter `fs_move`) — see "Pending on the
Python team's own roadmap" above.

---

### 🟢 Drop the legacy 1-arg overload of `cld_get_user_file_tree`

**Resolved:** 2026-05-05 (Bundle A) + 2026-05-17 (re-applied via
migration 014).

Verified live via `pg_proc`: only the 6-arg overload exists. The
`42725 function is not unique` failure mode is gone.

---

### 🟢 CORS `Access-Control-Allow-Headers` includes all upload custom headers

**Resolved:** 2026-04-26.

Starlette `CORSMiddleware` now allows the full canonical header set
(Authorization, Content-Type, Accept, X-Request-Id, X-Guest-Fingerprint,
X-Idempotency-Key, X-Cloud-Files-Bypass, plus browser-default extras).
Exposes `Last-Modified`, `Content-Range`, `Accept-Ranges`,
`Content-Disposition`. **FE side:** `X-Idempotency-Key` re-enabled
as the default on every upload.

---

### 🟢 Folder CRUD endpoints

**Resolved:** 2026-04-26.

`POST /folders`, `PATCH /folders/{id}`, `DELETE /folders/{id}` live.
FE wired in [api/folders.ts](../api/folders.ts). No browser-side
writes to `cld_folders` remain in the upload + folder-CRUD paths.

---

### 🟢 Bulk operations

**Resolved:** 2026-04-26.

`DELETE /files/bulk`, `POST /files/bulk/move`, `POST /folders/bulk/move`.
Wire envelope `BulkResponse = { results: BulkResultItem[], succeeded:
number, failed: number }`. FE thunks consume the envelope with
optimistic local apply + per-item rollback.

---

### 🟢 New endpoints wired (2026-04-26)

| Endpoint | FE consumer |
|---|---|
| `GET /files/usage` | `Files.getStorageUsage` |
| `GET /files/trash` | `Files.listTrash` |
| `POST /files/{id}/restore` | `Files.restoreFile` |
| `GET /files/search` | `Files.searchFiles` |
| `POST /files/{id}/rename` | `Files.renameFile` (drives rename + single-file move; obsoletes the old metadata-hack patch) |
| `POST /files/{id}/copy` | `Files.copyFile` |

---

### 🟢 Migrate-guest-to-user breaking contract reconciled

**Resolved:** 2026-04-26. Body shape `{ new_user_id, guest_id? }`,
fingerprint moved to required `X-Guest-Fingerprint` header. FE
`migrateGuestToUser` thunk + dual-name response (`files` +
`files_migrated` etc.) reconciled.

---

### 🟢 `BulkOperationResponse` → `BulkResponse` reconciled

**Resolved:** 2026-04-26. Old `{ succeeded: string[], failed:
BulkOperationFailure[] }` replaced. FE bulk thunks iterate
`results.filter(r => !r.ok)` for rollback.

---

### 🟢 Header plumbing: `X-Idempotency-Key`, `X-Cloud-Files-Bypass`

**Resolved:** 2026-04-26. Both headers added to
[api/client.ts](../api/client.ts) `RequestOptions`. Upload thunks
pass `idempotencyKey: requestId` so the same key is reused across
retries.

---

### 🟢 `X-Guest-Fingerprint` header on every request

**Resolved:** 2026-04-26. `client.ts` reads `getCachedFingerprint()`
synchronously and attaches the header on every request when present.
Authed users also send it for backend correlation.

---

### 🟢 PATCH metadata default-merge

**Resolved:** 2026-04-26. Default behaviour matches FE expectation;
explicit `patchFileReplaceMetadata` exposed for the rare
overwrite-the-blob case.

---

### 🟢 RLS recursion 42P17 fix (file-permissions + user-group-members)

**Resolved:** 2026-04-26 (two migrations).

---

### 🟢 `cld_get_user_file_tree` returns folder rows with `kind` discriminator

**Resolved:** 2026-04-26. FE discriminated union (`CloudTreeFileRow`
/ `CloudTreeFolderRow`) in place; tree converter handles the
discriminator.

---

### 🟢 Per-endpoint quotas and rate limits

**Resolved:** 2026-04-26. Tier-based defaults from `cld_account_tiers`.
FE error codes (`storage_quota_exceeded`, `daily_uploads_exceeded`,
`rate_limited`, etc.) added to `CloudFilesErrorCode`.

---

## Entry template

When logging a new item, copy-paste:

```md
### N. <emoji> <one-line title>

**Priority:** High | Medium | Low.

**Context:** (What prompted this.)

**Ask:** (Specific deliverable.)

**Blocker?** Yes / No — (what's stalled).

**Current FE workaround:** (What we ship in the meantime.)
```
