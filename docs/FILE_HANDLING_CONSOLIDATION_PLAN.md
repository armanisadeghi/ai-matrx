# File Handling Consolidation Plan — v2 (integrated)

**Status:** proposed — integrated with backend team's `prancy-meandering-canyon` plan
**Date:** 2026-05-13
**Branch:** `docs/file-handling-consolidation-plan`
**Owner:** files / file-handler rebuild
**Posture:** rip-and-replace, no shims, no aliases, no deprecations. One system everywhere.

---

## What changed in v2

The backend team produced a comprehensive one-pass rebuild plan (`prancy-meandering-canyon.md`). It overlaps heavily with v1 of this doc and in several places **is stronger** than v1. v2:

1. **Adopts the backend plan's FE architecture wholesale** where it matches or exceeds v1: `MediaRef` as the universal reference, `Asset` envelope as both wire format AND Redux state model (`assetsByMasterId`), `<InlineMediaRef>` as the cross-cutting render component, single `<CloudFilesRealtimeProvider>` mount, OpenAPI type-gen CI gate, single `upload()` primitive with automatic transport selection (buffered / presigned / TUS), unified `VariantsService` covering image presets + vision encoders, ESLint ban on raw MediaRef literals.
2. **Adds the universal Service Worker + IndexedDB streaming cache** from `universal-file-streaming-cache_bffef1ed.plan.md` — the single biggest thing the backend plan is missing. Transparent 3-tier byte cache (memory LRU → IndexedDB → network), PDF.js Range progressive rendering, cross-tab coordination, identity-scoped, feature-flagged. Even L0 `<img src>` and `<video src>` legacy callers get caching for free.
3. **Holds the line on combined-operations API** — v1's call to bundle `upload + share + permissions + variants` in one POST, and `rename + move + visibility + metadata + share + perms` in one PATCH, is **not** in the backend plan and needs to be pushed back. Flagged in §5.
4. **Bakes in the mandatory social baseline** from `IMAGE_UPLOAD_INVESTIGATION.md` and the standard preset dimensions from `online-content-asset-checklist.md`.
5. **Holds every "RIP IT OUT" decision.** No back-compat shims. No 308s. No alias hooks. No "deprecated for one release." 285+ callsites migrate explicitly. Sharp leaves the repo. Two Next.js routes (`pdf/compress`, `images/studio/process`) get rewritten as Python endpoints (`POST /assets/preview`, `POST /assets/pdf-compress`) and the Next routes deleted — Image Studio doesn't get an exemption.

---

## Part 0 — TL;DR

- **One directory.** `features/file-handler/` folds into `features/files/`. `features/file-handler/` ceases to exist.
- **One reference type.** `MediaRef = { file_id?, url?, file_uri? }` everywhere. Manual literals are ESLint-banned outside `converters.ts`.
- **One state model.** Redux `cloudFiles.assetsByMasterId: Record<string, Asset>`. Realtime middleware updates parent on variant row updates.
- **One Python facade.** `FileService.from_env()` in `matrx-utils`. aidream becomes a thin injection layer (auth + tier + Cloudflare purge + Sentry).
- **One upload primitive.** `upload(source, target, options)` — auto-selects buffered (<5 MB), presigned (5–100 MB), or TUS (≥100 MB). Existing 5 paths (`cloudUpload`, `uploadAsset`, `useFileUpload`, `useGuardedFileUpload`, `useFileUploadWithStorage`) all collapse.
- **One read hook.** `useFile(ref, opts)` returns `{ asset, url, isLoading, error, refresh }`. Reads `assetsByMasterId` first. Auto-refreshes via the global expiry-wheel.
- **One inline render component.** `<InlineMediaRef ref={mediaRef} size="..."/>` everywhere `<img src={...}>` used to live.
- **One byte cache.** Service Worker + IndexedDB (2 GB cap) + in-memory LRU (250 MB). Transparent across `<img>`, `<video>`, `<audio>`, downloads, hooks. PDF.js renders page 1 of an 80 MB PDF in <1 s.
- **One realtime mount.** `<CloudFilesRealtimeProvider>` once in `app/Providers.tsx`. Four current mounts deleted.
- **One type-gen pipeline.** Asset / MediaRef / every request+response type regenerated from BE OpenAPI via `openapi-typescript`. `pnpm gen:types && git diff --exit-code` CI gate. Hand-authored Asset types deleted.
- **No Next.js routes for files.** Browser ↔ Python ↔ S3 only. `app/api/images/upload`, `app/api/images/studio/process`, `app/api/pdf/compress`, `app/api/images/proxy` all deleted. `sharp` removed from `package.json`.

**File-count target:** combined 203 (file-handler 22 + files 181) + scattered FE call sites → **one directory, ~80 files, 285+ migrations**.

---

## Part 1 — What the backend team's plan gives us (accept as-is)

The backend plan covers and in several places exceeds the v1 of this doc. We adopt:

| # | Backend item | Why it's right (or better than v1) |
|---|---|---|
| 1 | **`matrx-utils` owns 100% of file-handling logic; aidream is the integration layer.** Standalone-project litmus test: one-line bootstrap installs a complete file system. | Bigger than the v1 ask. Makes the system portable. We benefit because aidream's specifics (Cloudflare purge, quota tiers, fingerprint guests) become injected callbacks, not core code. |
| 2 | **`FileService` Python facade** with namespaced sub-APIs (`.versions`, `.permissions`, `.share_link`, `.groups`, `.folders`, `.presigned`, `.tus`). | Single chokepoint we asked for. Matches v1's intent and goes further by organising auxiliary domains under it. |
| 3 | **`UploadPipeline` primitive** — size → quota → sniff → write → fanout, with `FanoutConfig` override per call. | Replaces all five upload paths. Sharper than v1's "POST /v2/files takes options blob." |
| 4 | **`MediaRef` as universal reference, server-side too.** When source is a MediaRef with a `file_id`, server reads bytes itself — FE never re-uploads. Enables `POST /assets/from-reference`. | New idea, big win. v1 didn't have this. Means attaching an existing file to a new conversation/agent input is a *reference*, not a re-upload. |
| 5 | **`Asset` envelope as wire format AND FE state model.** Redux `assetsByMasterId`. Realtime updates parent on variant row insert/update. | This was implicit in v1; backend made it explicit and named the cache. Adopt. |
| 6 | **Unified `VariantsService`** — image presets (`podcast`/`social`/`web`/`email`/`logo`/`avatar`/`favicon`) AND vision encoders (`anthropic_opus_hires`, `gemini3_high`, …) registered as families through one API. `media.py` deleted. | v1 didn't address vision. Adopt — it kills another forked image pipeline. |
| 7 | **TUS as a service** in matrx-utils. FastAPI router factory + 120-line aidream wrapper. | Cleaner than v1's "promote TUS to v2". Adopt. |
| 8 | **Packaged SQL migrations** (`004_lineage_thumbnail_webhooks.sql`, `005_tus_analysis_redaction_realtime.sql`, `006_canonical_storage_uri.sql`, `007_drop_legacy_storage_uri.sql`). | Standalone-deployable. v1 didn't address. Adopt. |
| 9 | **`canonical_storage_uri` rekey landed in one PR** — backfill runs between `006` and `007` in the same release. | Half-finished rekey gets finished. v1 didn't address. Adopt. |
| 10 | **No back-compat, no 308 redirects.** Old `/media/*` 404s. FE+BE land together. | Matches v1. Confirm. |
| 11 | **Sharp deleted entirely.** `POST /assets/preview` returns base64 or ephemeral signed URLs. `sharp` removed from `package.json`. `app/api/images/studio/process/route.ts` deleted. | v1 left Image Studio out. Backend plan is stronger. **Adopt and extend**: also delete `app/api/pdf/compress` once Python exposes equivalent. |
| 12 | **`features/file-handler/` merges INTO `features/files/`.** `fileHandler.use(...).as(...)` builder deleted; direct hook + component imports replace it. | Matches v1. |
| 13 | **Single `useFile(ref, opts)` hook.** Replaces `useSignedUrl`, `useFileAsset`, `useAiImageUrl`, `useFileSrc`. Reads `assetsByMasterId` first; falls back to fetch. Uses global expiry-wheel for auto-refresh. | Matches v1 and is more concrete. |
| 14 | **Single `upload(source, target, options)` primitive** with automatic transport selection. `cloudUpload`, `uploadAsset`, `useFileUpload`, `useGuardedFileUpload`, `useFileUploadWithStorage` all collapse. | More concrete than v1 — handles the size→transport decision internally. |
| 15 | **`<InlineMediaRef ref size fit fallback onClick onDownload/>`** component. Replaces every ad-hoc `<img src={file.publicUrl ?? ...}>`. | New idea. Bigger leverage than `<FilePreview>` alone. v1 missed this. Adopt and treat as one of the THREE canonical components alongside `<FilePreview>` and `<FileUploadDropzone>`. |
| 16 | **OpenAPI type generation pipeline.** `Asset`, `AssetVariant`, `AssetPreset`, `MediaRef`, every request/response regenerated. `pnpm gen:types && git diff --exit-code` CI gate. Hand-authored Asset types deleted. | New idea, eliminates drift. Adopt. |
| 17 | **Single `<CloudFilesRealtimeProvider>` mount in `app/Providers.tsx`.** Four per-route mounts deleted. | New. v1 didn't catch this. Adopt. |
| 18 | **ESLint ban on manual MediaRef literals** outside `features/files/redux/converters.ts`. The four builders (`cloudFileToMediaRef`, `fileIdToMediaRef`, `urlToMediaRef`, `fileUriToMediaRef`) become the only sanctioned construction path. | Adopt — same posture as `supabase.storage` ban. |
| 19 | **Internal FE splits bundled in the same PR.** `FilePreview.tsx` 404-line switch → registry pattern. `FileTable.tsx` 851 lines → TanStack Table. `PageShell.tsx` 920 lines → per-section components. `thunks.ts` 1790 lines → split by domain. `types.ts` 1300 lines → `domain.ts/api.ts/ui.ts`. | New. v1 didn't address. Adopt — same PR. |
| 20 | **285+ explicit `useFileSrc` callsite migrations to `useFile(ref, { target: "render" }).url`.** No alias. | Adopt. |
| 21 | **Critical bug fixed: non-atomic `increment_share_link_use` → `cld_consume_share_link(TEXT)` RPC** ([db.py:568](packages/matrx-utils/matrx_utils/file_handling/cloud_sync/db.py#L568)). | Bundled. Adopt. |
| 22 | **Out of scope (defer):** antivirus, GDPR cascade delete, audit downloads, S3 lifecycle, trash auto-purge, FE Sentry, cross-repo correlation IDs, `cld_user_groups` audit, per-org tenancy. | Same out-of-scope as v1. Confirm. |

We accept all 22 items above and integrate them into the final plan in Part 6.

---

## Part 2 — Where the backend plan goes BEYOND what we asked

Things in `prancy-meandering-canyon` that strengthen the result above what v1 had:

1. **Standalone-project litmus test** — a fresh Python project should boot with `FileService.from_env()` + four router factories and have full functionality. This is the cleanest possible test of "matrx-utils owns the logic." Massive win for portability.
2. **`POST /assets/from-reference`** — agent attaches an existing file to a new conversation by sending only `MediaRef { file_id }`. Server reads bytes itself. Cuts re-upload bandwidth + latency to zero.
3. **`VariantsService` family registration** — image vs vision encoders unified, plugin-style. Lets us add new encoder families (e.g., a "tts-prompt-art" family) without touching the upload pipeline.
4. **TUS state machine extracted as a reusable service** — the 1067-line `aidream/api/routers/files_tus.py` splits 3 ways. The matrx-utils piece becomes reusable by any host.
5. **Packaged SQL is the only schema source** — no more matrx-utils-divergence-from-aidream-applied. The standalone-deployable test enforces this.
6. **`canonical_storage_uri` rekey landed in one PR with `006` write + backfill + `007` drop** — eliminates the months-long half-finished rekey state. Every read stops paying the fallback cost.
7. **Internal FE splits bundled** (FilePreview registry, TanStack FileTable, PageShell per-section, thunks/types split) — turn one rebuild into a clean codebase, not a rebuild on top of legacy structure.
8. **`Asset` envelope is the FE state model** — `useFile(ref)` reads Redux cache first, so subsequent renders are zero-network. Implicit in v1, named and wired here.
9. **`<InlineMediaRef>` as the universal inline render component** — eliminates every ad-hoc `<img src>` pattern. Bigger lever than `<FilePreview>` alone.
10. **Audit-bridge injection** — `configure_audit_logger` lets a host plug in Sentry breadcrumbs + `cld_events` outbox without matrx-utils knowing about Sentry. Clean abstraction.

We adopt all of these.

---

## Part 3 — Where the backend plan FALLS SHORT (gaps for the backend team)

These are items in v1 (this doc) or in the auxiliary drafts (`IMAGE_UPLOAD_INVESTIGATION.md`, `online-content-asset-checklist.md`, `universal-file-streaming-cache_bffef1ed.plan.md`) that are not in the backend plan and would weaken the system if left out.

**Send this list to the backend team. Each one needs an answer before the integrated plan freezes.**

### Gap 1 — Combined-operation endpoints (call-graph reduction)

The backend plan keeps every operation as its own endpoint. We asked for endpoints that bundle operations called together. Concretely, we want:

- **`POST /assets` (or `/files`) accepts an `options` body that bundles:**
  - `share: { permission_level, expires_at?, max_uses? }` → server creates the share link and returns it in the same response.
  - `permissions: [{ grantee_id, grantee_type, permission_level, expires_at? }]` → server grants them.
  - `variants: ["thumbnail_256", "social_card", ...]` → server renders variants.
  - All combined into one transaction. Failure of any sub-op rolls back the whole call.

- **`PATCH /files/{id}` accepts the union:**
  - `{ name?, folder?, visibility?, metadata?, share?, share_revoke?, permissions?, permissions_revoke?, variants?, restore_version?, restore_from_trash?, copy_to? }`
  - Atomic. Returns new envelope.

- **`POST /files/bulk` with a discriminator:**
  - `{ ids[], op: "move" | "delete" | "restore" | "visibility" | "share", ...args }`. Returns per-item status envelope.

**Why this matters:** today the FE makes 2 calls for upload+share, 4 for upload+share+2-grants, 2 for rename+move, 3 for get-metadata+get-signed-URL+get-thumbnail. Bundling them moves the round-trip cost to zero for the user-perceived case.

### Gap 2 — Mandatory social baseline on every public-asset preset

From `IMAGE_UPLOAD_INVESTIGATION.md` (resolved 2026-05-12, but the principle needs to carry forward):

Every public-asset upload (`visibility="public"`, image MIME) must always include the **social baseline** variants on top of whatever the preset defines:

- `og_image_url` — 1200×630 (1.91:1), JPEG, ≤500 KB — for Facebook/LinkedIn/Slack/iMessage previews
- `thumbnail_url` — 400×400, square, JPEG/WebP — for UI cards
- `tiny_url` — 128×128, JPEG — for compact lists and email headers

Confirm `VariantsService` merges `SOCIAL_BASELINE` into every preset render unconditionally for `visibility=public`. There is no opt-out. The baseline overhead is <50 KB per upload and the resulting "OG image is always present" invariant kills a whole bug class.

### Gap 3 — Preset dimension confirmation against the content checklist

`online-content-asset-checklist.md` enumerates the dimensions/formats we publish against. Confirm the matrx-utils `VariantsService` family `image` covers all of these (one per asset purpose):

| Purpose | Variant key | Dimensions | Format |
|---|---|---|---|
| Source master | `master` | original | original |
| Hero / featured | `hero` | 1920×1080 (16:9) | WebP + JPEG fallback |
| OG card | `og_image_url` | 1200×630 | JPEG |
| Twitter card | `twitter_card` | 1200×675 (16:9) | JPEG |
| Podcast artwork — Apple hi-res | `cover_url` | 3000×3000 | JPEG |
| Podcast artwork — legacy SD | `cover_sd_url` | 1400×1400 | JPEG |
| Video thumb | `video_thumb` | 1280×720 (16:9) | JPEG |
| In-content / inline | `inline` | ≤1200 wide | WebP + JPEG fallback |
| Mobile responsive | `mobile` | 800×450 | WebP |
| Square thumbnail | `thumbnail_url` | 400×400 | JPEG/WebP |
| Tiny icon | `tiny_url` | 128×128 | JPEG |
| Logo — large | `logo_lg` | 512×512 | PNG transparent |
| Logo — medium | `logo_md` | 200×200 | PNG transparent |
| Logo — small | `logo_sm` | 64×64 | PNG transparent |
| Avatar | `avatar_xl/lg/md/sm/xs` | 400/256/128/64/32 square | JPEG/WebP |
| Favicon | `favicon_512/192/180_apple/32/16` | per ICO+PNG set | PNG |
| Logo vector | `logo_svg` | original | SVG passthrough |
| Email header | `email_header` | 600×200 | JPEG |
| Email square | `email_square` | 200×200 | JPEG |

Confirm presets `podcast` / `social` / `web` / `email` / `logo` / `avatar` / `favicon` map onto these variant keys. If any are missing, add them.

### Gap 4 — Public-CDN-URL guarantee for `visibility="public"`

`IMAGE_UPLOAD_INVESTIGATION.md` bug 2: `_store_image_variants` in `podcast_media.py` re-signed public uploads with `get_url_async(expires_in=7d)`, producing 1-week S3 signed URLs that died in 7 days *despite* `visibility="public"`. The FE persisted them into `podcasts.image_url`.

**Required of `UrlMinter.build_urls()`:**

- For `visibility="public"`, **always** return the permanent Cloudflare CDN URL (`https://cdn.matrxserver.com/...?v=<checksum[:8]>`). Never re-sign. Never return an S3 signed URL for a public file.
- The returned envelope's `urls.src` must be the CDN URL (with cache-buster) for public, the signed S3 URL for private/shared.
- `urls.download` always points at the Python `/files/{id}/download` endpoint (sets `Content-Disposition: attachment`).

Confirm UrlMinter enforces this invariant.

### Gap 5 — `ETag` + `Content-Range` + 206 on `/files/{id}/download`

For the Service Worker streaming cache (Part 4 below) and PDF.js Range progressive rendering to work, the download endpoint must:

- Set `ETag: "<checksum>"` on every response. (Already shipped per [streaming plan §existing-pieces](universal-file-streaming-cache_bffef1ed.plan.md), confirm it's preserved through the rebuild.)
- Honor `Range:` request headers and respond `206 Partial Content` with `Content-Range: bytes ${start}-${end}/${total}` and `Accept-Ranges: bytes`.
- 256 KiB chunk size or smaller for Range responses.
- For `visibility="public"` files, the endpoint may redirect (`302`) to the CDN URL — Range is preserved by Cloudflare.

Confirm.

### Gap 6 — `X-Request-Id` echoed in realtime payloads

The realtime dedup ledger relies on receiving `request_id` back in the realtime UPDATE payload metadata. Without it, the FE falls back to a 2-second timestamp-fuzzy match. Confirm `X-Request-Id` from the HTTP write is propagated through to the realtime row's `metadata.request_id`.

(This is in the backend plan §2.3 — "request_id realtime dedup" — but only as a passing mention. Confirm it survives the rebuild.)

### Gap 7 — Idempotency for combined operations

`POST /assets` (with `options.share / permissions / variants`) must be idempotent on `X-Idempotency-Key`. A retry with the same key returns the same envelope (same `file_id`, same share `token`, same permissions, same variants). No duplicates.

Confirm `UploadPipeline` step 4 ("Idempotency check") covers the whole combined operation, not just the bytes write.

### Gap 8 — SVG as a first-class asset type

For logo uploads, the checklist says "SVG primary, PNG fallback at ≥500 px." We need:

- `POST /assets` with `preset="logo"` and an SVG file uploaded → master persists as SVG, `variants_service` renders the raster fallback set (`logo_lg/md/sm`, `favicon_*`) by rasterizing the SVG.
- `GET /assets/{id}` returns both the SVG URL (`urls.svg`) and the raster variants.

Confirm SVG handling in the image family or add it.

### Gap 9 — `POST /assets/preview` for Sharp deletion

The backend plan mentions this but doesn't spec the contract. Required:

- `POST /assets/preview` accepts a master (upload OR `MediaRef`) + `variants: [{ width, height, format, quality, fit }]` and returns ephemeral results without persisting.
- Returns one of: base64 data URLs (default, for small previews) or ephemeral signed URLs (when bytes > 256 KB).
- 5-minute TTL on ephemeral URLs.
- This unblocks deleting `app/api/images/studio/process/route.ts` and removing `sharp` from `package.json`.

### Gap 10 — Server-side PDF compress (deletes `app/api/pdf/compress`)

Equivalent ask for PDF: `POST /assets/pdf-compress` taking a PDF master + compression options, returning either bytes (small) or an ephemeral signed URL. Lets us delete the last Node-side PDF route. (Backend plan doesn't address.)

### Gap 11 — Mid-stream MediaRef events

The handler doc lists "mid-stream agent file references" as a flow. Confirm the stream-event normalization path (today in `features/file-handler/handler.ts`'s `toMediaBlock`/`toContentPart`) survives the rebuild — i.e. when the agent runtime emits a `MediaRef` mid-stream, the FE resolver hydrates it through the same `useFile` path. No new code path.

### Gap 12 — Webhooks / SSE for storage events beyond Supabase Realtime

`features/files/for_python/REQUESTS.md` item 10. The backend plan has `webhook_dispatcher` in matrx-utils but doesn't expose it to host applications as a subscription surface. For the Service Worker cache invalidation to be authoritative on cross-device changes, we need an event channel beyond Supabase Realtime (which only reliably fires for tables we subscribe to).

Required: a `cld_events` outbox + dispatcher that fires HTTP webhooks (or sends to a queue) on every meaningful state change (`file.uploaded`, `file.deleted`, `file.version_bumped`, `file.visibility_changed`, `share_link.created`, `share_link.revoked`). FE can subscribe via the existing Supabase Realtime layer.

### Gap 13 — `cld_files.checksum` on every row, always populated

Service Worker cache keys include `checksum`. Confirm the upload pipeline always computes + persists `checksum` (SHA-256) at write time and that it surfaces in the Asset envelope.

### Gap 14 — `Content-Length` on every byte response

Per-MIME size policies in the SW depend on `Content-Length`. Confirm Python sets it on every full and 206 partial response.

### Gap 15 — Realtime publication on `processed_documents` + `cld_share_links` + `cld_file_permissions`

For the FE to drop signed URLs immediately on visibility change, share revoke, or permission revoke without polling, every relevant table needs realtime publication. Already shipped per Bundle B but worth confirming through the rebuild.

---

## Part 4 — FE-only additions from auxiliary drafts (not in backend plan)

These are FE engineering items the backend plan can't address. They are part of the integrated plan in Part 6.

### 4A — Universal Service Worker + IndexedDB streaming cache

The single biggest thing missing from the backend plan. Sourced from [universal-file-streaming-cache_bffef1ed.plan.md](file:///Users/armanisadeghi/.cursor/plans/universal-file-streaming-cache_bffef1ed.plan.md).

**Architecture:**

```
Consumer (img / video / audio / react-pdf / useFileBlob / Save-As / RAG ingest)
    ↓
Hook layer (useFileBlob / useFile)
    ↓
L1: in-memory LRU (250 MB, session-scoped) ─── [existing, refactored]
    ↓ miss
Service Worker fetch handler (intercepts ALL file URL patterns)
    ↓
L2: IndexedDB (Dexie matrx-blob-cache, 2 GB cap, identity-scoped) ─── [NEW]
    ↓ miss
Network: Python /files/{id}/download (Range-supported, 206 chunks) | CDN | share-link
    ↓
populate L2 → warm L1 → broadcast invalidation via BroadcastChannel matrx-sync
```

**Why a Service Worker:** transparently intercepts every `<img src>`, `<video src>`, `<audio src>`, `fetch()`, and `<a download>` request without consumers needing to call a hook. Means legacy callers benefit immediately; gradual migration to typed hooks happens in parallel.

**Cache keys:**

| URL pattern | Key |
|---|---|
| `${BACKEND}/files/{id}/download` (no `?version=`) | `${userId}:${fileId}:current:${checksum}` |
| `${BACKEND}/files/{id}/download?version=N` | `${userId}:${fileId}:${N}:${checksum}` |
| `${BACKEND}/share/{token}/download` | `${userId}:url:${sha256(url)}` |
| CDN URL ending in `?v=<checksum>` | `${userId}:${fileId}:current:${checksum}` (checksum extracted from query) |
| Signed S3 URL with `X-Amz-Signature` | **bypass** (would create stale-URL bugs) |

**IndexedDB schema** (`features/files/cache/idb-store.ts`, Dexie):

```ts
{ key, userId, fileId, version, checksum, mimeType, bytes, blob, etag, fetchedAt, lastAccessedAt, source }
```

Stamped with `userId`. Cleared on sign-out via `clearForUser(userId)`. Budget 2 GB, LRU eviction with size-aware preference (oldest entries >2 MB go first). `QuotaExceededError` → evict to 70% of budget, retry once, fall back to network if still failing. localStorage fallback when IDB is unavailable (private browsing / iOS Safari) — cache no-ops, app uses network.

**Per-MIME size policy** (configurable in admin settings):

| MIME prefix | Cache | Max per entry |
|---|---|---|
| `image/*` | yes | 50 MB |
| `audio/*` | yes | 100 MB |
| `video/*` | yes (if ≤50 MB) | 50 MB |
| `application/pdf` | yes | 250 MB |
| `application/zip` / `tar` / `gzip` | yes | 500 MB |
| `text/*`, `application/json/xml` | yes | 10 MB |
| anything else with `Content-Length ≤ 25 MB` | yes | 25 MB |
| else | no | — |

**PDF.js progressive Range rendering:**

`features/files/components/core/FilePreview/previewers/PdfDocumentRenderer.tsx` accepts `source: { kind: 'remote', url, httpHeaders }` and passes it directly to `<Document file={{ url, httpHeaders, withCredentials: false, rangeChunkSize: 65536 }} />`. PDF.js auto-uses Range requests when the server advertises `Accept-Ranges: bytes`. First page of an 80 MB PDF renders in 300–800 ms; the SW stitches the full document into IDB via a deduplicated background fetch so the second visit is instant.

Move worker source to local `/public/pdfjs-worker.min.mjs` (pinned at build time, post-install copy from `node_modules/pdfjs-dist/build/`). Eliminates third-party runtime dependency and SW-vs-cross-origin-worker edge cases.

**Cross-tab coordination:** cache mutations broadcast `{ kind: 'blob-cache:invalidate', key }` over the existing `matrx-sync` BroadcastChannel ([lib/sync/channel.ts](../lib/sync/channel.ts)). Each tab's L1 drops the entry. SW is one-per-origin so the SW cache is naturally shared.

**Postmessage protocol** (page ↔ SW):

- Page → SW: `register-url-mapping`, `invalidate`, `clear-user`, `set-budget`
- SW → page: `cache-stat-update`, `request-auth-header` (for background full-document stitch)

**Auth header handling:** SW does NOT store or fabricate `Authorization`. The page's `fetch()` sets it; the SW preserves it on revalidation by reading `event.request.headers`. For background stitch fetches initiated by the SW itself, the SW asks active clients via `postMessage({ kind: 'request-auth-header' })` to forward a fresh header. 2-second timeout → skip background fetch (user-facing request already completed; cache stays cold).

**Identity scoping + sign-out:** every entry stamped with `userId`. Sign-out triggers `clearForUser(userId)`. Cross-user contamination is structurally impossible.

**Dev-mode guards:** SW registration disabled in dev by default (`NODE_ENV !== 'production'`) to avoid HMR interference. Opt-in via `localStorage.matrx_dev_sw=1`. Always excludes `/_next/`, `/__webpack_hmr`, `/api/`, `/api/auth/*`.

**Admin observability:** new route `app/(authenticated)/(admin-auth)/administration/blob-cache/page.tsx` gated by `selectIsSuperAdmin`:

- L1 memory: entry count, total bytes, top 20 by size, hit/miss counters
- L2 IDB: same + persisted across reloads, "evict now" + "clear all" buttons
- SW status: registered version, last activated, intercept counters per URL family
- Live BroadcastChannel inspector
- "Disable SW for this session" toggle
- Per-MIME byte budget + video threshold settings

SW adds `X-Matrx-Cache: hit|miss` response header (dev-only) so the Network panel shows which fetches were cached.

**Feature flag + rollout:** `state.preferences.blobCache.enabled` (default `true` after rollout). Phases lift step-wise from foundation → IDB-only → SW-for-downloads-only → PDF.js Range → image/video/audio → cross-tab hardening → RAG/downloads → observability → default-on. Each phase independently revertible.

### 4B — Hook-layer integration

`features/files/hooks/blob-cache.ts` — `getCached(fileId)` consults memory first, then IDB. `setCached(fileId, blob, url)` writes both tiers. `invalidate(fileId)` clears both + broadcasts.

`features/files/hooks/useFileBlob.ts` — signature unchanged. Internally: IDB read precedes network fetch when no memory hit. SSR-safe (no IDB access during hydration).

`features/file-handler/hooks/useFileBlob.ts` — close the gap: delegate to `features/files/hooks/useFileBlob.ts` whenever `normalized.fileId` is set. After the directory merge, only one `useFileBlob` exists.

### 4C — Existing primitives that survive the rebuild

Do NOT rebuild these — they already work. They migrate into the new directory structure:

- `expiry-wheel` ([features/file-handler/intelligence/expiry-wheel.ts](features/file-handler/intelligence/expiry-wheel.ts)) → `features/files/cache/expiry-wheel.ts`
- `magic-bytes` sniffing → `features/files/utils/magic-bytes.ts`
- `MediaRef` builders in `features/files/redux/converters.ts` (4 functions: `cloudFileToMediaRef`, `fileIdToMediaRef`, `urlToMediaRef`, `fileUriToMediaRef`) — kept; become the only sanctioned MediaRef construction path (ESLint enforced).
- Folder conventions in `features/files/utils/folder-conventions.ts` — kept.
- Redux slice optimistic-update + dirty-tracking + request-ledger dedup — kept; `assetsByMasterId` is an additive change.

---

## Part 5 — Gap list to send to the backend team

Single email-ready list. Each item is a yes/no/spec-it answer needed before the integrated plan freezes.

1. **Combined-operation endpoints.** Can `POST /assets` accept `{ share, permissions, variants }` and `PATCH /files/{id}` accept the full mutation union? Bundled atomic transactions, idempotent on `X-Idempotency-Key`. → **§3 Gap 1**
2. **Mandatory social baseline.** Confirm `VariantsService` always merges `og_image_url + thumbnail_url + tiny_url` into every public image-asset preset. No opt-out. → **§3 Gap 2**
3. **Preset variant set.** Confirm the variants in the table at **§3 Gap 3** are all present across `podcast/social/web/email/logo/avatar/favicon` presets. Add any missing.
4. **CDN URL guarantee.** `UrlMinter.build_urls()` always returns the permanent Cloudflare CDN URL for `visibility="public"`. Never re-sign. → **§3 Gap 4**
5. **`ETag` + 206 Range on `/files/{id}/download`.** Confirm. Required for Service Worker cache + PDF.js Range rendering. → **§3 Gap 5**
6. **`X-Request-Id` echo in realtime payloads.** Confirm `metadata.request_id` populated. → **§3 Gap 6**
7. **Idempotency covers combined operations.** Retry with same `X-Idempotency-Key` returns identical envelope (same file, same share token, same permissions). → **§3 Gap 7**
8. **SVG first-class.** `preset="logo"` accepts SVG master, renders raster fallbacks. → **§3 Gap 8**
9. **`POST /assets/preview`** spec confirmed (base64 or ephemeral signed URLs, 5-min TTL). Unblocks Sharp deletion. → **§3 Gap 9**
10. **`POST /assets/pdf-compress`** equivalent for PDF compress. Unblocks deleting `app/api/pdf/compress`. → **§3 Gap 10**
11. **Mid-stream MediaRef events** — confirm stream-event resolver path survives. → **§3 Gap 11**
12. **Webhooks/SSE outbox** (`cld_events`) — confirm dispatcher fires events for `file.*`, `share_link.*`, `permission.*`. → **§3 Gap 12**
13. **`cld_files.checksum` always populated** at upload time + exposed in Asset envelope. → **§3 Gap 13**
14. **`Content-Length` on every byte response** (full and 206 partial). → **§3 Gap 14**
15. **Realtime publication** confirmed on `processed_documents`, `cld_share_links`, `cld_file_permissions`. → **§3 Gap 15**

---

## Part 6 — The integrated plan

This is the final architecture. Backend plan (Part 1) + our additions (Part 4) + gap resolutions (Part 3/5) all combined.

### 6.1 Public FE surface — 5 hooks + 1 facade + 3 components

Everything else outside `features/files/` uses only these.

#### Hooks

```ts
// 1. metadata + capabilities + all URLs — reads assetsByMasterId first
const { asset, url, isLoading, error, refresh } = useFile(ref, {
  variantKey?,      // "primary" (default) | "thumbnail_url" | "cover_url" | "og_image_url" | ...
  signedUrlTtl?,
  target?,          // "render" | "download"
  enabled?,
});

// 2. URL string for inline render attrs (thin wrapper over useFile)
const src = useFileSrc(ref, options?);   // returns string | null

// 3. Bytes — with the 3-tier cache (mem LRU → IDB → SW → network)
const { blob, status, progress, error } = useFileBlob(ref);

// 4. Upload — single entry, auto transport selection
const { upload, uploading, progress } = useFileUpload();
await upload(
  source,                               // File | Blob | MediaRef
  {
    kind: "file" | "asset",
    folder: "Reports/Q1",               // path-style; auto-creates parents
    visibility: "public" | "private" | "shared",
    preset?: "podcast"|"social"|"web"|"email"|"logo"|"avatar"|"favicon"|"vision"|"raw",
    shareWith?: ["user1@..."],          // bundled grants
    signedUrlTtl?,
    metadata?,
  },
  { onProgress?, signal?, idempotencyKey?, guard?: true }
);
// Transport selection (internal):
//   < 5 MB     → buffered POST
//   5–100 MB   → presigned PUT
//   ≥ 100 MB   → TUS resumable

// 5. Mutate — rename / move / delete / restore / share / permissions / metadata
const m = useFileMutation(fileId);
await m.patch({ name?, folder?, visibility?, metadata?, share?, permissions?, variants? });
await m.delete({ hard? });
await m.restore();
await m.bulk({ ids, op: "move"|"delete"|"restore"|"visibility"|"share", ...args });
```

#### Facade — for non-React callers (thunks, services, agent prep)

```ts
import { fileHandler } from "@/features/files";

await fileHandler.upload(source, opts);
await fileHandler.mutate(fileId).patch({ ... });
await fileHandler.resolve(ref);                       // raw NormalizedFile
await fileHandler.refresh(file);                      // force signed-URL remint
```

The legacy `fileHandler.use(source).as(target)` builder is **deleted**.

#### Components

```tsx
<InlineMediaRef ref={mediaRef} size="sm|md|lg|{w,h}" fit="cover|contain"
                fallback="icon|skeleton|null" onClick onDownload />
<FilePreview source={ref} />                          // PDF/Image/Audio/Video/Code/Text/Data/SVG/Generic
<FileUploadDropzone onUploaded={...} preset={...} folder={...} />
```

Everything else lives in `features/files/components/` and is internal (ESLint-fenced).

### 6.2 Directory layout after collapse

```
features/files/
├── README.md                    ← merged FEATURE.md + handler FEATURE.md
├── PLAN.md                      ← this doc
├── index.ts                     ← public exports only: 5 hooks, facade, 3 components, types
├── handler.ts                   ← the fileHandler facade
│
├── types/                       ← split from monolithic types.ts
│   ├── domain.ts                ← CloudFile, CloudFolder, Asset, AssetVariant, MediaRef
│   ├── api.ts                   ← regenerated from OpenAPI; CI-gated
│   └── ui.ts                    ← UI state types
├── errors.ts
│
├── client/                      ← HTTP client (was api/*)
│   ├── client.ts                ← auth, request-id, idempotency-key, error mapping
│   ├── requests.ts              ← typed endpoint wrappers (kept 1-for-1 with BE surface)
│   └── tus.ts                   ← TUS client
│
├── state/                       ← Redux (was redux/*)
│   ├── slice.ts                 ← + assetsByMasterId
│   ├── selectors.ts             ← + selectAssetByMasterId, selectVariantUrl
│   ├── thunks/                  ← split by domain
│   │   ├── files.ts
│   │   ├── folders.ts
│   │   ├── permissions.ts
│   │   ├── bulk.ts
│   │   └── upload.ts
│   ├── realtime.ts              ← cross-table updates incl. variant→parent
│   ├── request-ledger.ts
│   └── converters.ts            ← MediaRef builders — ESLint-fenced
│
├── cache/                       ← NEW — 3-tier byte cache
│   ├── blob-lru.ts              ← in-memory LRU (was hooks/blob-cache.ts)
│   ├── idb-store.ts             ← Dexie matrx-blob-cache DB
│   ├── policy.ts                ← per-MIME size policy
│   ├── invalidate.ts            ← cross-tier + cross-tab invalidation
│   ├── expiry-wheel.ts          ← (moved from file-handler/intelligence/)
│   ├── service-worker/          ← SW build pipeline
│   │   ├── src/sw.ts            ← TS source
│   │   └── build-sw.ts          ← compiles to /public/blob-sw.js
│   └── register-service-worker.ts ← registered from app/DeferredSingletons.tsx
│
├── resolver/                    ← was file-handler/{resolver, intelligence, input, output}
│   ├── normalize.ts             ← FileSource | MediaRef → NormalizedFile
│   ├── resolve.ts               ← + hydration, access decision, URL minting
│   ├── access.ts
│   ├── refresh.ts
│   ├── magic-bytes.ts           ← (moved)
│   ├── classify.ts
│   ├── prefer-locator.ts
│   └── target.ts                ← NormalizedFile → render output
│
├── upload/                      ← single upload primitive
│   ├── upload.ts                ← auto transport selection (buffered/presigned/TUS)
│   ├── upload-guard.tsx         ← dedup pre-flight dialog
│   ├── duplicate-detect.ts
│   └── checksum.ts
│
├── hooks/                       ← THE 5
│   ├── useFile.ts
│   ├── useFileSrc.ts
│   ├── useFileBlob.ts
│   ├── useFileUpload.ts
│   └── useFileMutation.ts
│
├── components/                  ← internal to features/files
│   ├── core/                    ← FilePreview (registry), FileTree, FileList (TanStack),
│   │                              FileIcon, FileMeta, FileActions, FileContextMenu,
│   │                              RenameDialog, ShareLinkDialog, PermissionsDialog,
│   │                              MediaThumbnail, FileUploadDropzone, DuplicateUploadDialog,
│   │                              FileBreadcrumbs
│   ├── surfaces/                ← PageShell (per-section), WindowPanelShell, MobileStack,
│   │                              EmbeddedShell, DialogShell, DrawerShell, PreviewPane
│   ├── inline/
│   │   └── InlineMediaRef.tsx   ← the universal inline render component
│   └── pickers/                 ← FilePicker, FolderPicker, SaveAsDialog
│
├── providers/                   ← CloudFilesRealtimeProvider (mounted once globally), UploadGuardHost
├── virtual-sources/             ← untouched
├── utils/                       ← format, mime, path, icon-map, file-types, preview-capabilities, url-state
└── for_python/, from_python/    ← contracts (kept verbatim)
```

**File count target:** 203 (current) → ~80 (60% reduction).

### 6.3 What gets DELETED (no shims, no aliases)

**FE deletions:**

- `features/file-handler/` — entire directory (merged into `features/files/`)
- `features/files/hooks/useSignedUrl.ts`
- `features/files/hooks/useFileAsset.ts` (replaced by `useFile`)
- `features/files/hooks/useFileDocument.ts` (folded into `useFileBlob`)
- `features/agents/hooks/useAiImageUrl.ts` (252 lines)
- `features/audio/services/audioFallbackUpload.ts` direct signed-URL fetches
- `features/tasks/services/taskService.ts` legacy attachments
- `features/resource-manager/resource-picker/FilesResourcePicker.tsx` direct fetch
- `features/files/utils/resolveRenderableImageUrl.ts` (folded into resolver)
- `features/files/upload/cloudUpload.ts` (replaced by `upload()`)
- `features/files/api/server-client.ts` (320 lines, no callers after Sharp deletion)
- `features/files/redux/rag-thunks.ts` (162 lines, moves to `features/rag/`)
- `components/image/cloud/resolveCloudFileUrl.ts`
- `components/ui/file-upload/useFileUploadWithStorage.ts` (legacy shim, 16 callers migrate)
- `components/ui/file-upload/usePasteImageUpload.ts`
- `components/ui/file-upload/ImageUploadField.tsx` direct `uploadAsset` calls
- 3 of 4 `features/image-manager/components/*Tab.tsx` (use `<EmbeddedShell>` + kind filter)
- Hand-authored Asset types in `features/files/types.ts:1187-1311`
- Direct `Files.uploadFile()` calls in `features/rag/components/library/LibraryPage.tsx`, `features/rag/components/data-stores/DataStoresPage.tsx`
- `ImageAssetUploader.tsx` dual upload path — unified to `useFileUpload({ preset, variants })`
- 4 of 4 current per-route `<CloudFilesRealtimeProvider>` mounts (now in `app/Providers.tsx`)

**Next.js API routes deleted:**

- `app/api/images/upload/route.ts` (already deleted 2026-05-12)
- `app/api/images/proxy/route.ts` (already deleted)
- `app/api/files/download/route.ts` (already deleted)
- `app/api/images/studio/process/route.ts` ← **NEW DELETION** — replaced by `POST /assets/preview`
- `app/api/pdf/compress/route.ts` ← **NEW DELETION** — replaced by `POST /assets/pdf-compress`

**npm deps removed:**

- `sharp` from `package.json` ← **NEW** (was kept only for Image Studio process route)

**Migration sweep:**

- 285+ `useFileSrc(...)` callsites → `useFile(ref, { target: "render" }).url`
- Hundreds of `<img src={file.publicUrl ?? ...}>` patterns → `<InlineMediaRef ref={mediaRef}>`

### 6.4 ESLint enforcement (Phase 0 — locks the chokepoint)

```
no-restricted-imports:
  - features/file-handler/*           (whole directory will not exist post-merge)
  - features/files/api/*              (use generated client only)
  - features/files/state/*            (use thunks + hooks)
  - features/files/client/*           (internal)
  - features/files/resolver/*         (internal)
  - features/files/cache/*            (internal)

no-restricted-syntax:
  - supabase.storage.from(...)        (banned globally)
  - getPublicUrl                      (banned globally)
  - fetch('/files/...'), fetch('/assets/...'), fetch('/share/...'), fetch('/api/files/...'), fetch('/api/share/...')
  - Manual ImageBlock/AudioBlock/VideoBlock/DocumentBlock literals outside features/files/
  - Manual MediaRef object literals outside features/files/state/converters.ts
  - new Redux slices keyed by "files"|"file"|"cloud" (extend cloudFiles)
  - new app/api/(images|files|share|pdf)/* routes
```

### 6.5 Type generation pipeline

- BE OpenAPI → `pnpm gen:types` → `types/python-generated/api-types.ts`
- Asset, AssetVariant, AssetPreset, MediaRef, every request/response — all regenerated
- CI gate: `pnpm gen:types && git diff --exit-code` — fails on drift
- Hand-authored Asset types in `features/files/types.ts:1187-1311` deleted in the same PR

### 6.6 Realtime — one provider, one slice

- `<CloudFilesRealtimeProvider>` mounted ONCE in `app/Providers.tsx`, gated on `userId`
- Delete the 4 per-route mounts (files layout, images layout, code explorer, files window)
- Slice changes: `cloud_files` UPDATE on variant row → middleware looks up `metadata.derived_from` and patches `assetsByMasterId[parent].variants[metadata.variant_key]`
- Request ledger dedups echoes via `metadata.request_id`

---

## Part 7 — Roadmap (integrated, three PRs back-to-back)

Aligned with the backend plan's PR structure. FE PR depends on BE PRs landing.

### PR 1 — `matrx-utils` v1.1.0 (backend team, ~2 weeks)

Backend plan §4.1, plus the gap items from Part 5:

| # | Step | Source |
|---|---|---|
| 1–11 | Backend §4.1 1–11 | backend |
| 12 | Combined-operation endpoints (`POST /assets` with `options.share / permissions / variants`; `PATCH /files/{id}` union; `POST /files/bulk` discriminator) | **§5 gap 1** |
| 13 | Mandatory social baseline merge in `VariantsService` for public images | **§5 gap 2** |
| 14 | Confirmed preset variant set per checklist | **§5 gap 3** |
| 15 | `UrlMinter` always returns CDN URL for `visibility="public"` | **§5 gap 4** |
| 16 | `ETag` + 206 Range on `/files/{id}/download` | **§5 gap 5** |
| 17 | `X-Request-Id` echo in realtime metadata | **§5 gap 6** |
| 18 | Idempotency covers combined operations | **§5 gap 7** |
| 19 | SVG first-class in `preset="logo"` | **§5 gap 8** |
| 20 | `POST /assets/preview` spec | **§5 gap 9** |
| 21 | `POST /assets/pdf-compress` spec | **§5 gap 10** |
| 22 | `cld_events` outbox + webhook dispatcher exposed | **§5 gap 12** |
| 23 | `cld_files.checksum` always populated + exposed in envelope | **§5 gap 13** |
| 24 | `Content-Length` on every response | **§5 gap 14** |
| 25 | Realtime publication on `processed_documents`, `cld_share_links`, `cld_file_permissions` | **§5 gap 15** |

### PR 2 — `aidream` slim (backend team, ~1 week)

Backend plan §4.2 unchanged. Drop the inline event-dispatcher startup block; rewrite three routers (~670 lines total); delete `media.py` + `podcast_media.py`; slim `common/cloud_files.py` to 5 lines; bump matrx-utils to v1.1.0.

### PR 3 — Frontend rebuild (this team, ~2-3 weeks)

Combines backend plan §4.3 + Part 4 (SW + IDB streaming cache). Hard cut, one PR.

| # | Step |
|---|---|
| 1 | ESLint chokepoint (Phase 0) — locks new bypasses; ships standalone |
| 2 | Regenerate `types/python-generated/api-types.ts`; delete hand-authored Asset types |
| 3 | Merge `features/file-handler/` INTO `features/files/` (move expiry-wheel, magic-bytes, NormalizedFile, FileSource, FileTarget) |
| 4 | Add `assetsByMasterId` to Redux state; selectors `selectAssetByMasterId`, `selectVariantUrl` |
| 5 | Build `useFile` hook reading Redux first, expiry-wheel for refresh |
| 6 | Build single `upload()` primitive with auto transport selection (buffered/presigned/TUS) |
| 7 | Build `<InlineMediaRef>` component |
| 8 | Migrate 285+ `useFileSrc` callsites to `useFile(ref, { target: "render" }).url` — explicit, no alias |
| 9 | Migrate `MediaThumbnail` + `FilePreview` to Redux-first via `useFile` |
| 10 | Sweep agent/chat/podcast/org-logo/canvas/html-pages callsites to `<InlineMediaRef>` |
| 11 | Build `features/files/cache/idb-store.ts` (Dexie matrx-blob-cache) |
| 12 | Extend `useFileBlob` and the handler `useFileBlob` to consult IDB before network |
| 13 | Build Service Worker (`features/files/cache/service-worker/src/sw.ts` + build pipeline → `/public/blob-sw.js`) |
| 14 | Register SW from `app/DeferredSingletons.tsx`, behind `state.preferences.blobCache.enabled` flag |
| 15 | Switch PDF.js renderer to `{ kind: 'remote', url, httpHeaders }`; local worker copy in `/public` |
| 16 | Extend SW to intercept image/video/audio/CDN/share-link URL patterns |
| 17 | Wire cross-tab BroadcastChannel cache invalidation |
| 18 | Migrate Image Studio to `POST /assets/preview`; delete `app/api/images/studio/process/route.ts`; drop `sharp` from package.json |
| 19 | Migrate PDF compress to `POST /assets/pdf-compress`; delete `app/api/pdf/compress/route.ts` |
| 20 | Mount `<CloudFilesRealtimeProvider>` once in `app/Providers.tsx`; delete 4 per-route mounts |
| 21 | ESLint rule banning manual MediaRef literals outside converters |
| 22 | Internal splits: `FilePreview` registry, `FileTable` → TanStack, `PageShell` per-section, thunks.ts split by domain, types.ts split |
| 23 | Build admin observability route `app/(authenticated)/(admin-auth)/administration/blob-cache/page.tsx` |
| 24 | Add `X-Matrx-Cache` debug header (dev-only) |
| 25 | Delete: `useSignedUrl`, `useFileAsset`, `useAiImageUrl`, `useFileSrc` source, `resolveCloudFileUrl.ts`, `useFileUploadWithStorage.ts`, `server-client.ts`, `cloudUpload.ts`, hand-authored Asset types, duplicate image-manager `*Tab.tsx`, RAG `LibraryPage`/`DataStoresPage` direct uploads |
| 26 | `pnpm test`, `pnpm tsc --noEmit`, `pnpm lint` — all green |
| 27 | End-to-end verification (Part 8 below) |

---

## Part 8 — Verification matrix

After PR 3 lands, run the FE dev server and click through:

| # | Surface | Pass criteria |
|---|---|---|
| 1 | Upload podcast cover via `<ImageAssetUploader preset="podcast">` | Response carries 3000² cover + 1400² SD + 1200×630 OG + 400² thumbnail + 128² tiny. URLs are permanent CDN, no `?X-Amz-Signature=`. |
| 2 | View file in gallery | `<InlineMediaRef>` renders the thumbnail variant inline (not the master). |
| 3 | Change visibility public→private | CDN URL flips to signed; variant URLs propagate; SW cache invalidates on realtime event. |
| 4 | Click Download | `Content-Disposition: attachment` forces a save; served from IDB if cached. |
| 5 | Upload 500 MB video | TUS auto-selected, resumable on connection drop. |
| 6 | Render more variants on existing asset | Idempotent (no duplicate variant rows). |
| 7 | Two-tab open, upload from tab A | Tab B receives realtime event (file appears); tab A does NOT double-process (no flicker). |
| 8 | Open 80 MB PDF | First page renders in <1 s. Full document fills IDB cache in background. |
| 9 | Reload, re-open same PDF | First page instant (<200 ms). Network panel shows `X-Matrx-Cache: hit`. |
| 10 | Sign out, sign back in as a different user | Previous user's cache cleared from IDB. New user starts with empty cache. |
| 11 | Upload a logo SVG with `preset="logo"` | Master persists as SVG; raster fallbacks rendered. Asset envelope returns both `urls.svg` and `urls.variants.logo_lg/md/sm`. |
| 12 | Attach existing file to new chat (MediaRef-only) | Server reads bytes; FE makes one POST with `MediaRef { file_id }`, no bytes re-uploaded. |
| 13 | Run `pnpm gen:types && git diff --exit-code` | Exit 0. |
| 14 | Run `pnpm lint` | No `useFileSrc` / `useSignedUrl` / `useFileAsset` / manual MediaRef literals / `supabase.storage` / banned fetch patterns. |
| 15 | Admin `/administration/blob-cache` | Shows live L1/L2 stats, hit/miss counters, SW status, BroadcastChannel inspector. |

---

## Part 9 — Out of scope (explicit, defer to follow-ups)

Per the backend plan §5, plus a few FE additions:

**Backend:**
- Antivirus / clamav on upload
- GDPR cascade delete
- Audit download log (`cld_download_events`)
- S3 lifecycle policies (cold-tier, orphan cleanup)
- Trash auto-purge
- Backup verification + DR rehearsals
- Cross-repo correlation IDs (FE→BE→S3 `X-Request-Id` propagation)
- `cld_user_groups` audit
- Per-org tenancy (`cld_files.parent_org_id`)

**Frontend:**
- FE Sentry / instrumentation
- OPFS or Cache API tiers (IDB + SW + memory covers every requirement)
- Compression / transcoding (stays server-side)
- Replacing `audioSafetyStore`, `payloadSafetyStore`, `redact session-keys` raw IDB stores (different concerns)
- Consolidating the three signed-URL refresh systems into one (already happens via expiry-wheel, but verify)
- Service-side conditional GET (`If-None-Match` → 304) — we work around with `checksum`

---

## Part 10 — Approval checklist before kickoff

- [ ] Backend team confirms Part 5 gaps 1–15 (yes / no / spec)
- [ ] Plan reviewed and agreed end-to-end
- [ ] CLAUDE.md updated to point at this doc as the live plan
- [ ] Phase 0 PR opened (ESLint chokepoint) — lands first, blocks new bypasses immediately
- [ ] PR1 (matrx-utils v1.1.0) merged in backend team
- [ ] PR2 (aidream slim) merged in backend team
- [ ] PR3 (FE rebuild) opened and merged here

---

## Appendix — Quick reference

### Public surface after consolidation

```ts
// hooks
import { useFile, useFileSrc, useFileBlob, useFileUpload, useFileMutation } from "@/features/files";

// facade (non-React)
import { fileHandler } from "@/features/files";

// components
import { InlineMediaRef, FilePreview, FileUploadDropzone, FilePicker } from "@/features/files";

// types
import type { MediaRef, Asset, AssetVariant, AssetPreset, FileSource, NormalizedFile } from "@/features/files";

// MediaRef builders
import { cloudFileToMediaRef, fileIdToMediaRef, urlToMediaRef, fileUriToMediaRef } from "@/features/files";
```

### Forbidden everywhere outside `features/files/`

- `supabase.storage.*`, `getPublicUrl`
- Direct `fetch` of `/files/`, `/assets/`, `/share/`, `/api/files/`, `/api/share/`, `/api/images/`, `/api/pdf/`
- Imports from `features/files/api/*`, `features/files/state/*`, `features/files/client/*`, `features/files/resolver/*`, `features/files/cache/*`
- Manual `<img src="...signed-url...">` construction
- Hand-built `ImageBlock | AudioBlock | VideoBlock | DocumentBlock` literals
- Manual `MediaRef` literals (use the four builders)
- New Redux slices for files (extend `cloudFiles`)
- New `app/api/{images,files,share,pdf}/*` routes
- `import sharp` (npm dep is removed)

### File-count budget — combined

| Layer | Files today | Target | Notes |
|---|---|---|---|
| Hooks (handler + files) | 14 | 5 | useFile / useFileSrc / useFileBlob / useFileUpload / useFileMutation |
| API client | ~12 / 52 fns | 2 / ~7 fns | regenerated from OpenAPI |
| Redux state | 8 | 6 (5 thunk files + slice + selectors + realtime + ledger + converters) | thunks split by domain |
| Resolver | 8 | 8 | unchanged (relocated) |
| Cache (with SW + IDB) | 1 | 7 | NEW: IDB + policy + SW build + register + invalidate + expiry-wheel + blob-lru |
| Upload | 5 | 4 | merged guards |
| Components | ~80 | ~50 | dedup image/* + previewer registry + InlineMediaRef |
| Virtual sources | 7 | 7 | unchanged |
| Providers / utils / types / errors / docs | ~15 | ~12 | small tighten |
| **Total** | **~150–200 (combined)** | **~80** | one directory |

---

**Closing line:** the backend plan and v1 of this doc converge on the same answer: one chokepoint, one envelope, one upload primitive, one hook, one inline component, no shims. v2 adds the byte-cache layer the backend can't address from its side, and pushes back on the API-bundling we need for the round-trip count to actually drop. Approve the Part 5 gap list, freeze, ship in three PRs.
