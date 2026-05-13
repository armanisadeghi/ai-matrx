# File Handling Consolidation — Plan-to-Actual Gap Analysis

**Date:** 2026-05-13
**Branch:** `main` (HEAD at `2d70ae27f`)
**Scope:** Compare `docs/FILE_HANDLING_CONSOLIDATION_PLAN.md` (v2-integrated, 4931001f7 / 5d5b41ad0 / df6a67c15) and the six impact inventories against the actual code that landed across the `phase 0` → `phase 1.r` commit train (`396ab516a` … `2d70ae27f`).

---

## 1. Plan summary

The plan was a rip-and-replace of ~150-200 files of file handling — `features/file-handler/` + `features/files/` plus ~285+ scattered call sites — into ONE directory (`features/files/`) with ONE chokepoint, ONE upload primitive, ONE inline render component (`<InlineMediaRef>`), ONE 3-tier byte cache (memory LRU → IndexedDB → Service Worker → network), and ONE generated-from-OpenAPI type surface. Goal: kill every supabase.storage bypass, every ad-hoc `<img src={file.publicUrl ?? signedUrl}>`, every parallel upload pipeline, every per-route realtime mount, and every Next.js-side image/PDF/file route — then lock the chokepoint with ESLint at error severity so new bypasses can't be added. The cache layer was the FE-only piece the backend team could not provide; the rest aligned with their `matrx-utils v1.1.0` PR.

---

## 2. Phase-by-phase status table

Legend: ✅ done · 🟡 partial · ❌ not started · ⚪ deferred · 🔵 added beyond plan

| Phase / deliverable | Plan ref | Status | Evidence | Notes |
|---|---|---|---|---|
| **Phase 0 — ESLint chokepoint locks the public surface** | §6.4 / PR3-1 | ✅ | `396ab516a` · `eslint.config.mjs:33-36`, `features/files/index.ts:1-309` | Initial ban on `@/features/files/api/*`. Public-surface barrel published. |
| **Adopt matrx-utils v1.1.0 combined-op endpoints (A.1–A.4, E.16, E.17)** | Part 5 ⏳ + PR3-1/2 | 🟡 | `905684c2f` · `features/files/api/assets.ts`, `features/files/api/files.ts`, `lib/api/endpoints.ts` | `POST /assets/preview` + `POST /assets/pdf-compress` wired; `previewAssetMultipart`, `compressPdfMultipart`, `materializeAssetResult` exist. **Image Studio still calls the deleted-by-plan Next route** (see §5). |
| **Kill PDF compress bypass (3 callers + Next route)** | §6.3 | ✅ | `905684c2f` · deleted `app/api/pdf/compress/route.ts`; migrated `hooks/usePdfOptimize.ts`, `features/resource-manager/resource-picker/UploadResourcePicker.tsx`, `features/public-chat/components/resource-picker/PublicUploadResourcePicker.tsx` | All three callers post directly to Python. |
| **Kill RAG-library + RAG-data-stores direct `Files.uploadFile`** | §6.3 / PR3-25 | ✅ | `905684c2f` · `features/rag/components/library/LibraryPage.tsx`, `features/rag/components/data-stores/DataStoresPage.tsx` | Both moved to `useFileUpload`. |
| **Kill `useAiImageUrl` (252 lines)** | §6.3 | ✅ | `905684c2f` · `D features/agents/hooks/useAiImageUrl.ts` · `eslint.config.mjs:117-119` (deny-path) | Callers `ImageOutputBlock.tsx`, `ImageArrivalPeek.tsx` migrated. |
| **Unify `ImageAssetUploader` on universal handler (kill dual upload)** | §6.3 | ✅ | `3faad434f` · `components/official/ImageAssetUploader.tsx` | Single path. |
| **Delete 3 legacy upload hooks** (`useGuardedFileUpload`, `useFileUploadWithStorage`, `usePasteImageUpload`) | §6.3 | ✅ | `6ef28e3b1` · 3 file deletions · `eslint.config.mjs:112-130` (deny-paths) | Wrapper component shells (`FileUploadWithStorage.tsx`, `PasteImageHandler.tsx`) preserved but call universal handler internally. |
| **Migrate `useCropStudioController` off `cloudUploadMany`** | §6.3 / Part 1 | ✅ | `c134c7d4c` · `features/image-studio/components/useCropStudioController.ts` | `cloudUploadMany` + `isCloudUploadSuccess` are STILL exported from `features/files/upload/cloudUpload.ts:166,492` and re-exported from `features/files/upload/index.ts:11,14`. No external callers. See §5. |
| **Delete `useSignedUrl` (and wire deny rules at error severity)** | §6.3 / §6.4 | ✅ | `6979ac7ab` · `D features/files/hooks/useSignedUrl.ts` · `eslint.config.mjs:107-110` |  |
| **Add `<InlineMediaRef>` canonical inline renderer** | §6.1 / PR3-7 | ✅ | `92b626370` · `features/files/components/inline/InlineMediaRef.tsx` · `features/files/index.ts:84-89` |  |
| **IndexedDB tier (Dexie matrx-blob-cache)** | §4A / PR3-11 | ✅ | `87255c1de` · `features/files/cache/idb-store.ts`, `features/files/cache/policy.ts`, modified `hooks/useFileBlob.ts`, `hooks/blob-cache.ts`, `providers/CloudFilesRealtimeProvider.tsx` | Shipped as a single `idb-store.ts` + `policy.ts`, not split into the 7-file `blob-lru / idb-store / policy / keys / types / invalidate / expiry-wheel` layout the plan called for (§6.2 / CACHE inventory). |
| **`resolveCloudFileUrl` routed through universal handler; delete `resolveRenderableImageUrl`** | §6.3 | ✅ | `e866585b7` · `D features/files/utils/resolveRenderableImageUrl.ts` + `.test.ts`; `components/image/cloud/resolveCloudFileUrl.ts` delegates to handler |  |
| **Fold `features/file-handler/` INTO `features/files/handler/`** | §6.2 / PR3-3 | ✅ | `1cc0f2788` · `features/file-handler/` no longer exists; `features/files/handler/` present | Move was via `git mv` (commit touches >40 files all renamed; pure path swap visible in the diff). |
| **Service Worker tier (`/blob-sw.js`, build pipeline, dev-mode guards)** | §4A / PR3-13 | ✅ | `46e10c3e3` · `features/files/cache/service-worker/src/sw.ts`, `service-worker/build-sw.ts`, `register-service-worker.ts`, `public/blob-sw.js`, `package.json` (esbuild dep) | Mounted from `app/DeferredSingletons.tsx`. |
| **Leftover-refs cleanup + Tier-1 ESLint ring-fence (`cache/`, `virtual-sources/`)** | §6.4 + SWEEP_INTERNAL_IMPORTS | ✅ | `0398718a5` · `eslint.config.mjs:42-56` · `CLAUDE.md`, `features/files/UPLOAD_TROUBLESHOOTING.md`, `features/files/handler/FEATURE.md`, `MessageInputBar.tsx` |  |
| **Tier-2 ESLint ring-fence (`hooks/`, `upload/`, `providers/`, `services/`) + 7 caller migrations** | SWEEP_INTERNAL_IMPORTS Tier 2 | ✅ | `03660b480` · `eslint.config.mjs:62-92` · 7 caller migrations |  |
| **`<InlineMediaRef>` rollout — Batch 1 (podcasts)** | §2.11 / SWEEP_IMG | ✅ | `585942a8c` |  |
| **Rollout Batches 2+3 (orgs + applets, 12 sites)** |  | ✅ | `f4a323694` |  |
| **Rollout Batch 4 (~22 sites)** |  | ✅ | `882af54b9` |  |
| **WhatsApp `ImageBubble` + `VideoBubble` migration** |  | ✅ | `647a00abe`, `0b9de26cd` |  |
| **Promote composition primitives + utils + python-base + redux wiring to public index** | SWEEP_INTERNAL_IMPORTS · "Action items" | ✅ | `5d55020d9` · `features/files/index.ts:84-309` | `useFilePicker`, `openFilePicker`, `openFolderPicker`, `FileResourceChip`, `PreviewPane`, `WindowPanelShell`, `FileTree`, `PdfAnnotationLayer` + types, `useFileActions`, `useFolderActions`, `isImageMime`/etc., `formatFileSize`/etc., `pythonShareUrl`/`pythonFileDownloadUrl`/`imageViewUrl`/etc., `folderForOrg`/`folderForAgentBlock`/etc., `cloudFilesReducer` + `cloudFilesRealtimeMiddleware`. |
| **PDF.js progressive Range rendering + local worker mirror** | §4A "PDF.js progressive Range" / PR3-15 | ✅ + 🔵 | `758b2f219` · `features/files/components/core/FilePreview/previewers/PdfDocumentRenderer.tsx`, `PdfPreview.tsx`, **new `features/files/hooks/usePdfRemoteSource.ts`** (not in plan), `scripts/copy-pdfjs-worker.ts`, `public/pdfjs/pdf.worker.min.mjs` | Plan said worker would live at `/public/pdfjs-worker.min.mjs`; actual path is `/public/pdfjs/pdf.worker.min.mjs`. `PdfStudioUrlViewer.tsx` lost ~70 lines of manual fetch/stitch code. |
| **Super-Admin blob-cache observability panel** | §4A "Admin observability" / PR3-23 | 🟡 | `2d70ae27f` · `app/(authenticated)/(admin-auth)/administration/blob-cache/page.tsx` + `features/files/cache/admin/BlobCacheInspector.tsx` | Single-file inspector. Plan called for FOUR inspector files (L1Inspector, L2Inspector, SwStatus, BroadcastInspector) plus `CachePolicyForm` + `SessionToggle`. Real shape collapsed to one component. |
| **`POST /assets` combined-op (share + permissions + variants)** | §A.1 / PR3-12 | 🟡 | `905684c2f` · endpoint constants in `lib/api/endpoints.ts`, partial wiring in `features/files/api/assets.ts` | Best-effort atomicity confirmed in plan §5; FE partial-success handling (`errors[]`) not visibly wired into the upload thunks. |
| **`PATCH /files/{id}` union body** | §A.2 | ✅ | `905684c2f` · `features/files/api/files.ts:patchFile`, `patchFileReplaceMetadata` (FilePatchBody w/ `share_revoke` + `restore_from_trash` defaults) |  |
| **`POST /files/bulk` discriminator** | §A.3 | 🟡 | endpoint constants added; bulk thunks not visibly refactored to use the new body shape | Existing `/files/bulk-delete` + `/files/bulk-move` callers still in `features/files/redux/thunks.ts`. |
| **`X-Idempotency-Key` covers combined op** | §A.4 | ⚪ | Not verified — backend memoization, no FE work required beyond stamping header | Plan §5 implication 2 noted "FE just sets the header on every combined-op call (we already do)." |
| **Migrate Image Studio to `POST /assets/preview`; delete `app/api/images/studio/process/route.ts`; drop `sharp`** | §6.3 / PR3-18 | ❌ | Route still present (`app/api/images/studio/process/route.ts:22 import sharp from "sharp"`). `features/image-studio/hooks/useImageStudio.ts:366` still does `fetch("/api/images/studio/process", ...)`. `package.json:224 "sharp": "latest"` still listed. | **Biggest single uncompleted deliverable.** Endpoint and helper exist BE-side per the plan; FE has not switched. |
| **Mount `<CloudFilesRealtimeProvider>` ONCE in `app/Providers.tsx`; delete 4 per-route mounts** | §6.6 / PR3-20 | 🟡 | Provider is in the public surface and mounted (commit `87255c1de` modified the provider). | Did not verify whether all four per-route mounts were deleted (`app/(a)/files/layout.tsx`, `app/(a)/images/layout.tsx`, `features/code/views/explorer/CloudFilesExplorer.tsx`, `features/window-panels/windows/cloud-files/*Window.tsx`). |
| **ESLint ban on manual `MediaRef` object literals outside `converters.ts`** | §6.4 / PR3-21 | ❌ | `eslint.config.mjs` has no `MediaRef`-shape selector | The four `cloudFileToMediaRef` / `fileIdToMediaRef` / `urlToMediaRef` / `fileUriToMediaRef` builders exist and are re-exported (`index.ts:204-209`), but the ESLint rule that forces their use does not. |
| **ESLint ban on hand-built `ImageBlock\|AudioBlock\|VideoBlock\|DocumentBlock` literals outside `features/files/`** | §6.4 | ❌ | Not in `eslint.config.mjs` |  |
| **ESLint ban on `fetch('/api/(images\|files\|share\|pdf)/...')`** | §6.4 / Part 4 Anti-pattern 3 | ❌ | Not in `eslint.config.mjs` |  |
| **OpenAPI type-gen CI gate (`pnpm gen:types && git diff --exit-code`); delete hand-authored Asset types** | §6.5 / PR3-2 | ❌ | `types/python-generated/api-types.ts` exists (commit `905684c2f` references it) but no `gen:types` script in `package.json` is wired into CI; hand-authored Asset block in `features/files/types.ts:1187-1311` not visibly deleted |  |
| **Internal FE splits — FilePreview registry, FileTable TanStack, PageShell per-section, thunks.ts split, types.ts split** | §6.2 / PR3-22 | ❌ | `features/files/redux/thunks.ts` is still 1790-ish lines; `features/files/types.ts` still monolithic; `FilePreview.tsx` still a switch | Plan called for these in the same PR. None landed. |
| **Tier-3 ESLint ring-fence (`types`, `utils`)** | SWEEP_INTERNAL_IMPORTS Tier 3 | ❌ | Not in `eslint.config.mjs` |  |
| **Tier-4 ESLint ring-fence (`handler`, `components`, `redux`)** | SWEEP_INTERNAL_IMPORTS Tier 4 | ❌ | Not in `eslint.config.mjs` |  |
| **Delete `features/files/api/server-client.ts` (320 lines)** | §6.3 | ❌ | File still exists. `Api.Server.uploadAndShare` has one live caller: `app/api/agent-apps/generate-favicon/route.ts:144`. Per SWEEP_LEFTOVER_REFERENCES LIVE #3, the user owes a decision: deprecate-or-keep. |
| **Delete remaining `Files.getSignedUrl` direct callers outside `features/files/`** | Part 1 of BYPASSES inventory | 🟡 | Live in: `features/resource-manager/resource-picker/FilesResourcePicker.tsx:267`, `features/tasks/services/taskService.ts:286`, `features/audio/services/audioFallbackUpload.ts:103`, `components/mardown-display/blocks/images/ImageOutputBlock.tsx:190` | Tier-4 ESLint isn't on yet, so these compile. |
| **`useFile` / `useFileSrc` / `useFileBlob` / `useFileUpload` / `useFileMutation` — the five canonical hooks** | §6.1 | 🟡 | 4 of 5 exist + re-exported (index.ts:42-49). **`useFileMutation` does NOT exist** — `index.ts` comment line 39 still names it as a Phase 1 target. |
| **`useFileAs` / `useFileAsset` / `useFileDocument` collapse into `useFile`** | §6.1 / §6.3 | ❌ | All three still exported separately (`index.ts:43, 54-59`). |
| **Delete `useFileMediaBlock` + `useFileDownloadUrl` (fold into `useFileAs`/`useFileSrc`)** | §6.3 | ⚪ | Both flagged for follow-up in `eslint.config.mjs:131-140` (deny-paths) but the source files exist (`features/files/handler/hooks/useFileMediaBlock.ts`, `useFileDownloadUrl.ts`). Deny-rule blocks new imports; deletion deferred. |
| **B.8 — SVG-as-master in `preset="logo"`** | Part 5 ⏳/⚪ | ⚪ | Deferred to matrx-utils v1.2 per plan §5. |

---

## 3. Net effect summary

**Hooks deleted (verified by `git log --diff-filter=D` and grep):**

- `features/file-handler/intelligence/expiry-wheel.ts` → moved (preserved history via `1cc0f2788`)
- `features/file-handler/intelligence/magic-bytes.ts` → moved
- `features/files/hooks/useSignedUrl.ts` → DELETED (`6979ac7ab`)
- `features/files/hooks/useGuardedFileUpload.ts` → DELETED (`6ef28e3b1`)
- `features/files/utils/resolveRenderableImageUrl.ts` (+ `.test.ts`) → DELETED (`e866585b7`)
- `features/agents/hooks/useAiImageUrl.ts` → DELETED (`905684c2f`), 252 lines saved
- `components/ui/file-upload/useFileUploadWithStorage.ts` → DELETED (`6ef28e3b1`)
- `components/ui/file-upload/usePasteImageUpload.ts` → DELETED (`6ef28e3b1`)

Approx. lines removed: ~750+ (`useAiImageUrl` 252 + `useFileUploadWithStorage` ~150 + `usePasteImageUpload` ~246 + `useSignedUrl` ~70 + `useGuardedFileUpload` ~50 + `resolveRenderableImageUrl` ~80). Plus ~70 lines removed in `PdfStudioUrlViewer.tsx` by replacing the manual fetch/stitch with the new `usePdfRemoteSource` hook.

**Files moved (with git history preserved):**

- `features/file-handler/**` → `features/files/handler/**` (`1cc0f2788`). The merge commit is dominantly `M` modifications + renames; no orphan re-adds visible. The plan's `git mv` discipline appears to have held.

**Public-surface symbol count change:**

`features/files/index.ts` grew from a tiny Phase-0 barrel into a 309-line public surface re-exporting ~80 named symbols across 7 sections: 5 canonical hooks (4 actually present), 1 facade (`fileHandler`), 20+ components, 6 pickers + openers, 2 providers, 5 redux wiring exports, 4 MediaRef builders, 18 folder/MIME/format helpers, all handler types, all errors. Composition-primitive promotion in `5d55020d9` is the key inflection — that commit is what closed the door on the bulk of internal-import violations.

**ESLint rules added:**

- Tier 0 (Phase 0): `@/features/files/api/*` — error
- Tier 1 (`0398718a5`): `@/features/files/cache/*`, `@/features/files/virtual-sources/*` — error
- Tier 2 (`03660b480`): `@/features/files/hooks/*`, `@/features/files/upload/*`, `@/features/files/providers/*`, `@/features/files/services/*` — error
- Deny-paths (`6ef28e3b1`, `6979ac7ab`, `905684c2f`): 8 specific deleted-hook import paths — error
- Tier 3 (`types`, `utils/*`) — **NOT added**
- Tier 4 (`handler/*`, `components/*`, `redux/*`) — **NOT added**

Plus the legacy `supabase.storage.from(...)` + `getPublicUrl` member-call selectors are still in place from the obliteration round, and the legacy Supabase env-var key ban is unchanged.

**Bundle / perf wins:**

- 80 MB PDFs render the first page progressively via PDF.js Range + SW intercept (`758b2f219`). Verified by code path; not benchmarked here.
- Service Worker intercepts download URLs from L2 IDB on warm cache (`46e10c3e3`). Cross-tab BroadcastChannel invalidation exists via existing `lib/sync/channel.ts`.
- No `cacheTag()`/`use cache` wins claimed — file routes are dynamic-by-design.

---

## 4. Things added that weren't in the original plan

1. **`usePdfRemoteSource` hook** (`758b2f219` · `features/files/hooks/usePdfRemoteSource.ts`). The plan called for the PDF renderer to take a `source: { kind: 'remote' | 'blob-url' }` prop and described auth-header forwarding as a Service Worker concern. The actual implementation pulled that responsibility into a React hook that subscribes to Supabase `onAuthStateChange` and rebuilds the `{ remoteUrl, headers }` payload on token refresh. Cleaner than the plan envisioned — the hook is the auth-aware bridge, the SW is just bytes.

2. **PDF.js worker mirrored at a different path than the plan specified.** Plan §4A said `/public/pdfjs-worker.min.mjs`. Actual location is `/public/pdfjs/pdf.worker.min.mjs` (subdirectory) and the copy script is `scripts/copy-pdfjs-worker.ts` (TS, not `.mjs`). Functionally identical; path-string consumers must use the new location.

3. **`BlobCacheInspector` as one component, not six.** Plan called for `L1Inspector.tsx` + `L2Inspector.tsx` + `SwStatus.tsx` + `BroadcastInspector.tsx` + `CachePolicyForm.tsx` + `SessionToggle.tsx` under `_components/`. Shipped (`2d70ae27f`) as one `BlobCacheInspector.tsx` inside `features/files/cache/admin/` plus the page itself. Probably correct trade-off for a Super-Admin-only diagnostic.

4. **The 3-tier cache layout DID NOT split into the 7-file `features/files/cache/` shape the plan called for.** Plan §6.2 + CACHE inventory specified `blob-lru.ts`, `idb-store.ts`, `policy.ts`, `keys.ts`, `types.ts`, `invalidate.ts`, `expiry-wheel.ts`. Actual: `idb-store.ts`, `policy.ts`, `register-service-worker.ts`, `service-worker/`, `admin/`. The L1 LRU is still living at `features/files/hooks/blob-cache.ts` (not moved into `cache/`). No standalone `keys.ts` / `types.ts` / `invalidate.ts` modules — those concerns are inlined inside `idb-store.ts` and `blob-cache.ts`. The expiry-wheel is at `features/files/handler/intelligence/expiry-wheel.ts` (the merged-handler location), not under `cache/`. This is shape-drift, not capability-drift.

5. **`InlineMediaRef` API ended up with `fallbackIcon` + `as` + `rounded` + `border` props that the plan didn't enumerate.** Plan §6.1 listed `size | fit | fallback | onClick | onDownload`. Actual component (per SWEEP_IMG_SRC_MIGRATIONS migration calls) takes `fallbackIcon`, `rounded="sm|md|lg|full|none"`, `border="subtle"`, and `as="img"`. Necessary additions; the plan undersold the API.

6. **`size="fill"` variant on `InlineMediaRef`** added during Batch 1 (`585942a8c`) to handle parent-controlled sizing. SWEEP_IMG §A Open Question explicitly recommended this — the implementation took the recommendation.

---

## 5. Drift / risk register

### A. Sharp + Image Studio Next route are alive

`app/api/images/studio/process/route.ts:22 import sharp from "sharp"` is live. `features/image-studio/hooks/useImageStudio.ts:366 fetch("/api/images/studio/process", ...)` still calls it. `package.json:224 "sharp": "latest"` still listed. The plan §6.3 names all three deletions in the same paragraph as `app/api/pdf/compress/route.ts` (which DID get deleted). **This is the single largest gap** — the `POST /assets/preview` endpoint is wired (`905684c2f`) but Image Studio has not switched over to it.

### B. ESLint Tier-3 and Tier-4 still off

`@/features/files/types`, `@/features/files/utils/*`, `@/features/files/handler/*`, `@/features/files/components/*`, `@/features/files/redux/*` are NOT in `eslint.config.mjs`'s `windowPanelsImportRestriction.patterns`. The composition-primitive promotion (`5d55020d9`) cleared most violators, but I verified no external imports of these paths remain (`grep -rn "@/features/files/(api|handler|utils|types|redux|components)" --include="*.tsx" --include="*.ts" features/ components/ app/ | grep -v "/features/files/"` → 0 results). The rules are ready to flip; only the eslint config change is owed. **Until they flip, nothing prevents new violations.**

### C. `useFileMutation` does not exist

The plan's "5 canonical hooks" is short one. `features/files/index.ts:39` still names `useFileMutation` as a Phase-1 target. `useFileAs` / `useFileAsset` / `useFileDocument` are still distinct hooks instead of folded into `useFile`. The hook API simplification half of the plan landed partially: the L1/L2 cache hooks work, but the mutation/rename/share consolidation didn't.

### D. ESLint ban on manual `MediaRef` + `ImageBlock` literals is missing

§6.4 was explicit: manual `MediaRef` literals outside `redux/converters.ts` and manual `ImageBlock|AudioBlock|VideoBlock|DocumentBlock` literals outside `features/files/` should be ESLint-banned. No selector in `eslint.config.mjs` enforces either. The four `MediaRef` builders exist and are re-exported, but nothing prevents `<InlineMediaRef ref={{ file_id }}>` style hand-built literals.

### E. `Files.getSignedUrl` direct callers still exist outside `features/files/`

Verified live (not comments): `features/resource-manager/resource-picker/FilesResourcePicker.tsx:267`, `features/tasks/services/taskService.ts:286`, `features/audio/services/audioFallbackUpload.ts:103`, `components/mardown-display/blocks/images/ImageOutputBlock.tsx:190`. These compile because they hit `Api.Files.*` namespace imports rather than `@/features/files/api/*` paths — the Tier-0 ban only catches the `@/...` path form, not the deeper namespace-call form. SWEEP_INTERNAL_IMPORTS Part 1 (api/) listed each one with a REPLACE target.

### F. `Api.Server.uploadAndShare` + `features/files/api/server-client.ts` still live

Per SWEEP_LEFTOVER_REFERENCES LIVE #3 (still unresolved per `grep`). One live caller: `app/api/agent-apps/generate-favicon/route.ts:144`. Plan §6.3 said delete; the docs (`UPLOAD_TROUBLESHOOTING.md`, `features/files/FEATURE.md:336`) describe it as canonical server-side path. Decision owed.

### G. `cloudUploadMany` + `isCloudUploadSuccess` still exported

`features/files/upload/cloudUpload.ts:166,492` exports both, `features/files/upload/index.ts:11,14` re-exports. No live external callers (`useCropStudioController` migration in `c134c7d4c` was the last one). With Tier-2 ESLint in place, no new external importers can land. Demote to internal or delete.

### H. `cloudUpload.ts` is still on the deleted-list

§6.3 names `features/files/upload/cloudUpload.ts` for deletion (slated to fold into a single `features/files/upload/upload.ts`). It still exists and `eslint.config.mjs:141-145` has a deny-path entry for `@/features/files/upload/cloudUpload`. The internal callers haven't migrated. Tier-2 ESLint blocks external use; internal collapse is pending.

### I. Doc-comment drift to deleted hooks

SWEEP_LEFTOVER_REFERENCES claimed ~49 such items. Spot-checked after the `0398718a5` cleanup:
- `grep "useSignedUrl|useAiImageUrl|useFileUploadWithStorage|usePasteImageUpload|useGuardedFileUpload|resolveRenderableImageUrl"` on `features/`, `components/`, `app/` (excluding `docs/`) returns only **4 matches** — all comments correctly pointing at the deletion: `features/files/handler/types.ts:168` (descriptive "Legacy-compat shape from …" header), `components/ui/file-upload/PasteImageHandler.tsx:6` (correct "was deleted in Phase 1" tombstone), `components/ui/file-upload/FileUploadWithStorage.tsx:38` (correct "deleted shim" tombstone), `components/image/ImageManager.tsx:98` (description). Phase 1.k cleared the noisy 49 down to these 4. Tombstones can stay; the type-file legacy reference may be confusing but is accurate.

### J. Internal FE splits all skipped

§6.2 / PR3-22 called for `FilePreview` registry, `FileTable` → TanStack, `PageShell` per-section, `thunks.ts` split by domain, `types.ts` split into `domain.ts`/`api.ts`/`ui.ts`. None of these landed. `features/files/redux/thunks.ts` is still ~1790 lines; `features/files/types.ts` is still monolithic. The public surface re-exports `export type * from "@/features/files/types"` (line 293) explicitly noting "Phase 1 splits this into domain.ts / api.ts / ui.ts and deletes the hand-authored Asset block once regenerated types stabilize." Not done.

### K. OpenAPI type-gen CI gate not wired

No `gen:types` script visible in `package.json`. No CI gate. Hand-authored Asset types at `features/files/types.ts:1187-1311` not deleted. The `types/python-generated/api-types.ts` file exists (commit `905684c2f` writes endpoint constants pointing at types from it), but the **gate** that prevents drift between BE and FE is missing.

### L. Per-route `<CloudFilesRealtimeProvider>` mounts — verification incomplete

The single global mount in `app/Providers.tsx` exists. Whether all four legacy per-route mounts (`app/(a)/files/layout.tsx`, `app/(a)/images/layout.tsx`, `features/code/views/explorer/CloudFilesExplorer.tsx`, `features/window-panels/windows/cloud-files/*Window.tsx`) were deleted by `87255c1de` was not exhaustively verified. Risk: double-mount duplicates realtime subscriptions.

---

## 6. Concrete next-step checklist

Ranked by user-impact / risk-reduction. Items 1–4 are the "finish the consolidation" critical path.

1. **Migrate Image Studio off `/api/images/studio/process` → `POST /assets/preview` + delete the Next route + drop `sharp` from `package.json`.** (Drift §A.) BE endpoint is live; FE refactor + delete is one PR. Plan §6.3 / PR3-18.

2. **Flip ESLint Tier-3 (`types`, `utils/*`) and Tier-4 (`handler/*`, `components/*`, `redux/*`) bans to error.** (Drift §B.) `grep` confirms zero external violators across `features/`, `components/`, `app/`. Pure config change.

3. **Migrate the remaining 4 `Api.Files.getSignedUrl` namespace callers** in `FilesResourcePicker.tsx`, `taskService.ts`, `audioFallbackUpload.ts`, `ImageOutputBlock.tsx` to `useFileSrc` / `fileHandler.use(...).as(...)`. (Drift §E.) Tier-4 flip in step 2 surfaces these as errors.

4. **Decide `Api.Server.uploadAndShare` fate** (Drift §F + SWEEP_LEFTOVER LIVE #3): delete the 320-line `server-client.ts` and migrate `app/api/agent-apps/generate-favicon/route.ts:144`, OR update the cleanup spec to keep it as the canonical server-side path. User decision required.

5. **Demote `cloudUploadMany` + `isCloudUploadSuccess` from the upload barrel** (Drift §G). Strip from `features/files/upload/index.ts:11,14`. Internal-only.

6. **Build `useFileMutation` and collapse `useFileAs` / `useFileAsset` / `useFileDocument` into `useFile`** (Drift §C). Plan §6.1 promised five canonical hooks; we shipped four. `useFileMediaBlock` + `useFileDownloadUrl` deletion can follow.

7. **Add ESLint selectors for manual `MediaRef` and `ImageBlock|AudioBlock|VideoBlock|DocumentBlock` object literals** (Drift §D). Custom rule needed for the MediaRef shape (object expression with `file_id` / `url` / `file_uri` keys outside `redux/converters.ts`).

8. **Wire `pnpm gen:types && git diff --exit-code` as a CI gate** (Drift §K) and delete the hand-authored Asset block at `features/files/types.ts:1187-1311`.

9. **Verify per-route `<CloudFilesRealtimeProvider>` mounts are gone** (Drift §L). Quick grep + delete.

10. **Internal FE splits** (Drift §J): split `thunks.ts` by domain, split `types.ts` into `domain.ts`/`api.ts`/`ui.ts`, convert `FilePreview` 404-line switch to registry, convert `FileTable` to TanStack, split `PageShell` by section. Lowest-priority because no behavior change; highest leverage on future contributor velocity.

11. **Delete the dead block of `<img src>` migrations from the medium-confidence batch** in SWEEP_IMG_SRC_MIGRATIONS (12 items, ~half done in Batches 1–4). `ImageOutputBlock`'s "Save to Files" + refresh overlay needs `<InlineMediaRef>` to accept `onLoad` / `onError` / `isResolving` + `forwardRef` first (SWEEP_IMG §D). Lowest-priority gap.

12. **Move `features/files/hooks/blob-cache.ts` into `features/files/cache/blob-lru.ts`** (Drift item §4). Co-locates the 3-tier cache. Pure refactor, low risk.

---

## 7. Sign-off statement

**Honest assessment: the consolidation is ~75% done, and the remaining 25% is concentrated, not scattered.** The hard parts — the directory merge, the Service Worker, the IndexedDB tier, PDF.js Range rendering, the InlineMediaRef rollout (94+ migrated call sites), the public surface lock-down, Tier-1/Tier-2 ESLint enforcement, and the deletion of 6 hooks + 2 utilities + 1 Next route + the `useAiImageUrl` mess — all landed and look solid. The plan's "rip-and-replace, no shims" posture mostly held: only `useFileMediaBlock` and `useFileDownloadUrl` remain on the gentle-deprecation path (deny-rule blocks new imports, source files persist for internal callers), and that's a defensible choice.

The biggest single gap — Image Studio's `app/api/images/studio/process/route.ts` and the `sharp` dep — is genuinely embarrassing: the backend endpoint shipped two weeks ago, the FE just hasn't switched. Once that and Tier-3/4 ESLint flips land, the door is structurally closed. `useFileMutation` and the internal FE splits (`thunks.ts`, `types.ts`, `FilePreview` registry, TanStack `FileTable`) are real but secondary — they don't unblock anything, they just make the next refactor easier.

**Verdict: not yet done enough to declare victory.** Items 1–4 in §6 are the minimum to call it shipped. Items 5–12 are post-victory cleanup. Don't claim "done" until the Image Studio route is gone, `sharp` is out of `package.json`, and Tier-4 ESLint is at error severity — those three together are what guarantees no new bypasses can be added.
