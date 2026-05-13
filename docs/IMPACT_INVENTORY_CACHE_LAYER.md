# Impact inventory — cache layer (Service Worker + IndexedDB + admin observability)

**Status:** scoped — engineering spec for FE-only Part 4 of `docs/FILE_HANDLING_CONSOLIDATION_PLAN.md`
**Owner:** files / file-handler rebuild — cache-layer agent
**Date:** 2026-05-13
**Scope guardrail:** **only** the new 3-tier byte cache (memory LRU → IndexedDB → Service Worker → network), the SW build pipeline, PDF.js Range integration, the admin observability route, and the integration points that other agents will not touch.

This document is the source-of-truth file list. Consumers of the cache (call sites, generated API clients, MediaRef migration sweep, Redux assetsByMasterId, the upload primitive) are out of scope here.

---

## Summary

| Action     | Count |
| ---------- | ----- |
| CREATE     | 19    |
| MODIFY     | 12    |
| KEEP+MOVE  | 4     |
| DELETE     | 1 (legacy comment block in `blob-cache.ts`; the file itself moves, not deletes) |

Total files affected: 36.

---

## Architecture recap

Reference: plan §4A "Universal Service Worker + IndexedDB streaming cache".

```
  Consumer                                                            Cross-tab
  (img / video / audio / react-pdf / useFileBlob / Save-As / RAG)     │
        │                                                             ▼
        ▼                                              ┌──────────────────────────────┐
  Hook layer (useFileBlob / useFile)                   │  BroadcastChannel matrx-sync │
        │                                              │  (lib/sync/channel.ts)       │
        ▼                                              │  msg: blob-cache:invalidate  │
  L1: in-memory LRU (250 MB, session-scoped)  ◀──────▶ └──────────────────────────────┘
  features/files/cache/blob-lru.ts                                    ▲
        │ miss                                                        │
        ▼                                                             │
  Service Worker fetch handler  ◀───── postMessage ────────────────── │
  /public/blob-sw.js   (one per origin — naturally shared             │
   compiled from features/files/cache/service-worker/src/sw.ts)       │
        │                                                             │
        ▼                                                             │
  L2: IndexedDB (Dexie matrx-blob-cache, 2 GB, userId-scoped)  ───────┘
  features/files/cache/idb-store.ts
        │ miss
        ▼
  Network: BACKEND /files/{id}/download (Range, 206 chunks)
         | CDN ?v=<checksum>
         | /share/{token}/download
         │
         ▼
  Populate L2 → warm L1 → broadcast invalidation if write
```

The single page-side entry into the SW lives in `features/files/cache/register-service-worker.ts`, mounted **once** from `app/DeferredSingletons.tsx`. The single page-side entry into IDB is `features/files/cache/idb-store.ts`. Cross-tier invalidation flows through `features/files/cache/invalidate.ts`.

---

## NEW files to create

### `features/files/cache/` — the cache feature subdir

The plan §6.2 directory layout calls for `features/files/cache/`. Today the equivalent live code is one file (`features/files/hooks/blob-cache.ts`). The new subdir replaces it.

| File | Purpose | Depends on |
| --- | --- | --- |
| `features/files/cache/blob-lru.ts` | In-memory LRU, 250 MB session-scoped. `getCached(key)`, `setCached(key, blob, url)`, `invalidate(key)`, `invalidateAll()`, `getCacheStats()`, `setBudgetBytes(n)`. **MOVED from `features/files/hooks/blob-cache.ts` with key change**: `fileId` → `key` so it can hold non-fileId entries (share-link keys, etc.). | n/a |
| `features/files/cache/idb-store.ts` | Dexie `matrx-blob-cache` DB. Stores: `blobs`, `meta`, `urlMap`. Methods: `readBlob(key)`, `writeBlob(record)`, `dropKey(key)`, `dropFileId(fileId)`, `clearForUser(userId)`, `getStats()`, `evictToBudget(targetBytes)`. SSR-safe (lazy memoized `openDb()`). Mirrors `lib/sync/persistence/idb.ts` patterns (lazy open, no throw, return null on unavailable, fake-indexeddb reset hook). | `dexie@^4.4.2` (already installed) |
| `features/files/cache/policy.ts` | Per-MIME size policy (table from plan §4A). `shouldCache(mime, contentLength)`, `maxBytesForMime(mime)`, `videoThresholdBytes`, `setBudget(perMime, totalBytes)`. Pure data + small functions. | n/a |
| `features/files/cache/invalidate.ts` | Cross-tier + cross-tab invalidation. `invalidateFileId(fileId)`, `invalidateKey(key)`, `clearUser(userId)`. Drops L1, schedules IDB drop, posts to SW (`postMessage({ kind: 'invalidate', ... })`), broadcasts over `matrx-sync`. Subscribes once to `matrx-sync` and listens for incoming `blob-cache:invalidate` to drop L1 in this tab. | `lib/sync/channel.ts`, `blob-lru.ts`, `idb-store.ts` |
| `features/files/cache/expiry-wheel.ts` | **MOVED** from `features/file-handler/intelligence/expiry-wheel.ts`. Signed-URL TTL refresh wheel; resolver consults it. | n/a |
| `features/files/cache/keys.ts` | URL → cache-key derivation. `keyFromDownloadUrl(url, userId)`, `keyFromShareUrl(url, userId)`, `keyFromCdnUrl(url, userId)`, `bypassUrl(url): boolean` (returns true for `X-Amz-Signature` URLs). Pure functions; shared between page-side hooks and SW (imported for types only by SW, since SW is a separate compile unit). | n/a |
| `features/files/cache/register-service-worker.ts` | Page-side SW registration helper. `registerBlobServiceWorker({ enabled, devOptIn })`. Skips in dev unless `localStorage.matrx_dev_sw=1`. Skips when the feature flag is off. Updates `state.preferences.blobCache.enabled` selector inside `app/DeferredSingletons.tsx`. Owns the SW message channel: replies to `request-auth-header`, forwards `cache-stat-update` to the admin slice. | feature flag + `getApiAuthHeaders` |
| `features/files/cache/sw-client.ts` | Page-side wrapper around `postMessage` to the active SW. Methods: `registerUrlMapping(fileId, url)`, `sendInvalidate(key)`, `clearUser(userId)`, `setBudget(opts)`. Returns no-ops if no SW is active. Used by `invalidate.ts` and `register-service-worker.ts`. | n/a |
| `features/files/cache/service-worker/src/sw.ts` | The Service Worker source (TypeScript). Implements: install/activate, fetch handler with URL-pattern matching from `keys.ts` shape (re-implemented locally — no cross-imports of page-side modules at runtime), Range/206 passthrough for PDF, IDB write-through, deduplicated background full-document stitch, postmessage protocol below. **Self-contained** — only imports types from `cache/types.ts`. | n/a |
| `features/files/cache/service-worker/build-sw.ts` | esbuild-style compile script. Reads `service-worker/src/sw.ts`, bundles with esbuild, emits `/public/blob-sw.js`. Run from `pnpm build:sw` (added to `package.json`). | `esbuild` (add to devDeps) |
| `features/files/cache/types.ts` | Shared types (cache record shape, postmessage protocol messages, policy enums). Imported by both page-side and SW. **Types-only — no runtime exports** so the SW bundle stays clean. | n/a |

### `public/` — build artifacts

| File | Purpose | How it gets there |
| --- | --- | --- |
| `public/blob-sw.js` | Compiled SW artifact, served at `/blob-sw.js` (scope `/`). | Generated by `features/files/cache/service-worker/build-sw.ts` during `pnpm build:sw`; wired into the main `build` script in `package.json`. **Not checked in** — added to `.gitignore`. |
| `public/pdfjs-worker.min.mjs` | pdfjs worker pinned at build time. Replaces the runtime `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs` reference in `PdfDocumentRenderer.tsx:62`. | Copied from `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` by `scripts/copy-pdfjs-worker.mjs` on `pnpm postinstall`. **Not checked in** — added to `.gitignore`. |

### `scripts/`

| File | Purpose |
| --- | --- |
| `scripts/copy-pdfjs-worker.mjs` | Post-install copy script. Reads `node_modules/pdfjs-dist/build/pdf.worker.min.mjs`, writes `public/pdfjs-worker.min.mjs`. Idempotent. Wired into `package.json` `postinstall`. |

### `app/(authenticated)/(admin-auth)/administration/blob-cache/`

Sibling-pattern model: `app/(authenticated)/(admin-auth)/administration/server-cache/` (2 files: `page.tsx` + `layout.tsx`). Match that shape.

| File | Purpose |
| --- | --- |
| `app/(authenticated)/(admin-auth)/administration/blob-cache/layout.tsx` | Minimal layout; sets page title, no extra chrome. Mirrors `server-cache/layout.tsx`. |
| `app/(authenticated)/(admin-auth)/administration/blob-cache/page.tsx` | `'use client'`. Gated by `selectIsSuperAdmin`. Composes the four inspectors below. |
| `app/(authenticated)/(admin-auth)/administration/blob-cache/_components/L1Inspector.tsx` | Reads `getCacheStats()` from `blob-lru.ts` on a 1s interval. Renders: entry count, total bytes, budget, top 20 by size, hit/miss counters (from the new `cache-stat-update` channel). |
| `app/(authenticated)/(admin-auth)/administration/blob-cache/_components/L2Inspector.tsx` | Reads `getStats()` from `idb-store.ts`. Same shape as L1Inspector. Adds two buttons: "Evict to 70%" → `evictToBudget(0.7 * budget)`, "Clear all" → `clearForUser(currentUserId)`. |
| `app/(authenticated)/(admin-auth)/administration/blob-cache/_components/SwStatus.tsx` | Reads `navigator.serviceWorker.controller` + listens for SW `cache-stat-update`. Shows: registered version, last activated, intercept counters per URL family (download/share/CDN/image/video/audio). |
| `app/(authenticated)/(admin-auth)/administration/blob-cache/_components/BroadcastInspector.tsx` | Subscribes to `matrx-sync` channel via `lib/sync/channel.ts`. Renders a live tail of recent `blob-cache:invalidate` messages with their `key` and originating tab ID. |
| `app/(authenticated)/(admin-auth)/administration/blob-cache/_components/CachePolicyForm.tsx` | Edits `state.preferences.blobCache` settings: enable toggle, per-MIME byte budget overrides, video threshold (default 50 MB), total IDB budget (default 2 GB). Writes via the settings system. |
| `app/(authenticated)/(admin-auth)/administration/blob-cache/_components/SessionToggle.tsx` | "Disable SW for this session" toggle — writes `sessionStorage.matrx_blob_sw_disabled=1` and unregisters the active SW; restores on toggle off. |

### Settings registry entries

| File | Change |
| --- | --- |
| `features/settings/registry.ts` (existing — see line 122) | **MODIFY**: add a "Blob cache" group entry (admin-only visibility) describing the toggle, per-MIME budgets, video threshold, and total IDB budget. State path: `state.preferences.blobCache.{enabled, perMime, videoThresholdBytes, totalBudgetBytes}`. The actual slice is reused (preferences slice already exists). |

---

## MODIFY existing files

| File | Lines | Current behavior | What changes |
| --- | --- | --- | --- |
| `features/files/hooks/blob-cache.ts` | 153 | In-mem LRU 250 MB, owns blob URLs, keyed by `fileId`. | **MOVED** to `features/files/cache/blob-lru.ts`. Generalize key from `fileId` to `key: string` so non-file entries (share links, raw URLs) fit. Add `getCached`/`setCached` to consult IDB on miss before returning null (or split: caller in `useFileBlob` handles L2 fall-through; keep L1 a pure synchronous API and have `cache/get.ts` orchestrate L1+L2). Delete the legacy block comment "Why not IndexedDB" since the rationale flips. |
| `features/files/hooks/useFileBlob.ts` | 185 | Direct fetch fallback; consults `blob-cache.ts` for L1 only. | Insert IDB read (via `cache/idb-store.ts`) before the network fetch when L1 misses. SSR-safe (no IDB access at import or during hydration). Continues to write through to L1; cache layer handles L2 writeback inside `setCached` orchestration. Import path moves from `./blob-cache` to `@/features/files/cache/blob-lru` + `@/features/files/cache/idb-store`. |
| `features/file-handler/hooks/useFileBlob.ts` | 18 | Thin file; legacy direct fetch path. | After the directory merge, this file is deleted by the parallel merge agent. **For our cache-layer scope**, the only thing we add is a delegation TODO comment — actual deletion is the merge agent's job. |
| `features/files/redux/realtime-middleware.ts` | 509 | On cross-device version insert, calls `invalidateBlobCache(fileId)` (line 49, line 434). | Replace `invalidateBlobCache(fileId)` import + call with `invalidateFileId(fileId)` from `@/features/files/cache/invalidate` so the IDB record is dropped AND the broadcast fires AND the SW is notified. Single-line semantic change at two import sites. |
| `features/files/redux/thunks.ts` | 1790 | Upload/restore/delete thunks call `invalidateBlobCache(fileId)` (line 45). | Same migration: import from `cache/invalidate` and call `invalidateFileId`. The thunks themselves are split by domain in PR3 step 22 (out of our scope). |
| `features/files/components/core/FilePreview/previewers/PdfDocumentRenderer.tsx` | 616 | Accepts `blobUrl: string \| null` (line 78). Uses `documentFile = { url: blobUrl }` (line 272). Loads worker from CDN (line 62: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`). | Accept `source: { kind: 'blob-url'; blobUrl: string \| null } \| { kind: 'remote'; url: string; httpHeaders?: Record<string, string> }`. Build `documentFile` from `source`: blob-url passes `{ url }`; remote passes `{ url, httpHeaders, withCredentials: false, rangeChunkSize: 65536 }`. Switch worker source from CDN URL to local `/pdfjs-worker.min.mjs`. Keep all toolbar / zoom / overlay code unchanged. |
| `features/files/components/core/FilePreview/previewers/PdfPreview.tsx` | 87 | Calls `useFileBlob(fileId)` → passes `blobUrl={url}` to `<PdfDocumentRenderer>` (line 74). | Switch to passing `source={{ kind: 'remote', url: ${BACKEND}/files/${fileId}/download, httpHeaders: getApiAuthHeaders() }}` so the SW + PDF.js Range path takes over. `useFileBlob` continues to exist for non-PDF previewers; for PDFs, the SW is the cache layer and PDF.js does the streaming. |
| `features/pdf-extractor/studio/PdfStudioUrlViewer.tsx` | 169 | Manual `fetch(url)` + chunk-stitch + `URL.createObjectURL` (lines 74–140); passes `blobUrl=` to renderer (line 158). | Replace the entire fetch/stitch block with `source={{ kind: 'remote', url }}`. The SW handles caching; PDF.js handles streaming. ~70 lines removed. |
| `features/rag/components/documents/panes/PdfPane.tsx` | (~unknown) | Imports `pdfjs-dist` same as the file viewer (per grep at line 25). | Verify it routes through `PdfDocumentRenderer` and accepts the new `source` prop shape OR refactor in lockstep. Probable touch — file exists, exact integration TBD when the file is opened. |
| `app/DeferredSingletons.tsx` | 205 | Mounts deferred singletons after idle. | Add ONE new idle task: `useIdleTask("register-blob-sw", 10, async () => { const { registerBlobServiceWorker } = await import("@/features/files/cache/register-service-worker"); registerBlobServiceWorker({ enabled: blobCacheFlag, devOptIn: typeof window !== 'undefined' && localStorage.getItem('matrx_dev_sw') === '1' }); })`. Read flag via `useAppSelector(selectBlobCacheEnabled)`. Lazy-imports the registration module so it stays out of this file's static graph. |
| `app/Providers.tsx` | 165 | No `CloudFilesRealtimeProvider` mount (4 per-route mounts elsewhere). | **MOUNT ONCE GLOBALLY.** Add `<CloudFilesRealtimeProvider userId={...}>` wrapping `{children}` (or inside `<RequestRecoveryProvider>` per the existing nesting). Userid sourced from `initialReduxState` so it's SSR-known. This is the prerequisite the cache layer needs because realtime events drive `invalidateFileId` from `realtime-middleware.ts`. The four legacy mounts get deleted by the merge agent in step 20 of PR3 — out of our scope but called out as a coordination point. |
| `package.json` | (root) | No `postinstall`. `sharp` and `react-pdf` already deps. No SW build target. | Add: `"postinstall": "node scripts/copy-pdfjs-worker.mjs"` (or chain if one exists). Add: `"build:sw": "tsx features/files/cache/service-worker/build-sw.ts"`. Wire `build:sw` into the main `build` script: `"build": "ts-node scripts/generate-manifest.ts && tsx scripts/check-registry.ts && tsx features/files/cache/service-worker/build-sw.ts && next build"`. Add `esbuild` to `devDependencies`. (`sharp` removal happens in the Image Studio migration step — not our scope.) |
| `.gitignore` | (root) | — | Add `/public/blob-sw.js` and `/public/pdfjs-worker.min.mjs` (build artifacts). |

---

## KEEP + MOVE — existing primitives that survive

These are proven, working today. We relocate them, but don't touch the logic.

| File today | New location | Why |
| --- | --- | --- |
| `features/file-handler/intelligence/expiry-wheel.ts` (98 lines) | `features/files/cache/expiry-wheel.ts` | Already proven; signed-URL TTL refresh. The SW (for background full-document stitch) and the hooks both consult it. |
| `features/file-handler/intelligence/magic-bytes.ts` (103 lines) | `features/files/resolver/magic-bytes.ts` | Resolver-owned, not cache-owned. Listed here for completeness — the resolver agent moves it; we just confirm we don't accidentally co-locate it under `cache/`. |
| `lib/sync/channel.ts` (112 lines) | (unchanged) | The BroadcastChannel pattern we reuse for cross-tab invalidation. `cache/invalidate.ts` subscribes via `openSyncChannel()` and emits `{ type: "blob-cache:invalidate", key }` messages. |
| `lib/sync/persistence/idb.ts` (215 lines) | (unchanged) | Reference pattern for the new `cache/idb-store.ts`. We mirror: lazy memoized `openDb()`, SSR-safe gating (`hasIndexedDb()`), null-return on unavailable, fake-indexeddb test reset hook. We do NOT reuse the `slices` table — `cache/idb-store.ts` is a separate database (`matrx-blob-cache`) so cache eviction never threatens sync persistence. |

---

## DELETE

| Item | Why |
| --- | --- |
| Legacy block comment in `features/files/hooks/blob-cache.ts` lines 28–33 ("Why not IndexedDB: re-fetching a blob from IndexedDB on every mount would still be measurably slower…") | The design rationale flips. With the SW path, IDB is the persistence tier, not a perf regression. The comment is misleading and must go in the same move. |

No other deletions in our scope. The file deletions in PR3 step 25 (`useSignedUrl`, `useFileAsset`, `useAiImageUrl`, `useFileSrc`, etc.) are owned by the hooks-consolidation agent.

---

## Postmessage protocol contract

All messages travel through `navigator.serviceWorker.controller.postMessage()` (page → SW) and `event.source.postMessage()` (SW → page). The page side is wrapped in `features/files/cache/sw-client.ts`. The SW handles them inline in `service-worker/src/sw.ts`.

### Page → SW

| Type | Fields | Semantics |
| --- | --- | --- |
| `register-url-mapping` | `{ kind: 'register-url-mapping'; fileId: string; url: string; checksum?: string; userId: string }` | Page tells SW which `url` maps to which `fileId` so the SW can later invalidate by `fileId` even when only the URL is known at intercept time. Stored in the `urlMap` IDB store. |
| `invalidate` | `{ kind: 'invalidate'; key?: string; fileId?: string; userId: string }` | Drop one entry. Either form is accepted; `fileId` form drops every `urlMap` entry for that file. |
| `clear-user` | `{ kind: 'clear-user'; userId: string }` | Drop every entry stamped with `userId`. Called on sign-out. |
| `set-budget` | `{ kind: 'set-budget'; totalBytes?: number; perMime?: Record<string, number>; videoThresholdBytes?: number }` | Update the SW's in-memory copy of the policy. Page is source of truth; this is a fast push. |

### SW → page

| Type | Fields | Semantics |
| --- | --- | --- |
| `cache-stat-update` | `{ kind: 'cache-stat-update'; stats: { intercepts: Record<URLFamily, number>; hits: number; misses: number; bytesServed: number; bytesStored: number } }` | Periodic (5s) push. Admin observability route subscribes; `register-service-worker.ts` forwards to a Redux subslice (or local React state in the inspector). |
| `request-auth-header` | `{ kind: 'request-auth-header'; requestId: string; url: string }` | SW needs a fresh `Authorization` header for a background fetch (e.g., progressive PDF stitch). Page replies with `{ kind: 'auth-header-response'; requestId; header: string \| null }`. 2-second timeout on the SW side; on timeout, SW skips the background fetch. |
| `auth-header-response` | `{ kind: 'auth-header-response'; requestId: string; header: string \| null }` | The reply, posted back via `event.source.postMessage`. |

`URLFamily = 'download' | 'share' | 'cdn' | 'image' | 'video' | 'audio' | 'other'`.

All schemas live in `features/files/cache/types.ts` and are validated on receive in both directions (defensive: untrusted SW message channel).

---

## IndexedDB schema (full)

Database: `matrx-blob-cache`. Owner: `features/files/cache/idb-store.ts`. Dexie schema version 1.

### Store: `blobs`

Primary key: `key` (compound, see "Cache key strategy" below).

| Field | Type | Notes |
| --- | --- | --- |
| `key` | string | `${userId}:${scope}:${id}:${version}:${checksum}` — see key table below |
| `userId` | string | Identity scoping; indexed |
| `fileId` | string \| null | Indexed; null for share-link entries |
| `version` | number \| 'current' | Indexed |
| `checksum` | string | SHA-256 from `cld_files.checksum`; indexed |
| `mimeType` | string | |
| `bytes` | number | `blob.size` cached for eviction math |
| `blob` | Blob | The actual bytes |
| `etag` | string \| null | From response header |
| `fetchedAt` | number | ms epoch |
| `lastAccessedAt` | number | Updated on hit; indexed for LRU |
| `source` | `'sw' \| 'hook' \| 'background-stitch'` | Telemetry/observability |

Indexes: `key` (primary), `userId`, `fileId`, `lastAccessedAt`, `checksum`.

### Store: `meta`

Primary key: `id` (singleton row, id=`'current'`).

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | `'current'` |
| `policyVersion` | number | Bumped on schema/policy changes; drops all rows on mismatch |
| `totalBudgetBytes` | number | |
| `perMime` | Record<string, number> | |
| `videoThresholdBytes` | number | |
| `lastEvictionAt` | number | |

### Store: `urlMap`

Primary key: `url`. Lets the SW reverse `url → fileId` for `register-url-mapping`-style invalidation.

| Field | Type | Notes |
| --- | --- | --- |
| `url` | string | normalized (query stripped of signing params) |
| `fileId` | string | indexed |
| `userId` | string | indexed |
| `registeredAt` | number | |

Dexie store string: `"blobs: key, userId, fileId, lastAccessedAt, checksum"`, `"meta: id"`, `"urlMap: url, fileId, userId"`.

---

## Cache key strategy reference table

| URL pattern | Key | Notes |
| --- | --- | --- |
| `${BACKEND}/files/{id}/download` (no `?version=`) | `${userId}:file:${fileId}:current:${checksum}` | Current head version. Checksum from `register-url-mapping` or the ETag header. |
| `${BACKEND}/files/{id}/download?version=N` | `${userId}:file:${fileId}:${N}:${checksum}` | Pinned-version read. |
| `${BACKEND}/share/{token}/download` | `${userId}:share:${token}:current:${checksum}` | Share-link reads. `fileId` may not be known to the SW; `urlMap` resolves on the page side once known. |
| CDN URL ending in `?v=<checksum>` (public assets) | `${userId}:file:${fileId}:current:${checksum}` | `fileId` resolved via `urlMap`; `checksum` extracted from the query string. Falls back to `${userId}:url:${sha256(url)}` if `fileId` unknown. |
| Signed S3 URL with `X-Amz-Signature` query | **bypass** | Caching a pre-signed URL creates stale-URL bugs once the URL rotates. SW lets these through untouched. |
| `${BACKEND}/files/{id}/preview` and other non-download endpoints | bypass | Side-effects or no-byte responses. |
| Anything under `/_next/`, `/__webpack_hmr`, `/api/`, `/api/auth/*` | bypass | Dev infra + auth flows. |

The `bypassUrl(url)` helper in `features/files/cache/keys.ts` is the single source of truth and is imported (type-shape) by both the page and the SW.

---

## Per-MIME size policy

| MIME prefix | Cache | Max per entry |
| --- | --- | --- |
| `image/*` | yes | 50 MB |
| `audio/*` | yes | 100 MB |
| `video/*` | yes (if `Content-Length` ≤ video threshold, default 50 MB) | 50 MB |
| `application/pdf` | yes | 250 MB |
| `application/zip`, `application/x-tar`, `application/gzip` | yes | 500 MB |
| `text/*`, `application/json`, `application/xml` | yes | 10 MB |
| anything else with `Content-Length ≤ 25 MB` | yes | 25 MB |
| else | no | — |

Defaults shipped in `features/files/cache/policy.ts`. Admin can override per-MIME budgets via the settings entry. Total IDB budget defaults to 2 GB. LRU eviction with size-aware preference (oldest entries >2 MB evicted first). `QuotaExceededError` → evict to 70% of budget, retry once, fall back to network if still failing.

---

## Phased rollout (cache-layer-specific phases)

Each phase is independently revertible. The cache-layer rollout fits inside PR3 steps 11–17 and 23–24 from plan §7.

| Phase | What lands | Files touched |
| --- | --- | --- |
| **Phase 0 — Foundation** | Feature flag `state.preferences.blobCache.enabled` (default `false`). Settings entry registered. `cache/` subdir scaffolded with `policy.ts`, `keys.ts`, `types.ts`. | `features/settings/registry.ts`, `features/files/cache/{policy,keys,types}.ts` |
| **Phase 1 — L1 move** | `blob-lru.ts` lands at new path. `useFileBlob`, `realtime-middleware`, `thunks.ts` migrate imports. Old `hooks/blob-cache.ts` deleted (the move). Legacy comment block dropped. Behavior unchanged. | `features/files/cache/blob-lru.ts`, `features/files/hooks/blob-cache.ts` (delete), `features/files/hooks/useFileBlob.ts`, `features/files/redux/realtime-middleware.ts`, `features/files/redux/thunks.ts` |
| **Phase 2 — IDB tier** | `idb-store.ts`, `invalidate.ts`, `expiry-wheel.ts` (moved) land. `useFileBlob` consults IDB before network. Cross-tab BC wired. Flag-gated — flag still default `false`. | `features/files/cache/{idb-store,invalidate,expiry-wheel}.ts`, `features/files/hooks/useFileBlob.ts`, `features/file-handler/intelligence/expiry-wheel.ts` (deletion handled by merge agent) |
| **Phase 3 — Realtime mount** | `<CloudFilesRealtimeProvider>` mounted in `app/Providers.tsx`. (The four legacy per-route mounts are deleted by the merge agent in step 20 — coordination point.) | `app/Providers.tsx` |
| **Phase 4 — PDF.js remote source** | `PdfDocumentRenderer.tsx` accepts `source: { kind: 'remote' \| 'blob-url' }`. Worker copies from `node_modules/pdfjs-dist/build/`. `postinstall` script wired. `PdfPreview` switches to `kind: 'remote'`. `PdfStudioUrlViewer` switches. PDF.js Range requests fire — but with no SW intercept yet, every Range hits the network. | `scripts/copy-pdfjs-worker.mjs`, `package.json`, `public/pdfjs-worker.min.mjs` (build artifact), `features/files/components/core/FilePreview/previewers/PdfDocumentRenderer.tsx`, `features/files/components/core/FilePreview/previewers/PdfPreview.tsx`, `features/pdf-extractor/studio/PdfStudioUrlViewer.tsx`, `features/rag/components/documents/panes/PdfPane.tsx` |
| **Phase 5 — SW for /files/{id}/download** | SW source written. `build-sw.ts` wired into `package.json` `build` script. `register-service-worker.ts` mounts from `DeferredSingletons.tsx`. SW intercepts download URLs only (other URL patterns still hit the network directly). Flag stays default `false`. Manual opt-in via `localStorage.matrx_dev_sw=1`. | `features/files/cache/service-worker/{src/sw.ts,build-sw.ts}`, `features/files/cache/{register-service-worker,sw-client}.ts`, `app/DeferredSingletons.tsx`, `package.json` |
| **Phase 6 — Image/video/audio/CDN/share interception** | SW URL-family matcher extended to cover image, video, audio, CDN-with-checksum, and share-link patterns. Per-MIME policy enforced inside the SW fetch handler. | `features/files/cache/service-worker/src/sw.ts`, `features/files/cache/keys.ts` |
| **Phase 7 — Cross-tab hardening + observability** | Admin observability route lands with all four inspectors. `X-Matrx-Cache: hit/miss` debug header (dev-only). Live BroadcastChannel inspector. "Disable SW for this session" toggle. Per-MIME budget editor. | `app/(authenticated)/(admin-auth)/administration/blob-cache/**` |
| **Phase 8 — Default-on** | Flip `state.preferences.blobCache.enabled` default to `true`. Roll forward; rollback path is flag flip. | `features/settings/registry.ts` (default value), `features/files/cache/register-service-worker.ts` (env-default fallback) |

---

## Dev mode + iOS Safari behavior

**Dev mode (`NODE_ENV !== 'production'`)**:
- SW registration is **disabled by default** to avoid HMR interference.
- Opt-in via `localStorage.matrx_dev_sw=1` (set manually for debugging).
- Always excludes: `/_next/*`, `/__webpack_hmr`, `/api/*`, `/api/auth/*`.
- The post-install copy of `pdfjs-worker.min.mjs` runs in dev too, so PDF.js works locally without a CDN dep.

**iOS Safari + private browsing graceful degradation**:
- IDB unavailable (private browsing, locked-down profile, quota exhausted): `idb-store.ts` returns null from all reads; writes silently no-op (mirrors `lib/sync/persistence/idb.ts` behavior). The app falls through to network. L1 still works.
- SW registration unsupported (iOS Safari < 11.1 or disabled): `register-service-worker.ts` short-circuits. The app continues with L1 + (when available) L2 only. The SW intercept layer is missing, so legacy `<img src>`/`<video src>` callers don't get caching — but typed-hook callers (`useFileBlob`, `useFile`) still hit L1 + L2.
- `BroadcastChannel` unsupported: `lib/sync/channel.ts` already handles this gracefully (the `available` flag goes false). `cache/invalidate.ts` does the in-tab L1+L2+SW drop regardless and silently skips the broadcast.

The cache layer never throws, never blocks first render, never delays auth. Every tier is best-effort.

---

## Migration dependencies (order things must land in)

1. **`blob-lru.ts` move** + **IDB store creation** must land in the same PR (or back-to-back) because the L1 import path changes affect three files (`useFileBlob`, `realtime-middleware`, `thunks.ts`). Doing them separately doubles the churn.
2. **`cache/invalidate.ts` and the cross-tab BC wiring** must exist before SW registration goes live, because the realtime middleware will already be dispatching `invalidateFileId` once Phase 3 mounts the global realtime provider.
3. **`<CloudFilesRealtimeProvider>` mount in `app/Providers.tsx`** must happen BEFORE the four legacy mounts are deleted (else realtime events stop firing entirely for a window). This is a coordination point with the cleanup agent owning step 20 of PR3.
4. **PDF.js renderer accepts `source: { kind: 'remote' }`** must land before `PdfPreview` and `PdfStudioUrlViewer` switch their callsites; otherwise type errors block compile.
5. **`scripts/copy-pdfjs-worker.mjs` + `postinstall` wire-up** must land in the same PR as the renderer change, otherwise dev users hit a 404 on `/pdfjs-worker.min.mjs`.
6. **SW build pipeline (`build-sw.ts` + `package.json` build script chain)** must land before any registration code runs, otherwise `register-service-worker.ts` will fail to fetch `/blob-sw.js` (or worse, fetch a stale build).
7. **SW intercept of `/files/{id}/download` only** lands FIRST (Phase 5). Image/video/audio/CDN come AFTER (Phase 6). This lets us measure regression risk on one URL family before expanding scope.
8. **Admin observability route** lands AFTER Phase 6 so all the inspectors have real data to render.
9. **Default-on flag flip** is the last step. Until then, every consumer goes through the pre-cache code path.

---

## Open questions for the user

1. **SW build artifact location.** The plan says `/public/blob-sw.js`. Confirm this is acceptable given the existing `/public` contents (no `*.js` artifacts there today — all listed files are static media). Alternative: a `next.config` rewrite from `/blob-sw.js` to a build-time generated location.
2. **`/public/pdfjs-worker.min.mjs` versioning.** Should we suffix the checksum (e.g. `pdfjs-worker.<version>.min.mjs`) for cache-busting across pdfjs version bumps, or trust the `postinstall` overwrite + `Cache-Control` on the static asset?
3. **`build:sw` integration into the main `build` script** — preferred chain location? Current `build` script: `ts-node scripts/generate-manifest.ts && tsx scripts/check-registry.ts && next build`. Proposed insertion: between `check-registry` and `next build`. Confirm.
4. **Realtime mount in `app/Providers.tsx`.** Today `app/(a)/files/layout.tsx`, `app/(a)/images/layout.tsx`, `features/code/views/explorer/CloudFilesExplorer.tsx`, `features/window-panels/windows/cloud-files/FilePreviewWindow.tsx`, and `features/window-panels/windows/cloud-files/CloudFilesWindow.tsx` all mount `<CloudFilesRealtimeProvider>` locally. Confirm the cache-layer agent should add the global mount (with the cleanup agent later deleting the five locals), versus deferring entirely to the cleanup agent. Risk if deferred: the cache layer ships behind a feature flag and realtime invalidation needs the global mount before the SW intercept goes live.
5. **`esbuild` as a new devDep.** Confirm we want esbuild for `build-sw.ts` rather than reusing the project's existing tsx + tsc or Next's internal bundler. esbuild is the lowest-friction path for emitting a single bundled `.js` artifact from a `.ts` source.
6. **Sibling settings entry naming.** Should the admin observability route be `/administration/blob-cache` or `/administration/file-cache`? Matching the user-visible label vs the code subsystem name. Settings group key follows.
7. **PdfPane.tsx scope.** `features/rag/components/documents/panes/PdfPane.tsx` imports `pdfjs-dist` (line 25 per grep). Confirm this is in our scope (it likely needs the same `source: { kind: 'remote' }` migration) versus the RAG agent's scope.
8. **`policyVersion` bump policy.** When per-MIME budget defaults change in `policy.ts`, should we bump `meta.policyVersion` to drop the whole IDB cache? Or trust LRU eviction? Recommendation: bump on schema changes only, not budget changes.

---

## Appendix — file-paths reference (all absolute)

**Existing files this agent reads/modifies:**
- `/Users/armanisadeghi/code/matrx-frontend/features/files/hooks/blob-cache.ts`
- `/Users/armanisadeghi/code/matrx-frontend/features/files/hooks/useFileBlob.ts`
- `/Users/armanisadeghi/code/matrx-frontend/features/file-handler/hooks/useFileBlob.ts`
- `/Users/armanisadeghi/code/matrx-frontend/features/file-handler/intelligence/expiry-wheel.ts`
- `/Users/armanisadeghi/code/matrx-frontend/features/files/redux/realtime-middleware.ts`
- `/Users/armanisadeghi/code/matrx-frontend/features/files/redux/thunks.ts`
- `/Users/armanisadeghi/code/matrx-frontend/features/files/components/core/FilePreview/previewers/PdfDocumentRenderer.tsx`
- `/Users/armanisadeghi/code/matrx-frontend/features/files/components/core/FilePreview/previewers/PdfPreview.tsx`
- `/Users/armanisadeghi/code/matrx-frontend/features/pdf-extractor/studio/PdfStudioUrlViewer.tsx`
- `/Users/armanisadeghi/code/matrx-frontend/features/rag/components/documents/panes/PdfPane.tsx`
- `/Users/armanisadeghi/code/matrx-frontend/app/DeferredSingletons.tsx`
- `/Users/armanisadeghi/code/matrx-frontend/app/Providers.tsx`
- `/Users/armanisadeghi/code/matrx-frontend/features/settings/registry.ts`
- `/Users/armanisadeghi/code/matrx-frontend/package.json`
- `/Users/armanisadeghi/code/matrx-frontend/.gitignore`

**Existing reference files (read, do not modify):**
- `/Users/armanisadeghi/code/matrx-frontend/lib/sync/persistence/idb.ts` — pattern reference
- `/Users/armanisadeghi/code/matrx-frontend/lib/sync/channel.ts` — used as-is for cross-tab BC
- `/Users/armanisadeghi/code/matrx-frontend/app/(authenticated)/(admin-auth)/administration/server-cache/page.tsx` — sibling admin route template

**New files to create (all under matrx-frontend):**
- `features/files/cache/blob-lru.ts`
- `features/files/cache/idb-store.ts`
- `features/files/cache/policy.ts`
- `features/files/cache/keys.ts`
- `features/files/cache/types.ts`
- `features/files/cache/invalidate.ts`
- `features/files/cache/expiry-wheel.ts` (relocate)
- `features/files/cache/register-service-worker.ts`
- `features/files/cache/sw-client.ts`
- `features/files/cache/service-worker/src/sw.ts`
- `features/files/cache/service-worker/build-sw.ts`
- `scripts/copy-pdfjs-worker.mjs`
- `app/(authenticated)/(admin-auth)/administration/blob-cache/layout.tsx`
- `app/(authenticated)/(admin-auth)/administration/blob-cache/page.tsx`
- `app/(authenticated)/(admin-auth)/administration/blob-cache/_components/L1Inspector.tsx`
- `app/(authenticated)/(admin-auth)/administration/blob-cache/_components/L2Inspector.tsx`
- `app/(authenticated)/(admin-auth)/administration/blob-cache/_components/SwStatus.tsx`
- `app/(authenticated)/(admin-auth)/administration/blob-cache/_components/BroadcastInspector.tsx`
- `app/(authenticated)/(admin-auth)/administration/blob-cache/_components/CachePolicyForm.tsx`
- `app/(authenticated)/(admin-auth)/administration/blob-cache/_components/SessionToggle.tsx`

**Build-time artifacts (not checked in):**
- `public/blob-sw.js`
- `public/pdfjs-worker.min.mjs`
