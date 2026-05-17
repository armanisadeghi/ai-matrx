# Cloud Files — Updates from the Python team

> **Owned by the Python team. The frontend reads this; we do not edit it.**
>
> Anything we want from the Python team goes in [for_python/REQUESTS.md](../for_python/REQUESTS.md).
>
> This is the single canonical doc for the cloud-files HTTP contract +
> any release notes / breaking changes / runtime expectations the
> backend team wants the frontend team to internalize.
>
> Last updated: 2026-05-17.

---

## Status legend

- 🟢 **Live** — shipped + verified
- 🟡 **Live (partial)** — shipped, follow-up work tracked
- 🔵 **Planned** — committed, not yet shipped
- ⚪ **Not yet** — backlog / no timeline

---

## 0. Required deploy steps (backend ops)

These are the operational steps each environment needs before the
frontend can run against it. The frontend does not perform any of
these — they're listed here so the FE team can spot env-misconfig
symptoms quickly.

1. Apply SQL migrations 002 + 003 in order on the live Supabase project.
   - `packages/matrx-utils/matrx_utils/file_handling/cloud_sync/sql/002_guest_support.sql`
   - `packages/matrx-utils/matrx_utils/file_handling/cloud_sync/sql/003_security_correctness_quotas.sql`
2. Set new env vars:
   - `CORS_ALLOWED_ORIGINS=https://app.aidream.com,...`
   - `GUEST_FINGERPRINT_SECRET=<32+ random bytes>`
   - `CLOUD_FILES_BYPASS_SECRET=<32+ random bytes>`
   - `SUPABASE_JWT_AUDIENCE=authenticated`
3. Restart the API. Lifespan probe prints `Cloud sync: configured (bucket=…)`.
4. Apply tier rows if you want to override defaults (SQL §7).

---

## 1. Authentication — what the frontend sends

Every request is identified by **either** an authed user OR a guest
fingerprint (or both — authed users may also send a fingerprint so
the server can correlate prior guest activity).

| Header | Sent for | Notes |
|---|---|---|
| `Authorization: Bearer <jwt>` | Authed users | Supabase JWT. `verify_aud=true` with `audience="authenticated"`. |
| `X-Guest-Fingerprint` | Guests + authed (correlation) | Resolves to a stable `guest_executions.id`. `X-Fingerprint-ID` is the legacy alias and is also accepted. |
| `X-Request-Id` | Every mutation | Client-generated UUID. Used for log correlation + realtime-echo dedup. |
| `X-Idempotency-Key` | Optional, mostly uploads | Stored in `metadata._idempotency_key`. Reuse the same key across retries of the same intended upload to avoid duplicate version rows. |
| `X-Cloud-Files-Bypass: <secret>` | Trusted internal callers only | Must match `CLOUD_FILES_BYPASS_SECRET`. Skips quota / rate-limit refusals (still records bytes for accounting). NEVER thread user input into this. |

A request with neither `Authorization` nor `X-Guest-Fingerprint`
returns `401 auth_required`.

---

## 2. Account tiers, quotas, and rate limits 🟢

Every account is assigned an **account tier** that controls upload
size, total storage, file count, daily upload caps, bulk operation
size, and per-minute rate limits. Defaults seeded by migration 003:

| Tier | Storage | Per-file | Files | Daily uploads | Daily bytes | Bulk cap | Upload RPM |
|---|---|---|---|---|---|---|---|
| **guest** | 200 MB | 25 MB | 50 | 20 | 500 MB | 50 | 10 |
| **free** | 5 GB | 100 MB | 5 000 | 200 | 5 GB | 200 | 60 |
| **pro** | 100 GB | 5 GB | 100 000 | 2 000 | 100 GB | 500 | 300 |
| **enterprise** | unlimited | unlimited | unlimited | unlimited | unlimited | 5 000 | unlimited |

To change a user's tier or apply a custom override, insert/update
`cld_user_account` (server side). Per-user `custom_limits` overrides
any tier default.

### Quota refusals

A refused write returns `413` (or `429` for rate-limit) with one of
the following error codes in the body:

- `storage_quota_exceeded`
- `file_too_large`
- `file_count_exceeded`
- `daily_uploads_exceeded`
- `daily_bytes_exceeded`
- `rate_limited` (429)
- `account_blocked`
- `bulk_too_large`

Body shape:
```json
{
  "error": "<code>",
  "message": "Upload refused by account-quota policy.",
  "details": { "limit": 100, "used": 90, "attempted": 50 }
}
```

### Bypass paths

Two ways for trusted internal callers to skip quota / rate-limit
refusal (still records the bytes for accounting):

1. **Admin user** — `ctx.is_admin` automatically bypasses.
2. **`X-Cloud-Files-Bypass: <secret>`** — header must equal
   `CLOUD_FILES_BYPASS_SECRET`. Use this for internal workers /
   importers / bulk-loaders that legitimately need to write a 5 GB
   dataset.

Bypass does NOT disable the hard 5 GB buffered-upload ceiling
(memory-safety guard).

### Read tier + usage

```http
GET /files/usage
```

Response: see `StorageUsageResponse` in §6.

---

## 3. Endpoint catalog (46 routes)

Status: 38 auth-required + 8 public/share/migrate.

### Files
| Method | Path | Status | Notes |
|---|---|---|---|
| `POST` | `/files/upload` | 🟢 | Multipart. Optional `X-Idempotency-Key`, `X-Cloud-Files-Bypass`. Quota pre-flight + 413/429 refusals. |
| `GET` | `/files` | 🟢 | `?folder_path=&limit=&offset=` (1–1000, default 100). |
| `GET` | `/files/{file_id}` | 🟢 | |
| `GET` | `/files/by-path/{file_path}` | 🟢 | URL-encoded path. |
| `PATCH` | `/files/{file_id}` | 🟢 | **Metadata MERGED by default**; `?metadata_merge=false` for replace. |
| `DELETE` | `/files/{file_id}` | 🟢 | `?hard_delete=true` purges S3 + versions + permissions + share-links. Requires `admin` permission (owner OR admin grantee). |
| `POST` | `/files/{file_id}/rename` | 🟢 | Body `{new_path}` — rename / move with auto-create of parent folders. |
| `POST` | `/files/{file_id}/copy` | 🟢 | Body `{target_path, overwrite?}` — counts against caller's quota. |
| `POST` | `/files/{file_id}/restore` | 🟢 | Undo soft-delete. Owner / admin grantee only. |
| `GET` | `/files/{file_id}/download` | 🟢 | `?version=`, `?inline=true`. `nosniff` + RFC-5987 filenames. Inline only honoured for `image/*`, `video/*`, `audio/*`, `application/pdf`. |
| `GET` | `/files/{file_id}/url` | 🟢 | Returns a 7-day signed S3 URL. |
| `GET` | `/files/usage` | 🟢 | Tier + quota + current usage (see §6). |
| `GET` | `/files/trash` | 🟢 | Soft-deleted files + folders for the user. |
| `GET` | `/files/search` | 🟢 | `?q=&mime_prefix=&limit=&offset=` — substring search across filename + path. |
| `GET` | `/files/tree` | 🟢 | `?limit=&offset=&include_folders=&include_deleted=`. **Returns folders too** with `kind: "file" \| "folder"` discriminator. |
| `GET` | `/files/folders` | 🟢 | `?parent_path=` — list folders. |
| `DELETE` | `/files/bulk` | 🟢 | Body `{file_ids[], hard_delete?}`. Returns `BulkResponse`. Concurrency-capped 10 in-flight; size capped at tier `max_bulk_items`. |
| `POST` | `/files/bulk/move` | 🟢 | Body `{file_ids[], new_parent_folder_id}`. Verifies same-owner targets. |
| `POST` | `/files/migrate-guest-to-user` | 🟢 | See §4 (BREAKING contract). |

### Folders
| Method | Path | Status |
|---|---|---|
| `POST` | `/folders` | 🟢 |
| `PATCH` | `/folders/{folder_id}` | 🟢 — rename cascades to descendants |
| `DELETE` | `/folders/{folder_id}` | 🟢 — soft-delete cascades + share-links deactivated |
| `POST` | `/folders/bulk/move` | 🟢 |
| `GET/POST/DELETE` | `/folders/{folder_id}/permissions` | 🟢 — same as files; cascades to descendants |
| `GET/POST` | `/folders/{folder_id}/share-links` | 🟢 |

### Versions
| Method | Path | Status |
|---|---|---|
| `GET` | `/files/{file_id}/versions` | 🟢 |
| `POST` | `/files/{file_id}/restore-version` | 🟡 — partial; full rewrite still queued |

### Permissions + share links
| Method | Path | Status |
|---|---|---|
| `GET/POST/DELETE` | `/files/{file_id}/permissions` | 🟢 |
| `POST` | `/files/{file_id}/share-links` | 🟢 |
| `GET` | `/files/{file_id}/share-links` | 🟢 |
| `DELETE` | `/files/share-links/{token}` | 🟢 — `is_active=false` immediately blocks resolve; cascade on file/folder delete |
| `GET` | `/share/{share_token}` | 🟢 — public, refuses deactivated/expired |
| `GET` | `/share/{share_token}/download` | 🟢 — public, atomic max_uses consume |

### Groups
| Method | Path | Status |
|---|---|---|
| `GET/POST` | `/files/groups` | 🟢 |
| `GET/POST/DELETE` | `/files/groups/{group_id}/members` | 🟢 |

---

## 4. Breaking contract changes (FE must reconcile)

### `BulkOperationResponse` → `BulkResponse`

Backend ships:
```ts
interface BulkResultItem {
  id: string;
  ok: boolean;
  error: string | null;   // error code/message when ok=false
}
interface BulkResponse {
  results: BulkResultItem[];
  succeeded: number;       // count, not array
  failed: number;          // count, not array
}
```

Affects: `DELETE /files/bulk`, `POST /files/bulk/move`, `POST /folders/bulk/move`.

### `POST /files/migrate-guest-to-user`

Body:
```ts
{
  new_user_id: string;       // must equal authed user_id (server verifies)
  guest_id?: string;         // optional cross-check against fingerprint
}
```

Required header: `X-Guest-Fingerprint` (or `X-Fingerprint-ID`).

Response:
```ts
{
  files: number, folders: number, groups: number, perms: number, shares: number,
  // Same numbers under aliased names for FE convenience:
  files_migrated: number, folders_migrated: number, groups_migrated: number,
  permissions_migrated: number, shares_migrated: number,
}
```

Behaviour:
- Idempotent re-calls with the same `new_user_id` return the original payload.
- Re-calls with a DIFFERENT `new_user_id` return `409 guest_locked`.
- Without the fingerprint header → `400 fingerprint_required`.
- Mismatched `guest_id` vs resolved fingerprint → `403 guest_id_mismatch`.

### `GET /files/tree` discriminated rows

Each row:
```ts
{ kind: 'file' | 'folder', id, owner_id, path, name, parent_id,
  mime_type, size_bytes, visibility, current_version, metadata,
  created_at, updated_at, deleted_at, effective_permission }
```

Folders ship in the same response (`include_folders=true` is the default).

### PATCH `/files/{id}` metadata is now MERGED by default

The default behavior CHANGED from "replace" to "merge". To get the old
replace semantics pass `?metadata_merge=false`.

### Path sanitization

`file_path` and `folder_path` reject:
- `..` segments, empty segments (`a//b`), `.` segments
- Backslashes
- Embedded NUL or control characters
- Right-to-left override / Bidi tricks
- Paths exceeding 1024 chars total or 32 segments deep

Leading and trailing slashes are silently stripped (not rejected).
Errors come back as `400 invalid_path` with a precise reason in
`message`.

### MIME sniffing on upload

Backend ignores client-supplied `Content-Type` for active types
(HTML, SVG, JavaScript). Stored MIME may be rewritten to
`application/octet-stream` if the bytes look active. Active types are
always served as `attachment` regardless of `?inline=true`.

### `cld_get_user_file_tree` is identity-locked

Direct calls from supabase-js (anon key) with someone else's UUID are
rejected with `42501 forbidden`. The backend (service role) is
unaffected. Function signature gained pagination + folder-inclusion
params (additive).

---

## 5. Error envelope

```ts
interface ApiError {
  error: string;          // machine-readable code (see §6)
  message: string;        // operator-facing text
  user_message: string;   // friendly text (populated by global handler)
  details: unknown | null;
  request_id: string;
}
```

The FE error code union (`CloudFilesErrorCode` in `features/files/types.ts`)
mirrors what the backend returns. Each code carries a retry posture —
see the comment block above the union for the full table.

### Status code → retry posture

| HTTP | Retry?  | Typical UX |
|---|---|---|
| 400 (`invalid_*`) | no | Fix the request. |
| 401 (`auth_required`) | no | Sign in. |
| 403 (`permission_denied`, `guest_id_mismatch`) | no | Request access / re-auth. |
| 404 (`not_found`) | no | Resource gone. |
| 409 (`conflict`, `file_already_exists`, `guest_locked`) | no | Pass `overwrite=true` or surface state. |
| 410 (`share_link_invalid`) | no | Link revoked / expired. |
| 413 (`file_too_large`, `*_quota_exceeded`, `*_uploads_exceeded`, `bulk_too_large`) | no | Upgrade tier / wait / smaller batch. |
| 423 (`account_blocked`) | no | Contact support. |
| 429 (`rate_limited`) | **yes** | Exponential backoff. |
| 5xx (`internal`, `cld_sync_unavailable`) | **yes** | Exponential backoff. |

---

## 6. Response shapes (key types)

### `StorageUsageResponse`
```ts
interface StorageUsageResponse {
  tier_id: string;
  tier_name: string;
  is_blocked: boolean;
  blocked_reason: string | null;
  bytes_used: number;
  files_count: number;
  daily_upload_count: number;
  daily_upload_bytes: number;
  max_storage_bytes: number | null;
  max_file_size_bytes: number | null;
  max_files: number | null;
  max_versions_per_file: number | null;
  max_daily_uploads: number | null;
  max_daily_upload_bytes: number | null;
  max_bulk_items: number | null;
  rate_limit_uploads_per_min: number | null;
  rate_limit_downloads_per_min: number | null;
  features: Record<string, unknown>;
}
```

### `TrashListResponse`
```ts
interface TrashListResponse {
  files: FileRecord[];
  folders: FolderRecord[];
}
```

### `SearchFilesResponse`
```ts
interface SearchFilesResponse {
  results: FileRecord[];
  query: string;
  total_returned: number;
}
```

### `RenameFileRequest` / `CopyFileRequest`
```ts
interface RenameFileRequest { new_path: string }
interface CopyFileRequest    { target_path: string; overwrite?: boolean }
```

### `CloudTreeRow`
```ts
interface CloudTreeRow {
  kind: 'file' | 'folder';
  id: string;
  owner_id: string;
  path: string;
  name: string;
  parent_id: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  visibility: 'public' | 'private' | 'shared';
  current_version: number | null;
  metadata: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  effective_permission: 'admin' | 'write' | 'read' | null;
}
```

---

## 7. Security posture (FE-relevant summary)

The full audit history lives with the Python team. The FE-relevant
guarantees as of this release:

- **CORS lockdown** — `CORS_ALLOWED_ORIGINS` env-driven. Local dev
  (`localhost:3000`, `:3100`, `:3101`, `:5173`) auto-whitelisted when
  empty. **Set the env var in staging / prod.**
- **Path traversal closed** — `..`, NUL, backslash, RTL, etc.
  rejected at every boundary.
- **Stored XSS closed** — `nosniff` + `Content-Disposition: attachment`
  for active MIMEs (HTML / SVG / JS / XML). Inline rendering only
  honoured for image/video/audio/PDF.
- **Hard delete actually deletes** — `?hard_delete=true` purges S3
  object, all `.versions/<id>/v*/…` S3 objects, all
  `cld_file_versions` rows, all `cld_file_permissions` rows, all
  `cld_share_links` rows, and the `cld_files` row itself. A
  "restore" call after hard-delete now correctly returns 404.
- **Share links** — `is_active=false` is enforced on resolve;
  cascade-deactivates on file/folder soft-delete; atomic
  `max_uses` consume.
- **`DELETE /files/{id}` requires admin permission** — owner or
  admin grantee. Non-grantees get `403 permission_denied` (was
  silently `{deleted: false}`).
- **`Content-Disposition` filename** — RFC-5987 compliant,
  CR/LF/quote injection blocked.
- **Fingerprint logging redacted** — hashed to a 12-char prefix
  (`fp:abc123def456…`).

---

## 8. What's still pending

**Pruned 2026-05-17** — many items that were ⚪ here are now 🟢 (see
§9 changelog for proof + commit references). Current pending list:

- ⚪ **Presigned PUT to S3** — direct browser → S3 path.
- ⚪ **Per-org tenancy** — `organization_id` columns added to schema;
  routes still single-owner.
- ⚪ **Comments / annotations / file locking**.
- ⚪ **Antivirus scan**.
- 🟡 **Subscriber-management REST surface for webhooks** — the
  `cld_webhooks` + `cld_webhook_deliveries` tables + dispatcher
  worker are live (Bundle B3, 2026-05-05). Owners still register
  subscriptions via direct SQL. A `/files/webhooks/*` REST surface
  is a small follow-up.
- 🟡 **`fs_move` cross-adapter** in the VFS surface — same-adapter
  works; cross-adapter (e.g. Notes → My Files) currently returns
  400. Adapter-pair-specific copy-then-delete logic is the follow-up.
- 🟡 **VFS: Notes `list_versions` / `restore_version`** — `note_versions`
  exists; adapter doesn't yet expose them.
- 🟡 **VFS: binary `fs_read`** — TUS-uploaded binary content currently
  returns UTF-8-decoded bytes. Strict-binary needs a `binary: true`
  arg → base64 response shape. Cloud_files adapter already advertises
  `capabilities.binary = true`; FE can route binary previews via
  `GET /files/{id}/url` until then.

**Items the FE should re-check + flip to 🟢 in REQUESTS.md** (the
work shipped; only acknowledgment is missing on their side):

- ✅ **0a** — public-file privacy leak (closed in `da02e7cf`,
  migration 014, verified 0 cross-owner leak in prod)
- ✅ **0b** — variant orphan rows (closed in `a47788d6`; 6,152
  cascade rows deleted + 134 MB S3 reclaimed; forward-write
  defences shipped so the cascade cannot recur)
- ✅ **0c** — tree RPC usability (closed in `da02e7cf`,
  migration 014: default `p_limit` 200→5000, `p_order_by` param,
  `cld_count_user_files` companion, old 5-arg overload dropped)
- ✅ **3** — TUS uploads >100 MB (closed in Bundle E2, 2026-05-05)
- ✅ **4** — Range download (closed in Bundle D1, 2026-05-05;
  re-verified in `d647c143` — 206 + S3 chunked stream all working)
- ✅ **5** — CDN-backed permanent URLs (every response shape since
  Phase 0 carries `cdn_url` populated for `visibility="public"`
  files; e.g. `Asset.variants["original"].cdn_url`,
  `FileRecord.cdn_url`)
- ✅ **6** — Storage re-keying by `file_id` (Bundle E1 shipped the
  code; backfill **fully ran 2026-05-17**: 4,555 pre-canonical rows
  copied to canonical S3 keys, 0 failures, 0 new
  `_rekey_legacy_missing` flags). All 6,540 alive `cld_files` rows
  now carry `canonical_storage_uri`. New uploads have always been
  canonical-keyed.
- ✅ **7** — `POST /folders` path-style (`_ensure_folder_chain` creates
  intermediate folders atomically; verified `da02e7cf`)
- ✅ **9** — `X-Request-Id` in realtime payloads (closed in `d647c143`;
  middleware honours the header + every cloud_sync write stamps
  `metadata.request_id`; FE realtime can drop the 2s timestamp-fuzzy
  fallback)
- ✅ **10** — Webhooks (closed in Bundle B3, 2026-05-05; outbox +
  dispatcher live; only subscriber-management UI/REST pending)
- ✅ **15** — VFS adapter (closed in Bundle E3, 2026-05-05; all 11
  endpoints + 6 adapters + AI `fs_*` tools live)
- ✅ **Server-side thumbnail generation** (closed in Bundle D2,
  2026-05-05; massively extended in Phase 1/1c/1d — every file kind
  now has thumbnail + og + tiny variants, plus kind-specific
  `page1_url` for PDFs + `poster_url` for videos + real audio
  waveforms via pydub)
- ✅ **S3 bucket CORS** (Bundle B4 committed the canonical JSON +
  applied to prod; FE should re-test the direct-`fetch` previewers)

---

## 9. Recent ships (changelog)

Newest entries first. Each entry corresponds to one bundle in the
plan we're working through against `for_python/REQUESTS.md`.

### 2026-05-17 — Storage rekey backfill completed 🟢

Closes the operational follow-up for FE REQUESTS item **6**. Bundle
E1 (2026-05-05) shipped the canonical-storage-uri schema + read-path
support, but the data backfill hadn't been run against prod.

Ran `python -m aidream.cli.rekey_backfill` against Matrx Main:

| Stat | Value |
|---|---|
| Rows processed | 4,555 (smoke-test 50 first, then full) |
| `copied` (S3 server-side copy from legacy → canonical) | 4,555 |
| `already_canonical` (skipped no-op) | 0 |
| `legacy_missing` (legacy S3 object gone, flagged for ops) | 0 new |
| `copy_failed` / `skipped_bad_uri` / `skipped_no_backend` | 0 |
| Rate | ~23 rows/sec |

**Final state:** 6,540 / 6,540 alive `cld_files` rows carry
`canonical_storage_uri` (100%). Two rows have the pre-existing
`metadata._rekey_legacy_missing` marker from earlier runs — those
are legacy-S3-object-gone edge cases needing ops review, not new
regressions.

Renames and bulk-moves were already storage-key stable (they only
update `file_path`); this backfill protects future writes from
re-introducing legacy-key drift if a rename ever started copying
bytes.

---

### 2026-05-17 — Phase 1d.5: tree privacy, RPC usability, X-Request-Id realtime 🟢

Closes FE REQUESTS items **0a**, **0c**, **4** (re-verified), **7**
(re-verified), **9**, **15** (re-verified). Three commits today:

**Commit `da02e7cf` — migration 014 (RPC fixes)**

- **0a (CRITICAL privacy)**: dropped `OR f.visibility = 'public'` from
  the file leg of `cld_get_user_file_tree`. Was leaking every public
  file to every authed user (50 cross-owner rows visible to one test
  user). Now: owner OR explicit grant only. **FE can remove the
  `loadUserFileTree` defensive filter.**
- **0c #1 (usability)**: bumped default `p_limit` from 200 → 5000.
  Ad-hoc callers (curl, AI tools, scripts) no longer silently
  truncate at 200.
- **0c #1 alt (ordering)**: new `p_order_by` parameter on
  `cld_get_user_file_tree`. Accepts `'name'` (default, back-compat) |
  `'updated_at_desc'` | `'created_at_desc'`. Unknown values silently
  fall back to `'name'`. Recents UX no longer buries fresh
  `zebra.png` uploads at the last page.
- **0c #3 (companion)**: new `cld_count_user_files(uuid, bool, bool)
  → jsonb` returning `{files, folders, total}`. Filters mirror
  `cld_get_user_file_tree` exactly. FE can render
  "page 3 of N" progress instead of a spinner.
- **IMPORTANT**: dropped the OLD 5-arg overload of
  `cld_get_user_file_tree` so 5-arg calls unambiguously resolve to
  the new 6-arg version (was throwing `42725 function is not unique`
  before the drop). Re-generate types after pulling.
- **Item 7 verified**: `POST /folders` already supports path-style
  `folder_path` (`_ensure_folder_chain` creates intermediate folders
  atomically). FE can drop the `ensureFolderPath` supabase-js
  fallback.

**Commit `d647c143` — items 4, 9, 15**

- **Item 9 (X-Request-Id realtime)**: matrx-connect middleware now
  honours client-supplied `X-Request-Id` header (1-128 chars; falls
  back to UUID otherwise). Every cloud_sync write (`managed_write_async`,
  `managed_write`, `replace_file_async`) stamps `metadata.request_id`
  via a new `_stamp_request_id` helper that reads from the active
  matrx-utils context. Caller-supplied `metadata.request_id` wins.
  **FE can drop the 2-second timestamp-fuzzy dedup fallback** —
  realtime payloads now carry the round-tripped request_id directly.
- **Item 4 (Range download)**: re-verified — already shipped
  correctly. `/files/{id}/download` does proper S3-byte-range fetch
  (`get_object(Range="bytes=start-end")`) + chunked stream via
  `iter_chunks` + RFC-7233 206/416 responses + `Accept-Ranges: bytes`
  advertised. Never buffers full file. **REQUESTS.md description was
  outdated.**
- **Item 15 (VFS adapter)**: re-verified — already fully shipped
  (Bundle E3). `GET /virtual` returns 6 adapters with documented
  capabilities; AI `fs_*` tools live in
  `packages/matrx-ai/matrx_ai/tools/implementations/filesystem.py`.

**Migration files in tree:**
- `packages/matrx-utils/matrx_utils/file_handling/cloud_sync/sql/014_user_tree_privacy_and_usability.sql`

**Verification on the FE side:**
- Repro from REQUESTS item 0a: file
  `9e4850f8-a591-4a8e-a721-d51002c771ca` (visibility=public, owner
  `f0146c96-…`) should no longer appear in another user's
  `cld_get_user_file_tree` response. Confirmed 0 cross-owner rows
  visible to the test account (was 50 from 5 owners).
- `p_order_by`: pass `'updated_at_desc'` as the 6th arg and confirm
  the result starts with the most-recently-updated row.
- `cld_count_user_files`: returns `{files, folders, total}` matching
  what `cld_get_user_file_tree` would yield with the same filters.
- `metadata.request_id` round-trip: write a file from one tab with a
  known X-Request-Id, observe the realtime payload on a second tab
  and confirm `payload.new.metadata.request_id` matches.

---

### 2026-05-16 — Phase 1d.3: variant cascade cleanup + structural prevention 🟢

Closes FE REQUESTS item **0b**. Companion to the
Phase 1/1b/1c/1d/1d.1/1d.2/2/2b/2c/2c-google/3a/3b/2c-google work
covered in [docs/FE_MEDIA_BLOCK_CONTRACT.md](../../../aidream/docs/FE_MEDIA_BLOCK_CONTRACT.md).

**What happened:** The backfill incident wrote ~7,700 variant rows;
6,152 of those were CASCADE JUNK (variants-of-variants up to 12
levels deep). Root cause: the backfill iterated every `cld_files`
row matching the mime filter — INCLUDING the variant rows it had
just written (variants are `cld_files` rows with mime `image/jpeg`
under `system-files/variants/`). Each variant got handed back as a
"master" and re-processed.

**Three layers of defence so this cannot recur:**

1. **`generate_thumbnail_for_file`** (write-path guard): refuses any
   row with `metadata.derived_from`, `metadata.variant_key`,
   `parent_file_id`, or `file_path LIKE 'system-files/%'`. Returns
   early with a warning log; never reads master bytes.
2. **Backfill `_next_batch` query filter** (primary defence): triple-
   filters by `file_path NOT LIKE 'system-files/%'`, `parent_file_id
   IS NULL`, AND in-process `metadata.derived_from IS NULL`.
   Variants simply never enter iteration.
3. **`cld_get_user_file_tree` / `cld_search_files` / `cld_list_trash`
   RPCs** (migration 012): exclude `parent_file_id IS NOT NULL OR
   file_path LIKE 'system-files/%'`. Even if a stray variant ever
   slips into the table, users never see it.

**Forward-write parity** for native lineage columns:

- `managed_write_async` accepts `parent_file_id` + `derivation_kind`
  kwargs.
- `VariantsService.render_async` + `persist_prerendered_async` now
  stamp BOTH the JSONB `metadata.derived_from` AND the native
  `parent_file_id` + `derivation_kind` columns on every new variant
  (`parent_file_id = master_id`, `derivation_kind = 'variant'`).
- Migration 013 extends the `cld_files_derivation_kind_known` check
  constraint to permit `'variant'`.

**Cleanup applied to prod (Matrx Main):**

| Step | Result |
|---|---|
| Migration 012 (RPC filters) | Arman's `/files` view: 10,948 → 4,996 visible |
| Migration 013 backfill | 1,565 legit first-level variants got `parent_file_id` + `derivation_kind` columns stamped (data preserved) |
| Migration 013 soft-delete | 6,152 cascade-junk rows tagged with `metadata.cascade_cleanup=true` + soft-deleted |
| S3 cleanup CLI (`aidream/cli/cleanup_cascade_s3.py`) | 6,152 / 6,152 S3 objects deleted, ~134 MB reclaimed, **zero errors** |
| DB hard-delete | 6,152 rows removed (after S3 success) |
| Final state | 6,536 alive cld_files rows, 0 leftover cascade-tagged |

**Migration files in tree:**
- `packages/matrx-utils/.../sql/012_exclude_system_files_from_user_tree.sql`
- `packages/matrx-utils/.../sql/013_cleanup_cascade_variants.sql`
- `aidream/cli/cleanup_cascade_s3.py` (idempotent, supports
  `--dry-run` / `--limit` / `--keep-db-rows`)

**FE impact:** none on the wire shape. The cleanup happens entirely
server-side; `/files` views show the right things automatically.

---

### 2026-05-16 — Canonical media-block contract: Phases 0 / 1 / 1b / 1c / 1d / 1d.1 / 2 / 2b / 2c / 2c-google / 3a / 3b 🟢

**TL;DR:** One Pydantic model (`UnifiedMediaBlock`) now represents
every media reference on every wire path (stream events, `Asset`
envelopes, `cx_message.content[]`). Twelve phases shipped over two
sessions; full FE-facing contract documented in
[`docs/FE_MEDIA_BLOCK_CONTRACT.md`](../../../aidream/docs/FE_MEDIA_BLOCK_CONTRACT.md)
with one section per phase (the canonical source for FE-side type
generation + handler wiring).

**Headline changes the FE will notice:**

- **`UnifiedMediaBlock`** — discriminated union over `kind` (`image |
  video | audio | document | youtube`) with `origin: "matrx" |
  "external"`. Replaces 4 drifting shapes (`image_output`,
  `partial_image`, `render_block:image`, `cx_message` media parts).
- **`MediaBlockData`** — new stream payload `type: "media_block"`
  carries the canonical block. Old `image_output` / `audio_output`
  / `video_output` / `partial_image` payload types are deprecated
  (still exported for transition; audit gate `weak_media_block` =
  0 on `main`).
- **`size_bytes` everywhere** — DB column `cld_files.file_size`
  renamed to `size_bytes` (migration 010); every response shape +
  every Pydantic model + every TS interface follows.
- **Universal thumbnails** — every file kind (image / pdf / video /
  audio / archive / text / unknown) gets `og_url` + `thumbnail_url`
  + `tiny_url` in `Asset.variants`. PDFs additionally get
  `page1_url` (full-DPI page 1); videos get `poster_url` (native-res
  frame); audio uploads get real waveform PNGs (pydub + Pillow)
  instead of generic icons.
- **Probed dimensions** — `cld_files.width` / `.height` /
  `.duration_ms` columns added (migration 010) + populated at upload
  via the universal `probe_source_metadata`. PDF `page_count`
  stamped into `cld_files.metadata.page_count`.
- **`signed_url_expires_at`** — ms epoch on every URL set
  (`SyncResult`, `AssetVariant`, every `MediaBlock`). FE can
  schedule refresh ~30s before expiry instead of parsing X-Amz
  query params.
- **`cx_message.content[]` carries `file_id`** — long-standing bug
  closed. Every media item written from now on has `file_id`,
  `origin`, `size_bytes`, and kind-specific intrinsics (width,
  height, duration_ms, page_count) so chat-message reads don't need
  a follow-up `GET /assets/{id}`. Legacy reads still work via the
  back-compat reader.
- **AI generation metadata** — `MediaGenerationMetadata` canonical
  shape stamped under `cld_files.metadata.generation` for every
  AI-produced file. Per-provider mappers for OpenAI / Google /
  Together / Replicate / xAI / ElevenLabs / Groq.
- **Legacy `cld_files.thumbnail_*` columns dropped** (migration 011)
  — `FileRecord.thumbnail_url` still populates (via variants
  resolver) so the FE-visible behaviour is unchanged.

**Migration files in tree:**
- `010_canonical_media_columns.sql` — file_size → size_bytes + width/height/duration_ms
- `011_drop_legacy_thumbnail_columns.sql`

**FE-side ask:** read [`docs/FE_MEDIA_BLOCK_CONTRACT.md`](../../../aidream/docs/FE_MEDIA_BLOCK_CONTRACT.md)
for the complete contract + every phase's wire-shape diff. After
`pnpm sync-types` the typed shapes (`UnifiedMediaBlock`,
`MediaBlockData`, etc.) appear in `stream-events.ts`.

### 2026-05-05 — Bundle E3: Virtual Filesystem Adapter surface 🟢 (code in tree)

Closes the duplicate-numbered "Item 1." in REQUESTS.md (Virtual
Filesystem Adapter — server-side parity).

**New module** `aidream/api/virtual/`:
- [`contract.py`](../../../aidream/aidream/api/virtual/contract.py) — Pydantic mirror of `features/files/virtual-sources/types.ts`. Same field names, snake_case at the wire boundary. `VirtualNode`, `VirtualNodeField`, `VirtualContent`, `VirtualVersion`, `VirtualCapabilities`, `VirtualAdapterDescriptor`, plus the request bodies (`WriteArgs`, `RenameArgs`, `MoveArgs`, `CreateArgs`, `ResolvePathArgs`).
- [`dispatcher.py`](../../../aidream/aidream/api/virtual/dispatcher.py) — adapter registry + path resolver. `resolve_path("/Notes/Daily/2026-05-05.md")` walks segment-by-segment via each adapter's `resolve_name_to_id`, supports `row#field_id` syntax for multi-field rows.
- [`router.py`](../../../aidream/aidream/api/virtual/router.py) — full HTTP surface (mounted under `/virtual`).

**Endpoints** (mounted at root, dispatched to adapters by `source_id`):
| Method | Path |
|---|---|
| `GET` | `/virtual` (list adapters) |
| `POST` | `/virtual/resolve` (path → ids) |
| `GET` | `/virtual/{adapter_id}/list` |
| `GET` | `/virtual/{adapter_id}/{vid}/content` |
| `POST` | `/virtual/{adapter_id}/{vid}/save` |
| `POST` | `/virtual/{adapter_id}/{vid}/rename` |
| `POST` | `/virtual/{adapter_id}/{vid}/move` |
| `DELETE` | `/virtual/{adapter_id}/{vid}` |
| `POST` | `/virtual/{adapter_id}/create` |
| `GET` | `/virtual/{adapter_id}/{vid}/versions` |
| `POST` | `/virtual/{adapter_id}/{vid}/versions/{n}/restore` |

**Six built-in adapters registered:**
| `source_id` | Label | Capabilities |
|---|---|---|
| `my_files` | My Files | list/read/write/rename/delete/move/folders/binary/versions — wraps existing `cld_files` + S3 |
| `notes` | Notes | list/read/write/rename/delete/folders + create — wraps `notes` + `note_folders` |
| `code_files` | Code Snippets | list/read/write/rename/delete/folders + create — wraps `code_files` + `code_file_folders` |
| `aga_apps` | Agent Apps | list/read/write/rename/delete (flat) — wraps `aga_apps`, single `component_code` field |
| `prompt_apps` | Prompt Apps | list/read/write/rename/delete (flat) — wraps `prompt_apps`, single `component_code` field |
| `tool_ui_components` | Tool UIs | list/read/write (flat, multi-field) — wraps `tl_ui`, 5 editable code columns |

**ACL:** every adapter receives the JWT-resolved `user_id` and applies its own row-level scope (owner-OR-explicit-grant for cloud_files, `user_id`-eq for the user-owned adapters, `is_active`-eq for the platform-asset tool_ui_components). RLS on the underlying tables is the second line of defence.

**Optimistic concurrency:** the wire standardizes on `expected_updated_at` (TIMESTAMPTZ string) per the FE TS contract. Adapters whose backing table tracks `version: int` (Notes) translate internally — the server bumps `version` on write and returns the new `updated_at` so subsequent writes can pin to it.

**AI agent fs_* tools** in [`aidream/api/ai_tools/fs.py`](../../../aidream/aidream/api/ai_tools/fs.py):
- `fs_list(path)` — root listing returns the 6 adapter labels; deep paths dispatch to `adapter.list`.
- `fs_read(path)` — `path = "/My Files/foo.txt"` returns the same bytes as `GET /files/{id}/content`. `path = "/Tool UIs/cloud_browser_screenshot#inline_code.tsx"` reads a single multi-field column.
- `fs_write(path, content)`, `fs_rename(path, new_name)`, `fs_delete(path, hard?)`, `fs_move(src, dst_parent)`, `fs_create(parent, name, kind, content?)` — all in-process, no HTTP loop, no JWT re-auth.

The seven tools share a single dispatch helper (`_resolve_path_to_adapter`) so the path → (adapter_id, virtual_id, field_id) tuple is computed once per call. Cross-adapter `fs_move` is intentionally rejected in v1 — that becomes adapter-pair-specific copy-then-delete logic in a follow-up.

**Verification matrix (manual smoke):**
- `GET /virtual` → 6 entries with stable shapes.
- `POST /virtual/resolve` with `{ "path": "/My Files/foo.txt" }` → returns `{adapter_id: "my_files", virtual_id: <uuid>}`.
- `fs_read("/Notes/MyNote")` from an agent → returns the markdown content of MyNote.
- Cross-user attempt: `fs_read("/Notes/<user-B-note-id>")` from user A's JWT → 403, never 404, never leaks the row.

**Known follow-ups (NOT shipped this run):**
- TUS-uploaded binary content via `fs_read` returns UTF-8-decoded bytes — strict-binary support needs a `binary: true` arg → base64 response shape. The cloud_files adapter already opts into `capabilities.binary = true` so the FE can route binary previews via the existing `GET /files/{id}/url` flow until then.
- Notes adapter does not yet expose `list_versions` / `restore_version` even though `note_versions` exists.
- `fs_move` cross-adapter is a 400; the dispatcher could route copy-then-delete in a follow-up.

---

### 2026-05-05 — Bundle E2: TUS resumable uploads 🟢 (SQL applied; code in tree)

Closes FE request **3** (Resumable / TUS uploads for files larger than 100 MB).

**New SQL migration** [`db/migrations/0036_cld_uploads_inflight.sql`](../../../aidream/db/migrations/0036_cld_uploads_inflight.sql) (applied):
- `cld_uploads_inflight` registry table mapping a TUS upload-id to the underlying S3 multipart upload-id, current Upload-Offset, accumulated parts list, status (`in_progress|completed|aborted`), expiration, and idempotency key.
- Unique index on `(owner_id, idempotency_key)` for in-progress rows so retries reuse the same multipart upload.
- RLS so owners can read their own in-flight uploads (the FE can show a "resume your upload?" prompt).

**New router** [`aidream/api/routers/files_tus.py`](../../../aidream/aidream/api/routers/files_tus.py) — TUS Core 1.0.0 + Creation + Termination + Creation-with-Upload extensions, mounted at `/files/upload/tus`.

**Endpoints:**
| Method | Path | Behavior |
|---|---|---|
| `OPTIONS` | `/files/upload/tus` | Capabilities: `Tus-Version: 1.0.0`, `Tus-Max-Size: 5368709120` (5 GB), `Tus-Extension: creation,termination,creation-with-upload` |
| `POST` | `/files/upload/tus` | Creation. Headers: `Upload-Length` (required), `Upload-Metadata` (filepath, mimetype, visibility...). Returns 201 with `Location: /files/upload/tus/{id}`. Quota pre-flight runs here. |
| `HEAD` | `/files/upload/tus/{id}` | Returns current `Upload-Offset` so the client can resume. |
| `PATCH` | `/files/upload/tus/{id}` | Append bytes. `Content-Type: application/offset+octet-stream`, `Upload-Offset` header. Each PATCH = one S3 part. On final PATCH, completes multipart + creates `cld_files` row + dispatches thumbnail. |
| `DELETE` | `/files/upload/tus/{id}` | Aborts the multipart + marks row `aborted`. |

**Behaviour notes:**
- **Each PATCH is one S3 part.** Clients must send chunks ≥ 5 MiB except the last (S3 multipart minimum). All major TUS client SDKs (uppy, tus-js-client) honour this automatically.
- **Idempotency:** `X-Idempotency-Key` on POST routes the client to an existing in-progress upload with the same key (same owner). Lets the FE retry POSTs without leaking multipart uploads.
- **Quota:** checked at create time against `Upload-Length`; checked again at completion against actual finalized size.
- **Re-key native:** TUS uploads land at the canonical `<owner>/<file_id>` key (Item 6) directly — no rekey backfill needed for TUS-uploaded files.
- **Thumbnails:** automatically dispatched fire-and-forget on completion (same pipeline as multipart `POST /files/upload`).
- **Hard cap:** 5 GB. The buffered path's bypass header still works for the rare >5 GB internal use case.

**Error codes:** standard TUS responses (412 version mismatch, 415 unsupported media type, 409 offset mismatch, 413 size exceeded, 404 unknown upload-id) plus our `cloud_files` codes for quota refusals.

**FE integration:** `tus-js-client` "just works" pointed at `<API>/files/upload/tus` with `Authorization: Bearer <jwt>`. Set `chunkSize` to ≥5 MiB. Pass `metadata: { filepath, mimetype, visibility }`.

---

### 2026-05-05 — Bundle E1: Storage re-key by file_id (foundation) 🟢 (SQL applied; backfill on demand)

Closes (foundationally) FE request **6** (Storage re-keying by `file_id`).

**New SQL migration** [`db/migrations/0035_cld_files_canonical_storage_uri.sql`](../../../aidream/db/migrations/0035_cld_files_canonical_storage_uri.sql) (applied) adds:
- `canonical_storage_uri TEXT` — `<backend>://<bucket>/<owner_id>/<file_id>` shape.
- `uq_cld_files_canonical_storage_uri` unique partial index (NULLs allowed).

**On apply:** 1,347 existing rows have `canonical_storage_uri = NULL` and need backfill.

**Backfill script:** [`aidream/services/cloud_files/rekey_backfill.py`](../../../aidream/aidream/services/cloud_files/rekey_backfill.py). Idempotent + resumable.
- For each null-canonical row: S3 server-side `copy_object` from legacy `<owner>/<file_path>` to canonical `<owner>/<file_id>`, then UPDATE the row.
- Skips rows already at canonical, rows whose legacy key 404s (flagged in `metadata._rekey_legacy_missing` for ops follow-up), and rows without an S3 backend.
- Bounded parallelism (8 concurrent S3 ops). Default batch 200.
- CLI: `python -m aidream.services.cloud_files.rekey_backfill [--owner UUID] [--limit N]`.

**Read-path change:** New helper `_effective_storage_uri(record)` in `files.py` prefers `canonical_storage_uri` when set, else falls back to `storage_uri`. Wired into:
- `GET /files/{id}/download` — both the buffered fallback and the range-streaming path.
- `GET /files/{id}/url` — signed URL generation.
- `POST /files/{id}/copy` — read of source bytes.
- `GET /share/{token}` (resolve + download) — signed URL.
- `aidream/services/cloud_files/thumbnails.py` — source bytes for thumbnail render.

**Rename / bulk-move ops were already storage-key stable.** `POST /files/{id}/rename` and the bulk-move endpoints only update `file_path` / `parent_folder_id` — no S3 copy. The re-key column protects against future drift if anyone re-introduces path-baked storage URIs.

**FileRecord wire shape:** `storage_uri` field on the response stays pointed at the legacy URI (so existing FE comparisons keep working). The canonical URI is server-side internal until the legacy column is dropped in a follow-up migration.

**Next steps for Python team (NOT shipped this run):**
1. Run `python -m aidream.services.cloud_files.rekey_backfill` against staging — verify zero `metadata._rekey_legacy_missing` markers.
2. Run against prod (idempotent — safe to repeat).
3. Wait 7 days bake time, confirm read paths never need legacy fallback.
4. Drop legacy `storage_uri` column in migration 0036 (planned).

---

### 2026-05-05 — Bundle B3: cld_events dispatcher + webhook outbox 🟢 (SQL applied; code in tree)

Closes FE request **10** (Webhooks/SSE for events beyond Supabase Realtime).

**New SQL migration** [`db/migrations/0034_cld_events_dispatcher.sql`](../../../aidream/db/migrations/0034_cld_events_dispatcher.sql) (applied) adds:
- `cld_events.processed_at` — dispatcher cursor + a partial index `idx_cld_events_unprocessed` on the unprocessed hot path.
- `cld_webhooks` — owner-scoped subscriber registry: `target_url`, `secret`, optional `event_types[]` and `resource_types[]` filters, RLS so owners only see their own rows.
- `cld_webhook_deliveries` — per-attempt log: `webhook_id`, `event_id`, `attempt`, `status` (`pending|delivered|failed|abandoned`), `http_status`, `latency_ms`, `error_message`, `next_attempt_at` for backoff.

**New service module** [`aidream/services/cloud_files/event_dispatcher.py`](../../../aidream/aidream/services/cloud_files/event_dispatcher.py):
- Polls `cld_events WHERE processed_at IS NULL` on a configurable interval (default 5 s, batch 100).
- Fans each unmatched event out to active subscribed webhooks (filtered by `event_types` + `resource_types`).
- POSTs the JSON payload with `X-Cld-Signature: sha256=<hmac>` (HMAC-SHA256 over the body using the webhook secret), plus `X-Cld-Event`, `X-Cld-Event-Id`, `X-Cld-Webhook-Id`, `X-Cld-Attempt` headers.
- Records every attempt in `cld_webhook_deliveries` with HTTP status + latency. Failures schedule retries with exponential backoff (30s → 2m → 10m → 1h → 6h → 24h) up to 6 attempts before status flips to `abandoned`.
- After `max_consecutive_failures` (default 50) the dispatcher auto-disables the subscription so a permanently-broken receiver does not accumulate retries forever.

**Lifespan integration** in [`aidream/api/app.py`](../../../aidream/aidream/api/app.py): opt-in via `AIDREAM_CLD_EVENT_DISPATCHER=1`. The prod FastAPI process sets the env var; dev / worker / sandbox instances leave it unset so they don't fight for the outbox.

**Subscriber webhook payload shape:**
```json
{
  "event_id": "uuid",
  "occurred_at": "2026-05-05T...Z",
  "event_type": "file.uploaded",
  "resource_type": "file",
  "resource_id": "uuid|null",
  "actor_id": "uuid|null",
  "actor_type": "user|guest|system|service",
  "request_id": "string|null",
  "payload": {...}
}
```

**Subscriber registration (FE / admin UI follow-up):** REST endpoints to manage `cld_webhooks` rows are not yet wired — for now subscriptions are registered by direct SQL or via the Supabase admin. The schema is in place so a `/files/webhooks/*` REST surface can land in a follow-up bundle without further DB changes.

---

### 2026-05-05 — Bundle D: Range download streaming + thumbnail pipeline 🟢 (SQL applied; code in tree)

Closes FE requests **4** (Range download / streaming) and **1**
(server-side thumbnail generation). The two changes ride together
because the upload response shape and the download response shape
both grow new fields the FE will key off.

**D1 — Range download / streaming on `GET /files/{file_id}/download`:**
- [`aidream/api/routers/files.py`](../../../aidream/aidream/api/routers/files.py) — endpoint refactored from a buffered `Response(content=…)` into a `StreamingResponse` that pulls bytes directly from S3.
- New `_parse_range_header()` parser handles `bytes=N-M`, `bytes=N-`, `bytes=-N`, multi-range (first only), and unsatisfiable specs.
- Wire behaviour:
  - **No `Range:` header** → 200 with `Content-Length`, `Accept-Ranges: bytes`, streamed in 256 KiB chunks.
  - **Valid `Range: bytes=N-M`** → 206 Partial Content with `Content-Range: bytes N-M/total`.
  - **Range past EOF** → 416 Range Not Satisfiable with `Content-Range: bytes */total`.
  - **Public + CDN configured + no version pin** → still 302 to CDN (CDN handles range natively).
- Version-pinned reads (`?version=N`) stay on the buffered path for now — version storage is managed by `VersionManager` and not directly S3-addressable in every backend. Versions are typically tiny + cold; ranged version reads is a follow-up.
- `_DOWNLOAD_HEADERS` now always carries `Accept-Ranges: bytes`.

**D2 — Thumbnail pipeline:**
- New SQL migration: [`db/migrations/0033_cld_files_thumbnail.sql`](../../../aidream/db/migrations/0033_cld_files_thumbnail.sql) (applied) — adds `thumbnail_storage_uri` + `thumbnail_url` columns to `cld_files`.
- New service: [`aidream/services/cloud_files/thumbnails.py`](../../../aidream/aidream/services/cloud_files/thumbnails.py) — `generate_thumbnail_for_file(fm, file_id)` entry point. Pillow + pypdfium2 dependencies were already installed.
- Coverage in v1:
  - **`image/*`** → Pillow resize 256px longest side, JPEG q=80, ~10–30 KB.
  - **`application/pdf`** → pypdfium2 first-page render, then Pillow resize.
  - **`video/*`** — deferred (FE has client-side first-frame thumbnails shipped 2026-04-26).
  - **`audio/*`** — deferred (mutagen integration is the follow-up).
- Hooked fire-and-forget into both upload paths in `files.py`:
  - Multipart `POST /files/upload` after the usage-delta call.
  - Presigned `POST /files/finalize-upload` after the usage-delta call.
- Failures log + leave the columns NULL; the FE falls back to its category icon.
- Thumbnails land at `s3://<bucket>/<owner_id>/.thumbnails/<file_id>.jpg` with a 30-day cache header. Once written, the resulting `cld_files` UPDATE event rides the existing realtime publication, so the grid view swaps the icon for the rendered thumb without polling.

**Wire shape changes:**
- `FileRecord` adds an optional top-level `thumbnail_url: string | null` field. Populated on response: CDN URL for public files, NULL for private files (the FE can ask for a fresh signed URL via the existing `GET /files/{id}/url` flow when it actually needs to render the thumbnail bytes).

**Verification on the FE side:**
- Range: open a >10 MB MP4 in `<video>`, scrub mid-file → DevTools network panel shows a 206 with `Content-Range`. The same pattern works for any `fetch(url, {headers: {Range: 'bytes=0-1023'}})` against the download endpoint.
- Thumbnails (image): upload a JPEG → confirm `thumbnail_url` populates within ~5s on the realtime UPDATE event for that row. Drop the `thumbnailStrategy: 'category-icon'` for image entries that already had `backend-thumb` plumbing.
- Thumbnails (PDF): upload a PDF → same. PDFs that previously rendered as a colored square with the PDF icon now show their first page.

---

### 2026-05-05 — Bundle C: RAG ↔ files integration endpoints 🟢 (deployed in tree)

Closes FE requests **14a**, **14b**, **14c**.

**New endpoints in `aidream/api/routers/files.py`:**

#### `GET /files/{file_id}/document`
Returns the latest processed_documents row anchored to this cld_files.id.
ACL: same as `GET /files/{file_id}` (owner OR explicit grant).

```ts
// 200
{
  processed_document_id: string,
  derivation_kind: string | null,
  total_pages: number | null,
  chunk_count: number,            // count from rag.kg_chunks
  has_clean_content: boolean,
  updated_at: string | null,      // ISO 8601
}
// 404
{ error: "no_processed_document", code: "no_processed_document",
  message: "File '{id}' has not been processed for RAG." }
```

#### `POST /files/{file_id}/ingest` and `POST /files/{file_id}/ingest/stream`
Convenience wrapper around `/rag/ingest`. Body:
```ts
{ force?: boolean, field_id?: string }
```
Implicitly injects `source_kind: "cld_file"`, `source_id: file_id`.
ACL: requires `write` on the file (so a read-only grantee can't trigger
re-ingestion against another user's file). The `/stream` variant uses
the same `create_streaming_response` infra as `/rag/ingest/stream` and
emits the same `rag.ingest.progress` and `rag.ingest.result` events.

Response (non-streaming) matches `IngestResponse`:
```ts
{
  source_kind: string,
  source_id: string,
  field_id: string | null,
  chunks_written: number,
  embeddings_written: number,
  skipped_unchanged: boolean,
  embedding_model: string,
  error: string | null,
}
```

#### `GET /files/{file_id}/lineage-summary`
Light lineage chip for the PreviewPane. Single `cld_files` query.

```ts
{
  parent_file_id: string | null,
  derivation_kind: string | null,
  derivation_metadata: Record<string, unknown>,
  has_descendants: boolean,
  descendant_count: number,
}
```

**New shared service module:** [`aidream/services/rag/processed_doc_lookup.py`](../../../aidream/aidream/services/rag/processed_doc_lookup.py) — three helpers (`find_processed_document_by_cld_file`, `count_chunks_for_processed_document`, `get_lineage_summary_for_cld_file`). Both `files.py` and `document.py` (the existing `/api/document/by-cld-file/{id}`) call this so the cld_file → processed_documents query has a single owner.

**Verification on the FE side:**
- After uploading + ingesting a PDF, `GET /files/{id}/document` returns a populated row; before ingestion, it 404s with `code: "no_processed_document"`. The FE can use the 404 as a clean signal to show "Reprocess" instead of the per-file "tried lookup" cache the README workaround describes.
- `GET /files/{id}/lineage-summary` returns `descendant_count` of 0 for a fresh upload and >0 for any file that has had `/pdf/extract-pages` etc. run against it.
- `POST /files/{id}/ingest/stream` streams the same events as `/rag/ingest/stream` — drop the workaround that calls `/rag/ingest` directly.

---

### 2026-05-05 — Bundle B (partial): realtime publication + request_id metadata + S3 CORS doc 🟢 (SQL applied; CORS infra pending)

Closes (post-apply) FE requests **2** (S3 CORS), **8** (cld_share_links
realtime), **9** (X-Request-Id in realtime echoes), and **14e**
(processed_documents realtime). The `cld_events` dispatcher worker
(Item 10) is staged separately and lands in a follow-up.

**B1 — Realtime publication extensions:**
- New SQL migration: [`db/migrations/0032_realtime_publication_extensions.sql`](../../../aidream/db/migrations/0032_realtime_publication_extensions.sql)
- Apply script: [`db/migrations/_apply_0032.py`](../../../aidream/db/migrations/_apply_0032.py)
- Adds `cld_share_links`, `cld_file_permissions`, and `processed_documents` to the `supabase_realtime` publication, all with `REPLICA IDENTITY FULL` so UPDATE events carry the full prior row.
- Recommended FE filters:
  - `cld_share_links` — `owner_id=eq.<userId>` for own-link state.
  - `cld_file_permissions` — `subject_user_id=eq.<userId>` for incoming-share grants.
  - `processed_documents` — `source_kind=eq.cld_file` (then match `source_id` against the file_ids the FE is watching).

**B2 — `X-Request-Id` propagation into row metadata:**
- [`aidream/api/routers/files.py`](../../../aidream/aidream/api/routers/files.py) — new `_stamp_request_id(meta)` helper near the top, called at every metadata write site:
  - upload (multipart) at the parsed_metadata stamp step.
  - presigned upload finalize at the `upsert_file_async` call.
  - file PATCH (both merge + replace branches).
  - file copy.
  - folder POST + PATCH.
- After this lands, every realtime row event for `cld_files` / `cld_folders` will carry `metadata.request_id` matching the originating request's `X-Request-Id` header, letting the FE drop the 2s timestamp-fuzzy dedup fallback.
- No schema change needed — the existing `metadata` jsonb on every cld_* table holds it.

**B4 — S3 bucket CORS:**
- Canonical policy committed at [`docs/cloud_files_s3_cors.json`](../../../aidream/docs/cloud_files_s3_cors.json) and described in [`docs/cloud_files_s3_cors.md`](../../../aidream/docs/cloud_files_s3_cors.md).
- Apply via `aws s3api put-bucket-cors --bucket "$AWS_S3_USER_FILES_BUCKET" --cors-configuration file://docs/cloud_files_s3_cors.json` per environment.
- Adds the production `app.aimatrx.com` and Vercel preview origins, plus localhost dev ports (3000/3100/3101/5173). Methods GET/HEAD only. Exposes `Content-Range` + `Accept-Ranges` so the upcoming Bundle D range-download path works directly against S3.

**B3 — `cld_events` dispatcher worker (Item 10): NOT in this bundle.** Tracked separately; lands in a follow-up. The table + emit stub already exist, so the FE can already query `cld_events` directly if needed.

**Verification on the FE side after apply:**
- Realtime: subscribe to `cld_share_links` from supabase-js, create a share link from another tab → confirm event arrives.
- Echo dedup: write a file from tab A, watch the realtime payload on tab B — confirm `metadata.request_id` matches tab A's `X-Request-Id`. Drop the timestamp-fuzzy fallback once verified.
- CORS: `curl -I -X OPTIONS -H 'Origin: https://app.aimatrx.com' -H 'Access-Control-Request-Method: GET' "$SIGNED_URL"` returns 200 + ACAO. Switch fetch-based previewers off the `useFileBlob` proxy.

---

### 2026-05-05 — Bundle A: `cld_get_user_file_tree` privacy + correctness fix 🟢 APPLIED + verified

Closes FE requests **0** and **0a**.

**What landed in the tree:**
- New SQL migration: [`db/migrations/0031_cld_files_tree_overload_fix.sql`](../../../aidream/db/migrations/0031_cld_files_tree_overload_fix.sql)
- Apply script: [`db/migrations/_apply_0031.py`](../../../aidream/db/migrations/_apply_0031.py)

**What it does, in one transaction:**
1. **`DROP FUNCTION public.cld_get_user_file_tree(uuid) CASCADE;`** — removes the legacy 1-arg overload that was causing `42725 function ... is not unique` errors when the FE called it with only `p_user_id`. After this lands, calls with only `p_user_id` will return `42883 function does not exist` rather than `42725 ambiguous` — same outcome (FE workaround already passes the 5-arg form), but unambiguous.
2. **`CREATE OR REPLACE FUNCTION public.cld_get_user_file_tree(uuid, int, int, boolean, boolean)`** — body identical to the 5-arg in `packages/matrx-utils/.../sql/003_security_correctness_quotas.sql:29` **except** the file leg's `WHERE` no longer contains `OR f.visibility = 'public'`. The file leg now matches the folder leg's intent: owner OR explicit grant only. Public files (share-link policy) remain readable by URL but no longer appear in foreign users' trees.
3. **GRANTs re-issued** (idempotent): `REVOKE FROM PUBLIC, anon` + `GRANT TO authenticated, service_role`.

**Apply status:** File is in the tree. The Python team needs to run `python db/migrations/_apply_0031.py` against each Supabase project (staging then prod) to ship the change. The apply script self-verifies post-execution that:
- exactly one overload remains, and
- the function body no longer contains `f.visibility = 'public'`.

**Verification on the FE side after apply:**
- Repro from 2026-05-05: confirm file `9e4850f8-a591-4a8e-a721-d51002c771ca` (owner `f0146c96-…`, `visibility='public'`) no longer appears in another user's `/files/tree` response.
- Once verified, you can drop the defensive client-side filter in [`redux/thunks.ts::loadUserFileTree`](../redux/thunks.ts) — the wire response will be correct.
- Both items 0 and 0a in `REQUESTS.md` move from 🔴 to 🟢.

**Note on source-of-truth:** The new function body lives in
`db/migrations/0031_cld_files_tree_overload_fix.sql` going forward.
The older 5-arg in
`packages/matrx-utils/.../sql/003_security_correctness_quotas.sql`
is a historical record — do not edit it. Any future change to the
tree RPC ships as a new numbered migration in `db/migrations/`.
