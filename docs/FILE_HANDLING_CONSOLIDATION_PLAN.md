# File Handling Consolidation Plan

**Status:** proposed — for review
**Date:** 2026-05-13
**Branch:** `docs/file-handling-consolidation-plan`
**Owner:** files / file-handler refactor

> Single-system, single-direction. Every file (image, PDF, audio, video, document) flows through one pipeline with one cache stack, one API client, and one set of hooks. Anything else gets deleted.

---

## TL;DR

- Two feature dirs (`features/file-handler/` + `features/files/`, **203 files combined**) collapse into **one** `features/files/` directory.
- Public surface is **5 hooks + 1 facade + 3 components**. Nothing else.
- Read pipeline gets a **4-tier cache** (Redux → in-memory blob LRU → IndexedDB → network). Large PDFs / video / audio bytes opt-in to IndexedDB persistence with ETag validation, 2 GB cap, cleared on sign-out.
- Python API collapses from **46 endpoints / 52 client functions** to **~10 endpoints / 7 client functions**, organized around "give me everything I need in one call."
- No Next.js hops. Browser ↔ Python ↔ S3 only. Two legacy Next routes survive (PDF compress, image-studio process) only because they do CPU work, never byte storage.
- **6+ L0 bypasses** still exist today (`useAiImageUrl`, `taskService`, RAG library/data-stores upload, `useSignedUrl`, `ImageAssetUploader` dual-path, audio fallback signed-URL). Phase 1 deletes them.

---

## Part 1 — Current state inventory

### 1.1 The two directories

| Dir | Files | Role today |
|---|---|---|
| `features/file-handler/` | 22 | New universal facade. `fileHandler.use(source).as(target)` + 7 hooks. Scaffolded 2026-05-07. **Partially adopted.** |
| `features/files/` | 181 | Cloud-files data layer. 52 API fns, Redux slice, realtime, 11 specialized previewers, upload guard, virtual sources, surfaces. **Source of truth.** |

The boundary is fuzzy by design (handler is supposed to be a thin facade), but in practice every consumer must learn which dir to import from. **Decision: collapse into `features/files/`** (handler folds in as an internal layer).

### 1.2 By abstraction level — read paths

**L0 — direct fetchers (must shrink to 0 outside the resolver):**

| Path | What it does | Status |
|---|---|---|
| [features/file-handler/intelligence/refresh.ts](features/file-handler/intelligence/refresh.ts) | Re-mints signed URLs | ✅ keep (internal) |
| [features/file-handler/resolver.ts](features/file-handler/resolver.ts) | The one resolver | ✅ keep (internal) |
| [features/files/utils/resolveRenderableImageUrl.ts](features/files/utils/resolveRenderableImageUrl.ts) | Cached signed-URL helper | 🗑 fold into resolver |
| [features/files/hooks/useSignedUrl.ts](features/files/hooks/useSignedUrl.ts) | Legacy expiry-aware URL hook | 🗑 delete (→ `useFileSrc`) |
| [features/files/redux/thunks.ts](features/files/redux/thunks.ts) `getSignedUrl` callers | Thunk-level URL resolution | 🗑 reroute through resolver |
| [features/agents/hooks/useAiImageUrl.ts](features/agents/hooks/useAiImageUrl.ts) | UUID-from-path → signed URL for agent icon | 🗑 delete (→ `useFileSrc({kind:"s3_path",path})`) |
| [features/audio/services/audioFallbackUpload.ts](features/audio/services/audioFallbackUpload.ts) | Audio fallback signed-URL fetch | 🗑 reroute |
| [features/tasks/services/taskService.ts](features/tasks/services/taskService.ts) | Task attachment URL fetch | 🗑 reroute |
| [features/resource-manager/resource-picker/FilesResourcePicker.tsx](features/resource-manager/resource-picker/FilesResourcePicker.tsx) | Picker-time signed URL | 🗑 wrap in hook |

**L1 — hooks (the canonical layer):**

| Hook | File | Verdict |
|---|---|---|
| `useFile` | file-handler/hooks/useFile.ts | ✅ keep (returns `NormalizedFile`) |
| `useFileSrc` | file-handler/hooks/useFileSrc.ts | ✅ keep (URL for `<img>/<video>/<audio>`) |
| `useFileBlob` | file-handler/hooks/useFileBlob.ts | ✅ keep (bytes — wire IDB cache here) |
| `useFileDownloadUrl` | file-handler/hooks/useFileDownloadUrl.ts | 🔀 fold into `useFileSrc` (`{ kind:"download" }`) |
| `useFileMediaBlock` | file-handler/hooks/useFileMediaBlock.ts | 🔀 fold into `useFileAs` |
| `useFileAs` | file-handler/hooks/useFileAs.ts | ✅ keep (generic target) |
| `useFileUpload` (handler) | file-handler/hooks/useFileUpload.ts | ✅ keep |
| `useFileAsset` | files/hooks/useFileAsset.ts | 🗑 delete (→ `useFile` returns Asset envelope) |
| `useFileBlob` (files) | files/hooks/useFileBlob.ts | 🗑 delete (dup of handler hook) |
| `useFileDocument` | files/hooks/useFileDocument.ts | 🔀 fold into `useFileBlob` |
| `useSignedUrl` | files/hooks/useSignedUrl.ts | 🗑 delete |
| `useGuardedFileUpload` | files/hooks/useGuardedFileUpload.ts | 🔀 fold into `useFileUpload` (guard is opt-out) |
| `useFileUploadWithStorage` | components/ui/file-upload/useFileUploadWithStorage.ts | 🗑 delete |
| `usePasteImageUpload` | components/ui/file-upload/usePasteImageUpload.ts | 🗑 delete (→ `useFileUpload` + `{kind:"file"}`) |

**L2 — components (consume L1 only):**

| Cluster | Count | Status |
|---|---|---|
| `features/files/components/core/FilePreview/*` (PDF/Audio/Image/Video/Code/Text/Data/Svg/Generic previewers) | 11 | ✅ keep; ensure each imports `useFileBlob`/`useFileSrc` only |
| `features/files/components/core/MediaThumbnail/` | 1 | ✅ keep |
| `components/image/cloud/*`, `components/image/shared/*` | ~8 | 🔀 audit; many can be deleted in favor of `<FilePreview>` |
| `features/image-manager/components/*` | ~5 | ✅ keep, ensure no direct fetches |
| `features/rag/components/documents/*`, `features/rag/components/library/*` | ~6 | ✅ keep (composes `<FilePreview>`) |
| `features/pdf-extractor/**` | ~7 | ✅ keep |
| `features/file-analysis/**`, `features/code/editor/BinaryFile*.tsx` | ~5 | ✅ keep |
| `features/whatsapp-clone/**`, agent message displays, chat input previews | ~10 | ✅ keep |

### 1.3 By abstraction level — write paths

**L0 — direct write calls:**

| Function | File | Endpoint | Verdict |
|---|---|---|---|
| `uploadFile`, `uploadFileWithProgress` | features/files/api/files.ts | POST `/files/upload` | 🔀 fold into v2 `POST /v2/files` |
| `uploadAsset`, `uploadAssetWithProgress` | features/files/api/assets.ts | POST `/assets` | 🔀 fold into v2 |
| `patchFile`, `patchFileReplaceMetadata` | features/files/api/files.ts | PATCH `/files/{id}` | 🔀 fold into v2 `PATCH /v2/files/{id}` |
| `renameFile` | files.ts | POST `/files/{id}/rename` | 🔀 fold into PATCH |
| `copyFile` | files.ts | POST `/files/{id}/copy` | 🔀 fold into PATCH |
| `restoreFile` | files.ts | POST `/files/{id}/restore` | 🔀 fold into PATCH |
| `deleteFile` | files.ts | DELETE `/files/{id}` | ✅ keep |
| `bulkDeleteFiles`, `bulkMoveFiles` | files.ts | `/files/bulk*` | 🔀 fold into `POST /v2/files/bulk` |
| `createFileShareLink`, `createFolderShareLink`, `deactivateShareLink` | share-links.ts | `/files/.../share-links` | 🔀 share is a field on PATCH/POST |
| `grantFilePermission`, `revokeFilePermission` (×2 for folders) | permissions.ts | `/files/.../permissions` | 🔀 permissions are a field on PATCH |
| `patchAsset`, `addAssetVariants` | assets.ts | `/assets/{id}*` | 🔀 fold |
| `createFolder`, `patchFolder`, `deleteFolder`, `bulkMoveFolders` | folders.ts | `/folders*` | 🔀 fold (folder is a file with mime `folder`) |
| RAG `LibraryPage` direct `uploadFile()` | features/rag/components/library/LibraryPage.tsx:56 | POST `/files/upload` | 🗑 reroute through `useFileUpload` |
| RAG `DataStoresPage` direct `uploadFile()` | features/rag/components/data-stores/DataStoresPage.tsx:59 | POST `/files/upload` | 🗑 reroute |
| `ImageAssetUploader` dual-path | components/official/ImageAssetUploader.tsx:44+48 | both `/assets` and `/files/upload` | 🗑 unify on `useFileUpload({variants:[...]})` |
| `ImageUploadField` | components/ui/file-upload/ImageUploadField.tsx | POST `/assets` | 🗑 reroute |
| `save-edited-image` | features/image-studio/modes/shared/save-edited-image.ts | PATCH `/assets/{id}` | 🗑 reroute through `useFileMutation` |

**L1 — write hooks:**

| Hook | Status |
|---|---|
| `useFileUpload` (handler) | ✅ keep — sole write entry |
| `useGuardedFileUpload` (files) | 🔀 guard logic merges in; `useFileUpload({ guard: true })` |
| `useFileUploadWithStorage`, `usePasteImageUpload` | 🗑 delete |
| `uploadFiles` thunk | 🔀 keep as thunk underneath `useFileUpload` for non-React callers |

**L2 — write components:**

| Component | Status |
|---|---|
| `<FileUploadDropzone>` | ✅ keep (composes `useFileUpload`) |
| `<ImageAssetUploader>` | ✅ keep, single internal path |
| `<RenameDialog>`, `<ShareLinkDialog>`, `<PermissionsDialog>`, `<FileContextMenu>`, `<BulkActionsBar>` | ✅ keep; all dispatch through `useFileMutation` |

### 1.4 Python API surface today

**46 endpoints across 7 namespaces**, called by **52 FE client functions** in `features/files/api/*`:

| Namespace | Endpoints | Notes |
|---|---|---|
| `/files/*` | 19 | Core CRUD, upload, download, signed URL, asset envelope, rename/copy/restore, bulk, usage, trash, search |
| `/folders/*` | 5 | Folder CRUD + bulk |
| `/files/{id}/versions/*` | 4 | History + restore |
| `/files/{id}/permissions/*`, `/folders/{id}/permissions/*` | 6 | ACL |
| `/files/groups/*` | 5 | User groups |
| `/files/{id}/share-links/*`, `/share/*` | 7 | Share links (authed + public) |
| `/assets/*` | 5 | Image asset variants |
| Special | 1 | `/files/migrate-guest-to-user` |

**Patterns commonly called together (today, requiring 2+ round-trips):**

- Upload → create share link → toast the link
- Upload → render asset variants → patch metadata with `alt_text`
- Rename → bulk move (same parent change)
- Get metadata → get signed URL → download bytes
- Patch visibility → invalidate blob cache (the FE has to do this manually)
- Restore version → invalidate blob cache
- Grant permission + create share link (often paired)

### 1.5 Caching today

| Tier | Where | Coverage |
|---|---|---|
| Metadata | Redux `cloudFiles.filesById` | ✅ full |
| Signed URLs | `expiry-wheel` + `resolveRenderableImageUrl.ts` | ✅ images, partial coverage elsewhere |
| Bytes (in-memory) | `features/files/hooks/blob-cache.ts` — 250 MB LRU | ✅ session-scoped |
| Bytes (persistent) | **none** | 🗑 missing — biggest user-facing gap |
| Public URLs (CDN) | nothing client-side; relies on Vercel CDN | partial |

A 100 MB PDF is re-fetched on every page reload. That's the headline gap.

### 1.6 Next.js server-side file routes

| Route | Status | Verdict |
|---|---|---|
| `/api/pdf/compress` | live | ✅ keep — CPU work, never touches storage |
| `/api/images/studio/process` | live | ✅ keep — same reason |
| `/api/images/upload`, `/api/images/proxy`, `/api/files/download`, `/api/admin/feedback/images`, `/api/share/[token]/file`, `/api/code-files/upload`, `/api/code-files/download` | deleted 2026-05-07/12 | ✅ stays deleted |

Doctrine: **no Next.js hops for file bytes.** Browser ↔ Python ↔ S3 only.

---

## Part 2 — Target architecture

### 2.1 The 5 hooks + 1 facade + 3 components

Everything in the app uses one of these. Nothing else exists.

#### Hooks (React surface)

```ts
// 1. metadata + capabilities + all URLs in one envelope
const { file, status, error } = useFile(source);
//   file: NormalizedFile { fileId, urls: { src, download, thumbnail, variants }, meta, capabilities, scope }

// 2. URL string for <img>/<video>/<audio>/<a href>
const src = useFileSrc(source);                    // signed URL or CDN URL, auto-refreshed
const dl  = useFileSrc(source, { mode: "download" });

// 3. Bytes — with the 4-tier cache
const { blob, status, progress } = useFileBlob(source);
//   tier 1: Redux metadata    tier 2: in-mem LRU
//   tier 3: IndexedDB         tier 4: network (Python /v2/files/{id}/bytes, range-supported)

// 4. Upload (single file or many) — handles dedup, scope, share, variants, guard
const { upload, uploading, progress } = useFileUpload();
await upload(source, {
  folder: "Reports/Q1",
  visibility: "public",
  share: { permission_level: "read", expires_at: "..." },   // optional — bundled into one round-trip
  variants: ["thumbnail_256", "social_card"],               // optional — image preset variants
  guard: true,                                              // dedup pre-flight (default true)
});

// 5. Mutate — rename, move, delete, restore, share, permissions, metadata
const m = useFileMutation(fileId);
await m.patch({ name?, folder?, visibility?, metadata?, share?, permissions? });   // one call, optimistic + rollback
await m.delete({ hard?: boolean });
await m.restore();
await m.bulk({ ids, op: "move"|"delete"|"restore"|"visibility", ...args });
```

#### Facade (non-React callers — services, thunks, agent prep)

```ts
import { fileHandler } from "@/features/files";

await fileHandler.use(source).as({ kind: "media_block" });
await fileHandler.upload(source, opts);
await fileHandler.mutate(fileId).patch({ ... });
await fileHandler.resolve(source);          // raw NormalizedFile
await fileHandler.refresh(file);            // force signed-URL remint
```

#### Components (UI surface)

```tsx
<FilePreview source={...} />              // dispatches to PDF / Image / Audio / Video / Code / Text / Data / SVG / Generic
<FileUploadDropzone onUploaded={...} />   // drag + paste + picker; composes useFileUpload
<FilePicker open onPick={...} />          // pick existing files; emits FileSource
```

Everything else (`<FileTree>`, `<FileList>`, `<FileActions>`, `<ShareLinkDialog>`, etc.) lives in `features/files/components/` and is internal to the files surface — *not* part of the public-everywhere API. Outside features import the three above and nothing else.

### 2.2 Directory layout (after collapse)

```
features/files/
├── README.md                ← was FEATURE.md (merged)
├── PLAN.md                  ← this doc, after merge
├── index.ts                 ← public exports: 5 hooks, fileHandler, 3 components, types
├── types.ts                 ← single types source
├── errors.ts
│
├── client/                  ← v2 HTTP client (replaces api/*)
│   ├── client.ts            ← auth, request-id, error mapping
│   ├── requests.ts          ← ~7 typed v2 endpoint wrappers
│   └── tus.ts               ← resumable for >100 MB
│
├── state/                   ← Redux (was redux/*)
│   ├── slice.ts
│   ├── selectors.ts
│   ├── thunks.ts
│   ├── realtime.ts
│   ├── request-ledger.ts
│   └── converters.ts
│
├── cache/                   ← NEW — 4-tier cache stack
│   ├── blob-lru.ts          ← in-memory (refactored from hooks/blob-cache.ts)
│   ├── idb-store.ts         ← NEW — IndexedDB persistence
│   ├── cache-policy.ts      ← what gets cached, when, how big
│   └── invalidate.ts        ← cross-tier invalidation
│
├── resolver/                ← was file-handler/{resolver,intelligence,input,output}
│   ├── normalize.ts         ← FileSource → partial NormalizedFile
│   ├── resolve.ts           ← + hydration, access decision, URL minting
│   ├── access.ts
│   ├── expiry-wheel.ts
│   ├── refresh.ts
│   ├── magic-bytes.ts
│   ├── classify.ts
│   ├── prefer-locator.ts
│   └── target.ts            ← NormalizedFile → render output
│
├── upload/                  ← was file-handler/upload + files/upload
│   ├── upload.ts
│   ├── upload-guard.tsx     ← dedup pre-flight dialog
│   ├── duplicate-detect.ts
│   └── checksum.ts
│
├── hooks/                   ← THE 5
│   ├── useFile.ts
│   ├── useFileSrc.ts
│   ├── useFileBlob.ts
│   ├── useFileUpload.ts
│   └── useFileMutation.ts
│
├── handler.ts               ← the fileHandler facade
│
├── components/              ← internal to features/files
│   ├── core/                ← FilePreview, FileTree, FileList, FileIcon, FileMeta,
│   │                          FileActions, FileContextMenu, RenameDialog,
│   │                          ShareLinkDialog, PermissionsDialog, MediaThumbnail,
│   │                          FileUploadDropzone, DuplicateUploadDialog, FileBreadcrumbs
│   ├── surfaces/            ← PageShell, WindowPanelShell, MobileStack,
│   │                          EmbeddedShell, DialogShell, DrawerShell, PreviewPane
│   └── pickers/             ← FilePicker, FolderPicker, SaveAsDialog
│
├── providers/               ← CloudFilesRealtimeProvider, UploadGuardHost
├── virtual-sources/         ← untouched (notes, code, aga-apps, etc. adapters)
├── utils/                   ← format, mime, path, icon-map, file-types, preview-capabilities, url-state
└── for_python/, from_python/    ← contracts (kept verbatim)
```

**Imports outside `features/files/` are restricted by ESLint** to the public surface listed in `index.ts`. Internal-only components are unimportable from outside.

**File count target:** 203 → ~80 (60% reduction). Most of the drop is API client (52 → ~7), legacy hooks (14 → 5), and duplicate previewer/thumbnail components.

### 2.3 Read pipeline (with 4-tier cache)

```
                     ┌──────────────────────────────────────────────────────────────┐
useFileSrc           │                                                              │
useFile      ─────►  │ resolve(FileSource → NormalizedFile)                         │
useFileBlob          │   ├── normalize() — 16 input shapes → partial NormalizedFile │
                     │   ├── hydrate()   — read Redux; fetch metadata if missing    │
                     │   ├── decide()    — access level + visibility + capabilities │
                     │   └── mint()      — signed URL or CDN URL, registered with   │
                     │                     expiry-wheel for auto-refresh            │
                     └──────────────────────────┬───────────────────────────────────┘
                                                │
                                                ▼  (bytes path)
                              ┌────────────────────────────────────┐
                              │  tier 1: Redux filesById (metadata only)
                              │  tier 2: in-memory blob LRU (250 MB session)
                              │  tier 3: IndexedDB (≥1 MB, opt-in mime, 2 GB cap)
                              │  tier 4: network — GET /v2/files/{id}/bytes (range)
                              │           OR direct CDN (public files)
                              └────────────────────────────────────┘
```

**IndexedDB policy (`cache/cache-policy.ts`):**

| Rule | Value |
|---|---|
| Eligible mime types | `application/pdf`, `video/*`, `audio/*`, `application/*spreadsheet*`, `*.docx` |
| Size floor | ≥1 MB (smaller files stay in-memory only) |
| Size cap (per origin) | 2 GB (LRU eviction) |
| TTL | indefinite while logged in; full clear on sign-out |
| Validator | `cld_files.version_number` + `checksum`. Realtime row update bumps version → IDB entry is invalidated by middleware. |
| Eviction | LRU by `lastAccessed`; on quota error, drop the largest stale entries first. |
| Encryption | none for v1 (browser already isolates by origin). Revisit if we ever cache shared/cross-user files. |

**Invalidation triggers:**
- Realtime `cld_files` UPDATE where `version_number` changed → drop bytes (all tiers) for that fileId.
- `useFileMutation.delete()` → drop on success.
- `useFileMutation.patch({ visibility })` → drop signed URL only (bytes stay valid).
- Sign-out → `cache.clearAll()`.

### 2.4 Write pipeline

```
useFileUpload.upload(source, opts)
  │
  ├─ guard? → dedup scan (SHA-256 batch vs Redux filesById) → DuplicateUploadDialog
  │
  ├─ coerce source → File (handles paste, base64, url, blob, etc.)
  ├─ stamp metadata.scope from Redux appContext (org/project/task)
  ├─ ────────────────────────────────────────────────────────────────
  │   ONE round-trip to Python:
  │     POST /v2/files
  │     body: multipart { file, options }
  │     options: {
  │       folder_path?, visibility?, scope?, share?, variants?,
  │       idempotency_key, request_id
  │     }
  │     returns: Asset envelope { file, urls, share?, variants? }
  │ ────────────────────────────────────────────────────────────────
  ├─ optimistic Redux upsert via thunk + request ledger
  ├─ populate in-mem LRU with the bytes we just uploaded (no need to re-fetch)
  └─ return NormalizedFile

useFileMutation(id).patch({...})
  │
  ├─ snapshot current Redux record (for rollback)
  ├─ dispatch optimistic update
  ├─ ONE round-trip: PATCH /v2/files/{id} (rename + move + visibility + metadata + share + permissions all in one body)
  ├─ on success: markFileSaved, drop ledger entry, invalidate-as-needed
  └─ on error: rollback from snapshot
```

### 2.5 What gets deleted

**Hooks (10 files):**
- `features/files/hooks/useSignedUrl.ts`
- `features/files/hooks/useFileAsset.ts`
- `features/files/hooks/useFileBlob.ts` *(duplicate)*
- `features/files/hooks/useFileDocument.ts`
- `features/files/hooks/useGuardedFileUpload.ts` *(folded in)*
- `features/files/utils/resolveRenderableImageUrl.ts`
- `features/file-handler/hooks/useFileDownloadUrl.ts`
- `features/file-handler/hooks/useFileMediaBlock.ts`
- `components/ui/file-upload/useFileUploadWithStorage.ts`
- `components/ui/file-upload/usePasteImageUpload.ts`

**API client (45+ functions):** all of `features/files/api/{assets,share-links,permissions,versions,folders,groups}.ts` collapse into `features/files/client/requests.ts` (~7 functions).

**Other bypassers (3+ files):**
- `features/agents/hooks/useAiImageUrl.ts`
- Direct `Files.uploadFile()` calls in `LibraryPage`, `DataStoresPage`
- Direct signed-URL fetches in `taskService.ts`, `audioFallbackUpload.ts`, `FilesResourcePicker.tsx`

**Doc rename:** `features/file-handler/FEATURE.md` and `features/files/FEATURE.md` merge into `features/files/README.md`.

---

## Part 3 — Ideal Python API surface

**Goal: 46 endpoints → ~10. Combine operations that are always called together. Make the FE talk to Python in one round-trip per user intent.**

### 3.1 The 10 endpoints

| # | Endpoint | Replaces | Purpose |
|---|---|---|---|
| 1 | `GET /v2/files/{id}` | `/files/{id}`, `/files/{id}/url`, `/files/{id}/asset`, `/assets/{id}` | Full Asset envelope: row + thumbnail URL + variant URLs + signed download URL + share state + permissions summary + scope. One call, everything the UI needs. |
| 2 | `GET /v2/files/{id}/bytes` | `/files/{id}/download`, `/files/{id}/versions/{n}/download` | Bytes. Supports `Range:`, `?version=`, `?download=1` (Content-Disposition). |
| 3 | `GET /v2/files` | `/files`, `/files/tree`, `/files/folders`, `/files/trash`, `/files/search`, `/files/groups`, `/files/{id}/versions`, `/files/{id}/permissions`, `/files/{id}/share-links` | Universal list with `?tree=1`, `?folder=`, `?trash=1`, `?q=`, `?versions_of=`, `?permissions_of=`, `?share_links_of=`. Authed reads still prefer supabase-js RPC; this is the canonical fallback + the path for non-RLS-able resources. |
| 4 | `POST /v2/files` | `/files/upload`, `/assets`, `/folders`, `/files/{id}/share-links`, `/files/{id}/permissions`, `/assets/{id}/variants` | **The big one.** Multipart upload + `options` JSON. `options` can include `folder_path` (auto-creates parents), `visibility`, `scope`, `share`, `permissions`, `variants`. Returns full envelope including all bundled side-effects (new share link, granted perms, rendered variants). |
| 5 | `PATCH /v2/files/{id}` | `/files/{id}/rename`, `/files/{id}/copy`, `/files/{id}/restore`, `PATCH /files/{id}`, `PATCH /assets/{id}`, `POST /files/{id}/versions/{n}/restore`, `POST /files/{id}/share-links`, `POST /files/{id}/permissions`, `DELETE /files/share-links/{token}`, `DELETE /files/{id}/permissions/{user}` | Universal mutation. Body: `{ name?, folder?, visibility?, metadata?, restore_version?, restore_from_trash?, copy_to?, share?, share_revoke?, permissions?, permissions_revoke?, variants? }`. Optimistic+rollback friendly. Returns new envelope. |
| 6 | `DELETE /v2/files/{id}` | `/files/{id}`, `/folders/{id}` | Soft delete (default) or hard via `?hard=1`. Folders are files with mime `folder` — same endpoint. |
| 7 | `POST /v2/files/bulk` | `/files/bulk`, `/files/bulk/move`, `/folders/bulk/move` | Bulk operations. Body: `{ ids[], op: "move"\|"delete"\|"restore"\|"visibility"\|"share", ...args }`. Returns per-item status envelope. |
| 8 | `POST /v2/files/tus` | (new) | Resumable upload (TUS Core 1.0.0). Required for files >100 MB. Python already shipped a draft at `/files/upload/tus` per UPDATES.md — promote to v2. |
| 9 | `GET /v2/share/{token}` | `/share/{token}`, `/share/{token}/download` | Resolve. Returns metadata; `?download=1` streams bytes (atomic max_uses decrement). |
| 10 | `GET /v2/me/files` | `/files/usage`, `/files/groups` | User-scoped meta: quota + tier + groups + recent activity. |

### 3.2 Combined operations (call-graph proof)

| FE intent | Today | After |
|---|---|---|
| Upload + share link | 2 calls | 1 call (`POST /v2/files` with `options.share`) |
| Upload + 3 image variants | 2 calls | 1 call (`options.variants`) |
| Upload + grant 2 users + public link | 4 calls | 1 call |
| Rename + move | 2 calls | 1 call (`PATCH` with `name` + `folder`) |
| Change visibility + invalidate FE blob cache | 1 call + manual FE work | 1 call; backend response carries new URL; FE realtime middleware auto-invalidates |
| Get metadata + signed URL + thumbnail | 3 calls | 1 call (`GET /v2/files/{id}` returns all URLs) |
| Restore version + drop blob cache | 1 call + manual FE work | 1 call; realtime version bump triggers FE cache eviction |
| Resolve share + download | 2 calls | 1 call (`GET /v2/share/{token}?download=1`) |
| List folder + load thumbnails | N+1 (one per child) | 1 call (`GET /v2/files?folder=...` returns thumbnail URLs in row data) |

### 3.3 Public vs private URL automation

**Today:** every file render asks Python for a signed URL, even public files; CDN is partial; the FE has to know when to skip signing.

**After:**

- `GET /v2/files/{id}` response always carries the canonical URL the client should use:
  - `visibility = "public"` → permanent CDN URL (Python wires public files to a Vercel CDN bucket; backend request open in REQUESTS.md item 5)
  - `visibility = "private"` or `"shared"` → 7-day signed S3 URL, with `expires_at` so the FE can register with `expiry-wheel`
  - share-link view → bytes route via `/v2/share/{token}?download=1` (no signed-URL leak)
- `urls` block in the envelope:
  ```json
  "urls": {
    "src":       "https://cdn.aimatrx.com/...",      // for <img/video/audio> src
    "download":  "https://server.../v2/files/.../bytes?download=1",
    "thumbnail": "https://cdn.aimatrx.com/thumbs/...",
    "variants":  { "social_card": "...", "thumbnail_256": "..." }
  }
  ```
- FE never has to decide which URL to use — the resolver picks `urls.src` for render, `urls.download` for `<a download>`, etc.

### 3.4 Required arguments per endpoint

All requests carry:
- `Authorization: Bearer ${jwt}` (or anon JWT for guest users)
- `X-Request-Id: ${uuid}` — required; echoed in realtime payloads for dedup
- `X-Idempotency-Key: ${uuid}` — required on `POST /v2/files` (re-uploads of the same file dedup)

`POST /v2/files` body (multipart):
- `file` — bytes (required unless `?ref=` to copy from existing)
- `options` — JSON blob:
  ```ts
  {
    folder_path?: string;         // "Reports/Q1" — auto-creates intermediates
    visibility?: "private" | "shared" | "public";
    scope?: { organization_id?: string; project_id?: string; task_id?: string };
    share?: { permission_level: "read" | "write"; expires_at?: ISO8601; max_uses?: number };
    permissions?: Array<{ grantee_id: string; grantee_type: "user"|"group"; permission_level: "read"|"write"|"admin"; expires_at?: ISO8601 }>;
    variants?: Array<string>;     // preset keys: "thumbnail_256", "social_card", ...
    metadata?: Record<string, unknown>;
    name_override?: string;
    overwrite_existing?: boolean;
  }
  ```

`PATCH /v2/files/{id}` body:
- Any subset of the same fields. Server applies atomically; failure of any sub-op rolls back the whole call.

### 3.5 Backend asks for the Python team

These are required for this plan; most are already requested in `features/files/for_python/REQUESTS.md`:

1. **Promote `/v2` endpoints alongside `/v1`** — running side-by-side during migration. (new)
2. **Bundled `options` blob on `POST /v2/files`** — accepts share, permissions, variants in one call. (new — extends current REQUESTS items 14, 7)
3. **Permanent CDN URLs for `visibility=public`** — REQUESTS item 5.
4. **Full Asset envelope on `GET /v2/files/{id}`** — already shipped via `/files/{id}/asset` per Bundle D; needs to become the default. (extends Bundle D)
5. **`X-Request-Id` echo in realtime** — REQUESTS item 9 (already shipped Bundle B).
6. **Tree privacy fix** — REQUESTS item 0a (shipped Bundle A).
7. **Range download on `/v2/files/{id}/bytes`** — shipped Bundle D; needs promotion to v2.
8. **TUS at `/v2/files/tus`** — already at `/files/upload/tus` (Bundle E2); promote.
9. **Universal `PATCH /v2/files/{id}`** — combined mutation in a single transaction. (new)
10. **Bulk endpoint with mixed ops** — `POST /v2/files/bulk` taking `op` discriminator. (new)
11. **Webhooks/SSE for storage events** — REQUESTS item 10 (optional, helps with cache invalidation when realtime is too noisy).

---

## Part 4 — Roadmap

Five phases. Each phase ships behind nothing — the changes are non-breaking until phase 4 (delete).

### Phase 0 — Lock the chokepoint (1 day)

**Goal:** make it impossible to add new bypasses while the migration is in flight.

- Tighten ESLint:
  - ban imports of `useSignedUrl`, `useFileAsset`, `useFileDocument`, `useFileUploadWithStorage`, `usePasteImageUpload`, `useAiImageUrl` outside `features/files/`
  - ban direct calls to `features/files/api/*.ts` outside `features/files/client/`
  - keep existing ban on `supabase.storage.*` and direct `MediaBlock` construction
- Add a `features/files/index.ts` with **only** the 5 hooks + facade + 3 components exported. Mark everything else internal.

**Deliverable:** PR that blocks new bypasses but changes no runtime behavior.

### Phase 1 — Migrate bypasses (2-3 days)

Order by call-site count, smallest to largest so we get fast wins:

1. `features/agents/hooks/useAiImageUrl.ts` — 1 caller. Replace with `useFileSrc({kind:"s3_path",path})`. Delete the hook.
2. `features/audio/services/audioFallbackUpload.ts` — reroute through `fileHandler`.
3. `features/tasks/services/taskService.ts` — reroute. Delete legacy attachments shim.
4. `features/resource-manager/resource-picker/FilesResourcePicker.tsx` — wrap in `useFile`.
5. `features/rag/components/library/LibraryPage.tsx:56` and `data-stores/DataStoresPage.tsx:59` — replace `uploadFile()` with `useFileUpload`.
6. `components/official/ImageAssetUploader.tsx` — unify on `useFileUpload({ variants })`.
7. `components/ui/file-upload/ImageUploadField.tsx` — reroute.
8. `features/image-studio/modes/shared/save-edited-image.ts` — reroute via `useFileMutation`.
9. Delete `useSignedUrl`, `useFileAsset`, `useFileDocument`, `useFileUploadWithStorage`, `usePasteImageUpload`, `resolveRenderableImageUrl.ts`. Each deletion lands in its own PR with a `git grep` proof of zero references.

**Deliverable:** every L0 read/write call goes through `fileHandler` or one of the 5 hooks. ESLint passes with no exceptions.

### Phase 2 — IndexedDB persistence (2 days)

- Add `features/files/cache/idb-store.ts` — `idb-keyval` or a thin custom wrapper around the IDB API. Schema: `{ fileId, version, mimeType, bytes (Blob), size, lastAccessed }`.
- Add `features/files/cache/cache-policy.ts` — encodes the rules from §2.3.
- Wire `useFileBlob` to try Redux → in-mem LRU → IDB → network in order.
- Wire realtime middleware to drop IDB entries when `version_number` changes (`features/files/state/realtime.ts`).
- Wire `signOut` action to call `cache.clearAll()`.
- Add a tiny IDB usage indicator in the file-manager UI for QA (debug-only).

**Deliverable:** opening the same 100 MB PDF twice = one network fetch. Verified in DevTools → Network → second load shows `(disk cache)` / size 0.

### Phase 3 — v2 Python API adoption (depends on backend)

Coordinated with the Python team via `for_python/REQUESTS.md`. As each v2 endpoint lands:

1. Add the wrapper to `features/files/client/requests.ts`.
2. Switch the resolver + upload + mutation pipelines to call v2.
3. Delete the v1 wrapper. Delete the now-unused namespaced client files (`assets.ts`, `share-links.ts`, etc.) one at a time.

Order of adoption (lowest risk first):
- `GET /v2/files/{id}` (additive)
- `GET /v2/files/{id}/bytes` (range support unblocks video scrubbing)
- `POST /v2/files` with `options` (kills the upload+share double-call)
- `PATCH /v2/files/{id}` (kills rename+move double-call)
- `POST /v2/files/bulk`
- `GET /v2/share/{token}`
- TUS

**Deliverable:** 46 endpoints → ~10. FE client: 52 functions → ~7.

### Phase 4 — Collapse directories (1 day)

- `git mv features/file-handler/* features/files/<target>/`
- Update every import in the repo (codemod via `eslint --fix` with a custom rule, or `jscodeshift`).
- Merge `features/file-handler/FEATURE.md` + `features/files/FEATURE.md` → `features/files/README.md`.
- Delete `features/file-handler/`.
- Update CLAUDE.md references.

**Deliverable:** one directory, one doc, one mental model.

### Phase 5 — Decommission (ongoing)

- Delete `app/api/pdf/compress` and `app/api/images/studio/process` if/when the Python team moves these to backend services. Until then, keep — they don't touch storage.
- Delete `components/ui/file-upload/*` shim (the remaining wrappers after Phase 1).
- Audit `components/image/cloud/*` and `components/image/shared/*` — most should be deletable once consumers use `<FilePreview>` directly.

---

## Part 5 — Open questions

Resolve before Phase 1 starts:

1. **Backwards-compat shims during Phase 1?** Default: no — every deletion is a hard cut behind one PR. Confirm.
2. **Anonymous users in the v2 envelope** — does `GET /v2/files/{id}` return the same shape for anon JWTs, or a restricted projection? Recommendation: same shape, RLS filters fields.
3. **Should `<FilePreview>` accept a `FileSource` directly, or always a `fileId`?** Recommendation: `FileSource` — matches the resolver everywhere else.
4. **IDB encryption for shared/cross-org files** — defer to v2 of caching; v1 trusts origin isolation.
5. **What happens to `features/file-handler/handler.ts` `toMediaBlock`/`toContentPart`/`toMediaRef` convenience methods?** Recommendation: keep on the facade; they're zero-cost and used by streaming + agent prep.

---

## Appendix — Quick reference

### Public surface after consolidation

```ts
// hooks
import { useFile, useFileSrc, useFileBlob, useFileUpload, useFileMutation } from "@/features/files";

// facade (non-React)
import { fileHandler } from "@/features/files";

// components
import { FilePreview, FileUploadDropzone, FilePicker } from "@/features/files";

// types
import type { FileSource, FileTarget, NormalizedFile, UploadOpts } from "@/features/files";
```

### Forbidden everywhere outside `features/files/`

- `supabase.storage.*`
- Direct `fetch` of `/files/`, `/assets/`, `/share/`, `/api/files/`, `/api/share/`
- Imports from `features/files/api/*`, `features/files/state/*`, `features/files/client/*`, `features/files/resolver/*`, `features/files/cache/*`
- Manual `<img src="...signed-url...">` construction
- Hand-built `ImageBlock | AudioBlock | VideoBlock | DocumentBlock` literals
- New Redux slices for files (extend `cloudFiles`)
- New file-related Next.js API routes (browser ↔ Python only)

### File-count budget

| Layer | Files today | Target | Notes |
|---|---|---|---|
| Hooks (handler + files) | 14 | 5 | the canonical surface |
| API client | ~12 files / 52 fns | 2 files / ~7 fns | v2 endpoints |
| Redux state | 8 | 6 | small tighten |
| Resolver + intelligence | 8 | 8 | unchanged (just relocates) |
| Cache | 1 | 4 | NEW: IDB + policy |
| Upload | 5 | 4 | merged guards |
| Components | ~80 | ~50 | dedup image/* + previewer cleanup |
| Virtual sources | 7 | 7 | unchanged |
| Providers/utils/types/errors/docs | ~15 | ~12 | small tighten |
| **Total** | **~150–200** | **~80** | one directory |

---

**Approval checklist before kickoff:**

- [ ] Plan reviewed & agreed
- [ ] Python team confirms `/v2` namespace + bundled `options` on upload
- [ ] CLAUDE.md updated to point at this doc as the live plan
- [ ] Phase 0 PR opened (ESLint lock + public index.ts)
