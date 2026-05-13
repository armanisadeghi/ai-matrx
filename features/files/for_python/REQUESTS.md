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
> Last updated: 2026-05-05.

---

## Status legend

- 🔴 **blocking** — FE work is stalled until this lands.
- 🟡 **open** — asked, awaiting movement.
- 🟠 **deferred** — agreed not to do now; tracked for later.
- 🟢 **resolved** — shipped + verified on our side.

---

## Open items

### 0. 🔴 Drop the legacy 1-arg overload of `cld_get_user_file_tree`

**Priority:** **High — was silently breaking every authenticated file
manager view (zero files / blank Recents / "loading" never resolves).**

**Context:** Two overloads of `cld_get_user_file_tree` are defined on
the production Postgres:

```sql
cld_get_user_file_tree(p_user_id uuid)                          -- legacy
cld_get_user_file_tree(p_user_id uuid,
                       p_limit int       DEFAULT 5000,
                       p_offset int      DEFAULT 0,
                       p_include_folders boolean DEFAULT true,
                       p_include_deleted boolean DEFAULT false)  -- new
```

A FE call that supplies only `p_user_id` (`supabase.rpc(name, { p_user_id })`)
fails with `42725: function public.cld_get_user_file_tree(uuid) is not unique`
— Postgres can't pick a best candidate. PostgREST surfaces this as a
4xx; the FE flips `tree.status` to `error` and renders zero files.

**FE workaround (shipped now):** pass the new overload's params
explicitly on every call so the resolution is unambiguous:

```ts
supabase.rpc("cld_get_user_file_tree", {
  p_user_id: userId,
  p_limit: 5000,
  p_offset: 0,
  p_include_folders: true,
  p_include_deleted: false,
});
```

This routes us to the 5-arg overload reliably (which is also the one
that returns folders + the unified `{ kind, path, name, parent_id,
size_bytes, ... }` row shape).

**Ask:** Drop the legacy 1-arg overload — `DROP FUNCTION
cld_get_user_file_tree(uuid);` — once you confirm no other consumer
relies on it. Keeping both around will silently break any new caller
that doesn't know about the ambiguity.

**Blocker?** No (FE workaround is in place) — but **was** blocking
every browser file-manager view until the workaround landed.

---

### 0a. 🔴 `cld_get_user_file_tree` leaks every `visibility = 'public'` file across users

**Priority:** **High — privacy / correctness issue. Every user
currently sees every public file in the entire system inside their
own `/files` view (Photos especially — public images from other users
appear in the user's Photos grid).**

**Reported by:** Arman, 2026-05-05. Repro: image
`9e4850f8-a591-4a8e-a721-d51002c771ca` (`cover.jpg`, owner
`f0146c96-e02e-420b-a99f-92774da0566c`, `visibility='public'`)
appeared in a different user's Photos page.

**Root cause:** The 5-arg overload of `cld_get_user_file_tree`
(`p_user_id`, `p_limit`, `p_offset`, `p_include_folders`,
`p_include_deleted`) has a `WHERE` clause for the file leg that
treats `visibility = 'public'` as "include this file in this user's
tree":

```sql
-- public.cld_get_user_file_tree(uuid, int, int, bool, bool)
SELECT 'file'::text AS kind, f.id, f.owner_id, ...
FROM cld_files f
WHERE (p_include_deleted OR f.deleted_at IS NULL)
  AND (
      f.owner_id = p_user_id
      OR f.visibility = 'public'                                 -- ← BUG
      OR cld_get_effective_permission(f.id, p_user_id) IS NOT NULL
  )
```

`visibility = 'public'` is the **share-link policy** ("anyone with the
URL can read") — it is NOT supposed to scope membership in a user's
tree. Concretely: a podcast cover image, an Open Graph image, or any
file someone made public via a share link should be readable by URL
but should **not** show up in another user's Photos / All Files /
Recents views.

The folder leg of the same function correctly uses
`AND d.owner_id = p_user_id` (no public-OR clause), which is why
folders are scoped correctly and only files leak.

The legacy 1-arg overload `cld_get_user_file_tree(p_user_id uuid)`
has the same bug. It should be dropped per item 0 above; the same
fix should be applied if that overload is kept around.

**Ask:** Drop the `OR f.visibility = 'public'` clause. The file leg
should match the folder leg's intent — owner OR explicit grant only:

```sql
WHERE (p_include_deleted OR f.deleted_at IS NULL)
  AND (
      f.owner_id = p_user_id
      OR cld_get_effective_permission(f.id, p_user_id) IS NOT NULL
  )
```

If you intentionally want public-but-shared-with-me files to appear
in the tree, that's a separate predicate — e.g. an INNER JOIN against
`cld_share_links` filtered to links the current user redeemed — and
should NOT be implemented by the global `visibility = 'public'`
flag.

A migration that swaps both overloads in one transaction is fine. As
soon as it lands and we verify the cross-user repro doesn't return
foreign rows, we'll remove the FE defensive filter (see workaround
below) and you can take this item to 🟢.

**Blocker?** No (FE defensive filter shipped) — **but it is a
privacy issue in production until your fix lands**, because anyone
with raw `supabase.rpc("cld_get_user_file_tree", ...)` access (i.e.
any authed user) gets back the full list of every public file's
metadata (owner_id, file_path, file_name, mime_type, created_at,
file_size). The FE filter only cleans up the FE display; the wire
response still contains foreign rows. Treat the SQL fix as the real
remediation.

**Current FE workaround:** [redux/thunks.ts](../redux/thunks.ts)
`loadUserFileTree` filters the parsed RPC rows client-side: a `file`
row is kept only when `owner_id === userId` OR `effective_permission
!== null`. Folders pass through (already correctly scoped server-side).
Realtime middleware was already correctly scoped via
`filter: owner_id=eq.${userId}` so live updates were never affected.

---

### 1. 🟡 Server-side thumbnail / poster generation on upload

**Priority:** Medium (significant UX win; no user-facing breakage today).

**Context:** The grid view falls back to a category icon for every
file type that isn't an image. We added a client-side first-frame
poster for videos in 2026-04-26 — but PDFs, presentations, documents,
audio cover art, and any future format with a meaningful visual still
render as colored squares with a small icon. That's the single biggest
reason the grid view feels less polished than Dropbox / Drive / Box.

**Ask:** On every successful upload, generate a small thumbnail
(target 256×256 longest side, JPEG or WebP, ~10–30KB) and expose it
via either:
1. `metadata.thumbnail_url` on `FileRecord` (FE already plumbed —
   just populate the field), OR
2. A new `cld_files.thumbnail_storage_uri` column + a
   `GET /files/{id}/thumbnail` endpoint, OR
3. Convention: `s3://bucket/<owner>/<file_id>/thumb.webp`

Per file kind:
- **Image** → resize the source (Pillow / sharp)
- **Video** → first-frame at t=0 (ffmpeg)
- **PDF** → first page rasterized (pdf2image / Poppler)
- **Audio** → embedded album art if any (mutagen / eyed3)
- **DOCX / PPTX** → first slide / page render (LibreOffice unoconv)
  — nice-to-have

**Why option 1 is easiest for us:** FE has a `backend-thumb`
thumbnail strategy in the file-type registry that reads
`metadata.thumbnail_url` and falls back to the category icon when
missing. As soon as the field is populated, that record renders the
backend thumbnail — no FE work beyond switching a few entries'
`thumbnailStrategy` value in
[features/files/utils/file-types.ts](../utils/file-types.ts).

**Blocker?** No.

**Current FE workaround:** Client-side video first-frame thumbnails
shipped. No client-side path for PDF / cover art (would require
loading a 400KB pdfjs bundle in the folder listing — not worth it).

---

### 2. 🟡 S3 bucket CORS for browser `fetch()` of signed URLs

**Priority:** Medium (DX + latency, not a correctness break).

**Context:** Signed URLs returned by `GET /files/{id}/url` work fine
for HTML elements that don't trigger CORS (`<img>`, `<video>`,
`<audio>`, `<iframe>`, anchor navigation). They fail with `HTTP 403
Forbidden` when the browser does `fetch(signedUrl)` because the
`matrx-user-files` bucket policy doesn't allow our origin in CORS, so
the preflight is rejected. This was breaking PDF / Markdown / Code /
Text / Data previews — all of which need to read bytes via `fetch()`
(or pdfjs's worker, which uses fetch under the hood).

**Ask:** Add production app origins to the bucket CORS policy:

```xml
<CORSConfiguration>
  <CORSRule>
    <AllowedOrigin>https://app.aimatrx.com</AllowedOrigin>
    <AllowedOrigin>https://*.vercel.app</AllowedOrigin>
    <AllowedOrigin>http://localhost:3000</AllowedOrigin>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <ExposeHeader>Content-Length</ExposeHeader>
    <ExposeHeader>Content-Type</ExposeHeader>
    <MaxAgeSeconds>3600</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>
```

**Blocker?** No.

**Current FE workaround:** Every fetch-based previewer routes through
the Python `GET /files/{id}/download` endpoint via the
[useFileBlob](../hooks/useFileBlob.ts) hook — same-origin blob URL,
no CORS preflight. Removing the workaround is a latency / bandwidth
win, not a correctness fix.

---

### 3. 🟡 Resumable / TUS uploads for files larger than 100 MB

**Priority:** Medium (blocks video, large datasets, codebase
imports).

**Context:** Current cap on the buffered path is 100 MB (tier
default; bypass header allows up to 5 GB). User flows that hit this
today: podcast episodes, training video captures, multi-GB datasets.

**Ask:** TUS or S3 multipart upload support — either a presigned
multipart init + complete endpoint, or a full TUS server.

**Blocker?** No.

**Current FE workaround:** Error early with a clear "contact
support for large uploads" message and skip the file.

---

### 4. 🟡 Range download / streaming response on `/files/{id}/download`

**Priority:** Medium (blocks video scrubbing, partial reads).

**Context:** The endpoint currently buffers the whole file into
memory before returning. We need `Range:` header support so video
players can seek and so large-file downloads stream.

**Ask:** Stream the S3 byte stream directly through FastAPI;
implement `Range:` request handling.

**Blocker?** No — small video files work fine.

---

### 5. 🟡 CDN-backed permanent URLs for `visibility="public"` files

**Priority:** Low.

**Context:** Signed S3 URLs cap at 7 days. Anything user-facing
(podcast feed images, public landing imagery, share previews
embedded in third-party sites) needs a permanent URL.

**Ask:** A CDN (CloudFront / Cloudflare) in front of public files
with stable URLs like `https://cdn.aidream.com/<file_id>` that
authenticate via the file's `visibility` flag.

**Blocker?** No.

---

### 6. 🟡 Storage re-keying by `file_id` (not logical path)

**Priority:** Low — architectural cleanup.

**Context:** S3 keys today are `s3://<bucket>/<owner_id>/<file_path>`,
which bakes the logical path into the physical key. Every rename or
bulk move re-copies bytes (or accepts drift between
`cld_files.file_path` and `cld_files.storage_uri`).

**Ask:** Re-key by `file_id` (or `<owner>/<file_id>`). The DB row's
`file_path` becomes the only logical mutable field. Renames become
free; tenant migration becomes a single UPDATE; storage stays
immutable.

**Blocker?** No — current bulk-move shipped works.

---

### 7. 🟡 Confirm `POST /folders` accepts path-style `folder_path`

**Priority:** Low.

**Context:** The FE's `ensureFolderPath` thunk creates intermediate
folders (e.g. "Images/Chat/2026") via supabase-js because no
backend equivalent existed. With `POST /folders` live, we want to
delete that thunk's supabase-js path too.

**Ask:** Confirm `POST /folders` accepts `{ folder_path: "A/B/C" }`
and creates each missing segment atomically (matching upload
auto-create semantics). If not, please add it — the alternative is
the FE sequencing N create calls, which races on concurrent uploads
to the same path.

**Blocker?** No — supabase-js path still works.

---

### 8. 🟡 Confirm realtime publishes `cld_share_links` events

**Priority:** Low.

**Context:** We need share-link UI to update live when the owner
creates / revokes a link from another device. Backend doc lists
`cld_files`, `cld_file_versions`, `cld_file_permissions` as
realtime-published; share-links is unconfirmed.

**Ask:** Confirm publication on `cld_share_links`. If yes, what
filter key (owner? resource_id?) makes sense?

**Blocker?** No — share-link UI re-fetches on focus until this is
confirmed.

---

### 9. 🟡 Thread `X-Request-Id` into realtime echo payloads

**Priority:** Low — quality-of-life.

**Context:** Our client generates a `requestId` for every mutation
and sends it as `X-Request-Id`. The realtime middleware uses it to
dedup echoes of our own writes so optimistic state isn't overwritten
by the server broadcast. If the realtime payload doesn't carry
`request_id`, we fall back to a 2s timestamp-fuzzy match against
recent own writes to the same `file_id` — works but brittle under
clock skew or parallel edits.

**Ask:** When a write is made, include `request_id` in the realtime
payload — either as a dedicated column on the changed row, or
inside `metadata.request_id`. Either works; the second requires no
schema change.

**Blocker?** No — timestamp-fuzzy fallback is shipped.

---

### 10. 🟡 Webhooks / SSE for events beyond Supabase Realtime

**Priority:** Low.

**Context:** Eventually we want third-party integrations
(Slack notify on share, Zapier on upload, etc.). Supabase Realtime
is fine for in-app UI but isn't a webhook system.

**Ask:** A `cld_events` table + worker for periodic batch
processors (lifecycle, search index, audit, webhooks). Audit logs +
webhooks ride on the same event bus.

**Blocker?** No.

---

### 11. 🟠 Per-org tenancy

**Priority:** Deferred — schema columns added, no immediate
business need.

**Context:** Single `owner_id` works for personal Drive. The instant
a customer says "my team needs shared folders" or "we want billing
per-org", the data model needs `organization_id` on every row.
Backend has added the columns but routes are still single-owner.

**Ask:** When the org product lands, populate `organization_id` on
new uploads + add an org-aware variant of `cld_get_user_file_tree`.
Deferred until org product spec lands.

**Blocker?** No.

---

### 12. 🟠 Comments / annotations / file locking

**Priority:** Deferred — collaboration features for a later phase.

---

### 13. 🟠 Antivirus scan on upload

**Priority:** Deferred — compliance feature.

**Context:** S3 → Lambda → ClamAV (or vendor scan) on every upload
that lands in shared folders. For internal-only uploads we can defer.

---

### 14. 🟡 RAG / processed-document integration into `/files`

**Priority:** Medium-high. Unblocks surfacing the RAG team's
processed-document model (`processed_documents` + `processed_document_pages`
+ `rag.kg_chunks`) inside the cloud-files surfaces — preview pane, file
context menu, document viewer deep-links.

**Context:** The RAG team landed Phases 4A/4B from
`/Users/armanisadeghi/.claude/plans/please-review-the-requirements-zany-sphinx.md`:

- Migrations `0006_cld_files_lineage.sql`, `0007_processed_documents.sql`,
  `0008_kg_chunks_processed_doc_fk.sql` are live.
- `cld_files` has `parent_file_id`, `derivation_kind`, `derivation_metadata`.
- `/api/document/*` endpoints exist:
  - `GET /api/document/{doc_id}` → `DocumentDetail`
  - `GET /api/document/{doc_id}/lineage` → `LineageTree`
  - `GET /api/document/{doc_id}/pages` → `PageSummary[]`
  - `GET /api/document/{doc_id}/page/{n}` → `PageDetail`
  - `GET /api/document/{doc_id}/page/{n}/image` → 307 to signed URL
  - `GET /api/document/{doc_id}/chunks` → `ChunkRow[]`
- `/rag/ingest` and `/rag/ingest/stream` accept `{ source_kind, source_id, field_id?, force? }`.
- `/rag/search`, `/rag/search/stream`, `/rag/cross-doc/stream` are wired.
- `/rag/admin/*` overview/library/sources/audit endpoints are wired.
- AI tools `rag_list_data_stores`, `rag_get_data_store`, `rag_search_data_store` exist
  but there is **no public REST equivalent yet**.

The FE side has read scaffolding in `features/rag/` (was `features/documents/` until the 2026-05-06 consolidation):
- `types.ts` — full Pydantic mirror.
- `api/document.ts` — typed client for every document endpoint.
- `hooks/useDocument.ts` — `useDocument`, `useDocumentLineage`, `useDocumentPage`, `useDocumentChunks`.
- `components/DocumentViewer.tsx` — 4-pane synchronized viewer.
- `components/LineageBreadcrumbs.tsx` — compact lineage chips.
- `components/panes/{Pdf,RawText,CleanedMarkdown,Chunks}Pane.tsx` — per-pane renderers.
- Route `/rag/viewer/[id]` mounts the viewer with `?page=&chunk=` deep-links.

**What's missing on the backend to integrate this with `/files`:**

#### a) `GET /files/{file_id}/document` — find a file's processed_document

We need to know: "given a `cld_files.id`, is there a `processed_documents` row
whose `(source_kind='cld_file', source_id=<file_id>)` covers it, and what's its
processed_document_id?"

Today there is no endpoint for this. The FE would have to call `/rag/admin/library`
and filter — too heavy for a per-file lookup, and admin-scoped.

**Ask:** add

```
GET /files/{file_id}/document
  → 200 { processed_document_id: uuid, derivation_kind: str, total_pages: int, chunk_count: int, has_clean_content: bool, updated_at: timestamptz }
  → 404 { code: "no_processed_document", message: "..." }   # not yet ingested
```

ACL: same as `GET /files/{file_id}` (owner OR org member OR shared with user).
The Python implementation is one query against `processed_documents` filtered by
`source_kind='cld_file' AND source_id=:file_id` ordered by `created_at DESC`
LIMIT 1 — if multiple processings exist (re-extract / re-clean), return the
latest. Older processings remain accessible by direct `processed_document_id`.

#### b) `POST /files/{file_id}/ingest` — convenience wrapper

`/rag/ingest` already accepts `{ source_kind: "cld_file", source_id, force }`
but the FE has to know to dispatch on `source_kind`. A wrapper at
`POST /files/{file_id}/ingest` accepting `{ force?: boolean }` simplifies
the contract for the file-centric UI: "reprocess this file for RAG" is
a file-action, not a RAG-system-action. Internally calls the same
`ingest_source(...)` function. Returns the same `IngestResponse`. Streaming
counterpart `POST /files/{file_id}/ingest/stream` likewise.

#### c) `GET /files/{file_id}/lineage-summary` — light lineage chip

The PreviewPane wants a small lineage indicator without paying for the full
`/api/document/{id}/lineage` walk. Surface

```
GET /files/{file_id}/lineage-summary
  → { parent_file_id?: uuid, derivation_kind?: str, has_descendants: bool, descendant_count: int }
```

This is a single query against `cld_files` (parent + count of `WHERE parent_file_id=:id`).
The PreviewPane shows the chip; clicking opens the full lineage tree
in a side panel.

#### d) Public REST surface for data stores (defer if hard)

The AI tools `rag_list_data_stores` / `rag_get_data_store` / `rag_search_data_store`
let an agent discover data stores at runtime. The FE wants to ship a curation UI
("Add this file to a data store", "Browse data stores in this org") which needs
the same data exposed as REST.

```
GET  /rag/data-stores?scope=user|org              → DataStore[]
GET  /rag/data-stores/{id}                        → DataStore
GET  /rag/data-stores/{id}/sources                → DataStoreSource[]
POST /rag/data-stores/{id}/sources                → add a source { source_kind, source_id }
DELETE /rag/data-stores/{id}/sources/{source_id}  → remove
POST /rag/data-stores                             → create
PATCH /rag/data-stores/{id}                       → update awareness mode, name, etc.
DELETE /rag/data-stores/{id}                      → delete
```

Awareness modes per the plan: `none | hint | inline_small`. Defer this if it's
not already trivial; the FE can ship without curation in v1 and add it once
the REST surface lands.

#### e) Realtime: `processed_documents` row events

When ingest completes, push a `processed_documents.inserted` /
`processed_documents.updated` event over the same Realtime channel
the FE already subscribes to for `cld_files`. Today the FE has to
poll after kicking off ingest. With realtime, the moment ingestion
finishes, the PreviewPane can flip the "Document" tab from
"Not yet ingested → Reprocess" to the live viewer without polling.

Filter: `source_kind = 'cld_file'` AND `source_id` matches one of the
file ids the FE is currently watching.

**Blocker?**

- (a) and (b) — light blockers for the integration story. Without (a),
  the FE would have to either (1) poll `/api/document/{file_id}` (won't work,
  document IDs aren't file IDs) or (2) maintain the `cld_files.derivation_kind`
  + a "first ingestion" indicator in metadata as a heuristic. Neither is great.
- (c) — soft blocker; we can compute parent locally from `cld_files.parent_file_id`,
  but the descendant count needs a query.
- (d) — defer-OK; AI tools cover the agent surface, and a v1 curation UI can
  ship behind a feature flag once REST lands.
- (e) — defer-OK; polling-on-ingest works for v1, realtime is the polish step.

**Current FE workaround:**

- (a) — feature-detect by trying `GET /api/document/{file_id}` first; if the
  document router returns 404 we assume "not ingested." This works for `cld_file`
  source kind because `processed_documents.id ≠ cld_files.id` so we'll always 404,
  rendering the workaround useless. **The cleanest path is the new endpoint.**
  Until then, the FE will store a per-file "tried lookup" cache in module memory
  and gracefully render "Document view not available — try Reprocess" with a
  non-blocking message.
- (b) — call `/rag/ingest` directly with `{ source_kind: "cld_file", source_id }`.
  Works today; the wrapper is a nice-to-have.
- (c) — read `parent_file_id` from the `cld_files` row already in Redux; render
  the "this file is derived from …" chip from local data, skip descendant count.
- (e) — manual "Refresh" button on the PreviewPane#document tab after
  triggering ingest.

---

## Resolved items

(Most recent first.)

### 🟢 CORS `Access-Control-Allow-Headers` includes all upload custom headers

**Resolved:** 2026-04-26 (Python).

**What broke:** After the security/CORS lockdown release, the
preflight `Access-Control-Allow-Headers` was missing `Accept`,
`X-Idempotency-Key`, and `X-Cloud-Files-Bypass` (plus several
browser-default headers). Starlette's `CORSMiddleware` only echoes
back what's in `allow_headers`, so the preflight silently rejected
any request whose actual request-header set wasn't a subset. Browser
symptom: every direct (non-proxy) upload returned `xhr.error` after
~30 ms — a cached preflight rejection. At the time, only the
same-origin Next.js+Sharp `/api/images/upload` proxy worked. (That
route was deleted on 2026-05-12 once the FE migrated to calling
the canonical Python `POST /assets` endpoint directly.)

**What shipped:** Python's `aidream/api/app.py` middleware now
allows the full canonical set:
```
Authorization, Content-Type, Accept,
X-Request-Id, X-Guest-Fingerprint, X-Fingerprint-ID,
X-Idempotency-Key, X-Cloud-Files-Bypass,
+ accept-encoding, accept-language, cache-control, pragma,
+ content-length, content-disposition, content-type,
+ if-match, if-modified-since, if-none-match, if-unmodified-since,
+ origin, range, referer, user-agent, x-requested-with,
+ x-correlation-id, x-sandbox-service-token
```
plus `HEAD` added to `allow_methods` and `Last-Modified`,
`Content-Range`, `Accept-Ranges`, `Content-Disposition` to
`expose_headers`.

**FE side:** Re-enabled `X-Idempotency-Key` as the default on every
upload — both in [features/files/upload/cloudUpload.ts](../upload/cloudUpload.ts)
(both `cloudUploadRaw` paths and the dispatch-aware `cloudUpload`)
and in the `uploadFiles` thunk in
[features/files/redux/thunks.ts](../redux/thunks.ts). Each upload
reuses its `requestId` as the idempotency key so any automatic retry
hits the same backend record (stored in
`metadata._idempotency_key`).

---

### 🟢 Folder CRUD endpoints

**Resolved:** 2026-04-26.
**Ship:** `POST /folders`, `PATCH /folders/{id}`,
`DELETE /folders/{id}` are live. FE wired in
[features/files/api/folders.ts](../api/folders.ts) and consumed by
`createFolder`, `updateFolder`, `deleteFolder` thunks. No browser-side
writes to `cld_folders` remain in the upload + folder-CRUD paths.

---

### 🟢 Bulk operations

**Resolved:** 2026-04-26.
**Ship:** `DELETE /files/bulk`, `POST /files/bulk/move`, `POST
/folders/bulk/move`. The wire envelope is `BulkResponse`:
`{ results: BulkResultItem[], succeeded: number, failed: number }`
where each `BulkResultItem = { id, ok, error }`.
**FE side:** [features/files/api/files.ts](../api/files.ts) +
[folders.ts](../api/folders.ts); thunks `bulkDeleteFiles`,
`bulkMoveFiles`, `bulkMoveFolders` consume the envelope with
optimistic local apply + per-item rollback when items report `ok: false`.

---

### 🟢 New endpoints wired (2026-04-26)

| Endpoint | FE consumer |
|---|---|
| `GET /files/usage` | `Files.getStorageUsage` |
| `GET /files/trash` | `Files.listTrash` |
| `POST /files/{id}/restore` | `Files.restoreFile` |
| `GET /files/search` | `Files.searchFiles` |
| `POST /files/{id}/rename` | `Files.renameFile` (drives both rename + single-file move thunks; obsoletes the old metadata-hack patch) |
| `POST /files/{id}/copy` | `Files.copyFile` |

---

### 🟢 Migrate-guest-to-user breaking contract reconciled

**Resolved:** 2026-04-26.
**Change:** Body shape became `{ new_user_id, guest_id? }`,
fingerprint moved to required `X-Guest-Fingerprint` header.
**FE side:** `migrateGuestToUser` thunk + `Files.migrateGuestToUser`
client function rewritten. Dual-name response (`files` +
`files_migrated` etc.) accepted in `MigrateGuestToUserResponse` type.

---

### 🟢 `BulkOperationResponse` → `BulkResponse` reconciled

**Resolved:** 2026-04-26.
**FE side:** Old `{ succeeded: string[], failed: BulkOperationFailure[] }`
shape replaced by `{ results: BulkResultItem[], succeeded: number,
failed: number }`. Bulk thunks updated to iterate `results.filter(r => !r.ok)`
for rollback.

---

### 🟢 Header plumbing: `X-Idempotency-Key`, `X-Cloud-Files-Bypass`

**Resolved:** 2026-04-26.
**FE side:** Both headers added to [features/files/api/client.ts](../api/client.ts)
`RequestOptions`. Upload thunks pass `idempotencyKey: requestId` so
the same key is reused across retries. Bypass is opt-in only.

---

### 🟢 `X-Guest-Fingerprint` header on every request

**Resolved:** 2026-04-26.
**FE side:** `client.ts` reads `getCachedFingerprint()` synchronously
and attaches the header on every request when present. Authed users
also send it for backend correlation. Throws `auth_required` only
when both `Authorization` and fingerprint are missing.

---

### 🟢 PATCH metadata default-merge

**Resolved:** 2026-04-26.
**FE side:** Default behavior matches FE expectation; explicit
`patchFileReplaceMetadata` exposed for the rare overwrite-the-blob case.

---

### 🟢 RLS recursion 42P17 fix (Part 1: file-permissions)

**Resolved:** 2026-04-26 (Python applied migration).

---

### 🟢 RLS recursion 42P17 fix (Part 2: user-group-members)

**Resolved:** 2026-04-26 (Python applied migration).

---

### 🟢 `cld_get_user_file_tree` returns folder rows with `kind` discriminator

**Resolved:** 2026-04-26.
**FE side:** Discriminated union (`CloudTreeFileRow` / `CloudTreeFolderRow`)
already in place; tree converter handles the discriminator.

---

### 1. 🟡 Virtual Filesystem Adapter — server-side parity

**Priority:** Medium-high. Unblocks shipping a unified `/files` tree on the FE that includes Notes, Agent Apps, Prompt Apps, Tool UIs, and code-files snippets alongside real cloud-files. AND lets AI-agent `fs_*` tools dispatch to the right backing store on the server.

**Context:** The FE shipped `features/files/virtual-sources/` — a `VirtualSourceAdapter` pattern that lifts each Postgres-row "fake file" surface to the same conceptual shape as real cloud-files. Five adapters are live today (Notes, Agent Apps, Prompt Apps, Tool UIs, Code Snippets) and they call Supabase directly via the existing user JWT. Server-side parity is needed so AI tool calls (`fs_read`, `fs_write`, `fs_list`, `fs_rename`, `fs_delete`, `fs_move`, `fs_create`) hit the right adapter on the backend and so the FE's edit flows can call backend endpoints directly when an adapter needs server-side enforcement.

**Shared contract.** TS contract: [features/files/virtual-sources/types.ts](../virtual-sources/types.ts). Pydantic mirror should live at `backend/app/files/virtual/contract.py`. Field names match, snake_case at the wire boundary: `id`, `kind`, `name`, `parent_id`, `badge`, `updated_at`, `extension`, `language`, `mime_type`, `size`, `has_content`, `fields`, `metadata`. Adapter capabilities: `list`, `read`, `write`, `rename`, `delete`, `move`, `folders`, `binary`, `versions`, `multi_field`.

**New endpoints (mounted at `/virtual`, sibling of `/files`):**

```
GET    /virtual                                       → { adapters: [{ id, label, capabilities, dnd }] }
GET    /virtual/{adapter_id}/list?parent={vid}&limit=&offset=&include_deleted=
GET    /virtual/{adapter_id}/{vid}/content?field_id=
POST   /virtual/{adapter_id}/{vid}/save               body { content, field_id?, expected_updated_at? }
POST   /virtual/{adapter_id}/{vid}/rename             body { new_name, expected_updated_at? }
POST   /virtual/{adapter_id}/{vid}/move               body { new_parent_id, expected_updated_at? }
DELETE /virtual/{adapter_id}/{vid}?hard=
POST   /virtual/{adapter_id}/create                   body { parent_id, kind, name, content? }
GET    /virtual/{adapter_id}/{vid}/versions
POST   /virtual/{adapter_id}/{vid}/versions/{ver}/restore
POST   /virtual/resolve                               body { path } → { adapter_id, virtual_id, field_id? }
```

Auth: same as `/files/*` — Supabase JWT in `Authorization`, `X-Request-Id` on every mutation. Optimistic concurrency on writes/renames/moves via `expected_updated_at` (returns 409 `conflict` on mismatch).

**Built-in adapter set (one Python module per source).** Each Python adapter targets the same Postgres table as the corresponding TS adapter — single source of truth is the row.

1. `notes_adapter.py` — `notes` + `note_folders`, scoped to `user_id`, share-aware via `note_shares`. Versions via `note_versions`. capabilities = full. Mirrors [features/files/virtual-sources/adapters/notes.ts](../virtual-sources/adapters/notes.ts).
2. `aga_apps_adapter.py` — `aga_apps`, single `component_code` field. Scoped to `user_id`. capabilities = list/read/write/rename/delete/create. No folders/move/multi-field. Mirrors [aga-apps.ts](../virtual-sources/adapters/aga-apps.ts).
3. `prompt_apps_adapter.py` — same shape as `aga_apps_adapter`, table `prompt_apps`. Mirrors [prompt-apps.ts](../virtual-sources/adapters/prompt-apps.ts).
4. `tool_ui_components_adapter.py` — `tool_ui_components`, multi-field (5 columns: `inline_code` / `overlay_code` / `header_extras_code` / `header_subtitle_code` / `utility_code`). capabilities = list/read/write. No rename/delete (admin asset). `multi_field = true`. Mirrors [tool-ui-components.ts](../virtual-sources/adapters/tool-ui-components.ts).
5. `code_files_adapter.py` — `code_files` + `code_file_folders`, scoped to `user_id`. capabilities = full. Single field. **Snippets stay as Postgres rows** — they are NOT being migrated to S3-backed cloud-files. Mirrors [code-files.ts](../virtual-sources/adapters/code-files.ts).
6. `cloud_files_adapter.py` — wraps the existing `cld_files` + S3 logic, registered as `sourceId = "my_files"`. With this adapter the contract is uniform: `fs_read("/My Files/foo.txt")` flows through the SAME path as `fs_read("/Notes/foo.md")` or `fs_read("/Code Snippets/util.ts")`.

**ACL expectation.** Every adapter receives the JWT-resolved `user_id` and applies its own row-level security inside the adapter, NOT in the dispatcher. Document the expected query predicate per adapter in `contract.py` so audits are localized. Cloud-files adapter reuses `cld_file_permissions` + `cld_share_links` exactly as today.

**Path resolution.** `POST /virtual/resolve` is the canonical path → ids resolver. Both the FE (occasionally, for deep links) and the AI tool surface (every call) use it. It MUST NOT cache stale data; rename ops invalidate any per-process caches.

**AI-agent tool integration.** Expose seven tools in `backend/app/ai/tools/fs.py`:
- `fs_read(path) → content`
- `fs_write(path, content) → { updated_at }`
- `fs_list(path) → [VirtualNode]` (`path = "/"` returns adapter roots)
- `fs_rename(path, new_name) → { updated_at }`
- `fs_delete(path, hard=false) → null`
- `fs_move(src, dst_parent) → { updated_at }` — initially same-source only; cross-source returns `ToolError`
- `fs_create(parent, kind, name, content?) → VirtualNode`

These tools MUST hit the adapter dispatcher on the SERVER. Do not ship a client-side variant — agent tool calls happen during run loops, which are server-only.

**Existing `/files/*` routes stay focused on real cloud-files.** Do not branch them on `source.kind`; the FE picks the right URL based on the record's source. The two namespaces (`/files` and `/virtual`) are siblings.

**Phased delivery (suggest order, not a hard requirement):**
1. **W1** — Contract module + dispatcher + `POST /virtual/resolve` + `GET /virtual` (lists adapter capabilities).
2. **W1–2** — `cloud_files_adapter.py` wrapping existing logic. Verifiable: `fs_read("/My Files/foo.txt")` returns the same bytes as `GET /files/{id}/content`.
3. **W2** — `aga_apps_adapter.py`, `prompt_apps_adapter.py`, `tool_ui_components_adapter.py`, `code_files_adapter.py` (any order; they're independent).
4. **W3** — `notes_adapter.py` end-to-end.
5. **W4** — `fs_*` AI tool surface wired into the agent toolbelt; E2E test where an agent writes to one of the adapters and verifies the row.

**Verification posture.** For each adapter: a fixture-driven test that exercises list → read → write → rename → delete in a transaction, plus an ACL test proving user A cannot see user B's rows. Cross-source isolation: `fs_read("/Notes/<user-B-id>")` from user A's JWT must 403, not 404, and never leak the row's existence.

**Open question for you to confirm.** Can we standardize on `expected_updated_at` (TIMESTAMPTZ) across every adapter for optimistic concurrency, or do some tables use a `version: int` we should mirror instead? Notes has `version`; we'd prefer to standardize the wire on `updated_at` and have the adapter translate internally.

**Blocker?** No. The FE adapters all run client-side via Supabase today. This work is the "phase 4" parity step that lets us cut the AI tool surface over to the server and (eventually) move write-path enforcement to the backend.

**Current FE workaround:** Adapters call Supabase directly with the user's JWT. RLS enforces ACL at the DB level. Works for browser flows; doesn't work for agent run loops.

---

### 🟢 Per-endpoint quotas and rate limits

**Resolved:** 2026-04-26.
**FE side:** Tier-based defaults from the `cld_account_tiers` table.
FE error codes `storage_quota_exceeded`, `daily_uploads_exceeded`,
`rate_limited`, etc. added to `CloudFilesErrorCode`. UI tier badge +
storage indicator wiring is the next FE chunk (not blocking — refresh
shows up-to-date numbers via `GET /files/usage`).

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
