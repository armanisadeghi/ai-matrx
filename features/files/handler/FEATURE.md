# FEATURE.md — `file-handler`

**Status:** `scaffolded`
**Tier:** `1`
**Last updated:** `2026-05-07`

---

## Purpose

The universal file handler. Every codepath that touches a file — owned `cld_files` row, blob from a paste, signed URL, base64, external URL, share link, just-uploaded result, mid-stream agent reference — funnels through ONE `FileSource → NormalizedFile → FileTarget` pipeline. The core logic for resolving, validating access, refreshing signed URLs, and emitting AI media blocks lives here exactly once.

This feature is the **single source of resistance** for file flows: direct construction of media blocks, direct calls to `supabase.storage`, and direct calls to the cloud-files REST API are all banned outside this directory (ESLint enforced).

---

## Entry points

**Public API** — import directly, no barrel:

- `import { fileHandler } from "@/features/files/handler/handler"` — read/write/refresh
- `import { useFile } from "@/features/files/handler/hooks/useFile"` — generic resolve
- `import { useFileSrc } from "@/features/files/handler/hooks/useFileSrc"` — `<img src>` URL
- `import { useFileBlob } from "@/features/files/handler/hooks/useFileBlob"` — bytes
- `import { useFileMediaBlock } from "@/features/files/handler/hooks/useFileMediaBlock"` — AI block
- `import { useFileDownloadUrl } from "@/features/files/handler/hooks/useFileDownloadUrl"` — `<a download>`
- `import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload"` — write path

**Types** — `@/features/files/handler/types`
**Errors** — `@/features/files/handler/errors`

**Routes:** none. The handler is a library, not a page.

**Redux:** consumes `cloudFiles` and `userAuth` and `appContext` slices. Does not own its own slice — files live in `cloudFiles`, in-flight uploads in `cloudFiles.uploads`.

---

## Data model

**Tables read:** `cld_files`, `cld_file_permissions`, `cld_share_links` (all via existing `features/files` selectors and REST client).

**Tables written:** `cld_files` (via `Files.uploadFile`).

**Servers touched:** Python only (`server.app.matrxserver.com/files/*`, `/assets`, and `/share/*`). The handler never crosses through Next.js. No `/api/files/*`, no `/api/share/*`. (The legacy Next.js+Sharp route at `/api/images/upload` was deleted on 2026-05-12 — preset-variant image uploads now go directly to Python's `POST /assets`.) Telemetry lives on the Python side.

**Key types** (`features/files/handler/types.ts`):
- `FileSource` — discriminated union over every input shape (16 variants).
- `NormalizedFile` — the one internal representation. Carries `fileId | url | fileUri | base64`, `origin`, `capabilities`, `meta`, `lifecycle`, `scope`, `derivedFrom`.
- `FileTarget` — discriminated union over every consumer surface (11 variants).
- `MediaBlock` — `ImageBlock | AudioBlock | VideoBlock | DocumentBlock | YouTubeVideoBlock`.
- `UploadOpts` — folder/visibility/scope-inheritance/share grants.

---

## Key flows

### Flow 1 — render an `<img>` for a cloud file

1. Component calls `useFileSrc({ kind: "file_id", fileId })`.
2. `normalize()` returns a partial `NormalizedFile` with `fileId` set.
3. `resolve()` hydrates: `selectFileById(state, fileId)` → if missing, `Files.getFile(fileId)` → `apiFileRecordToCloudFile(...)`.
4. `decideForOwnedFile` chooses `origin` and `capabilities` using owner / visibility / `cld_file_permissions`.
5. If the file is public and has `publicUrl` (CDN), use it. Otherwise call `getOrMintSignedUrl(fileId)` — returns the cached URL if one is still valid, otherwise mints one and caches it. No background timers.
6. Output adapter `toHtmlSrc` returns the chosen URL.
7. `<img src>` renders. Once the bytes are in the browser's HTTP cache the URL string's expiry is irrelevant — the image stays on screen indefinitely. If a later action needs a fresh URL (download, edit, re-mount), the cache hands out the still-valid one or lazily re-mints in the same call. No re-render is forced unless the consumer explicitly remounts.

### Flow 2 — submit a freshly-pasted image to the agent

1. Paste handler builds `{ kind: "file", file }` and stores it in component state.
2. On send, `useFileUpload().upload(source, opts)` is called.
3. `uploadInternal` coerces source → `File`, stamps `metadata.scope = { organization_id, project_id, task_id }` from `appContext`, posts to `/files/upload`.
4. Returns a `NormalizedFile` pointing at the new `cld_files` row.
5. The agent input layer calls `fileHandler.toMediaBlock(normalized)` to produce an `ImageBlock { file_id, mime_type }`.
6. The block goes into `user_input` on the agent request body.

### Flow 3 — signed URL expires while user is browsing

There is no background refresh. The policy is **lazy mint on demand**:

1. While the file's bytes are already loaded into the `<img>` / `<video>` / `<audio>`, the URL string's expiry does not matter — the browser is not re-requesting it.
2. The next time *anything* asks for the URL (a download, an edit, a remount, a share action), the resolver routes through `getOrMintSignedUrl(fileId)`. If the cached URL is still valid (with a 60s safety margin), it's returned as-is. If not, a fresh URL is minted in that call and cached.
3. Concurrent callers for the same fileId share one in-flight mint via the cache's request-dedup map — 20 components loading the same file produce 1 network call, not 20.
4. The 403 retry path: if the browser ever does refetch a stale URL (e.g. memory-pressure cache eviction with the tab still open), an `<img onError>` handler can call `invalidateSignedUrl(fileId)` and force the consumer to remount with a fresh URL. Most consumers don't bother — a manual reload is acceptable for this rare edge case.
5. Backend errors: on a permissions change, `mintSignedUrl` will surface `FileAccessDeniedError`; the cache won't store the failed mint, so the next call re-tries.

### Flow 4 — share link viewer

1. Source: `{ kind: "share_link", token }`.
2. `normalize` sets `url = pythonShareUrl(token)` (i.e. `${BACKEND}/share/{token}/download`), `origin = "public"`, `shareToken = token`.
3. Resolver doesn't need to hydrate — share-link lifetime is managed by the backend.
4. Consumer fetches; on 410 the backend returns `share_link_invalid`; the resolver translates to `ShareLinkInvalidError`.

---

## Intelligence (the part the user emphasized)

### Failure-mode taxonomy → typed errors

| Cause | Error class | Retry posture |
|---|---|---|
| Signed URL expired but user has access | `FileExpiredError` (internal — auto-recovered) | Auto-refresh once |
| User permanently lost access | `FileAccessDeniedError` | Reject. No retry. |
| File deleted | `FileDeletedError` | Reject. UI surfaces "in trash". |
| File not found | `FileNotFoundError` | Reject. |
| Share link invalid/expired/revoked | `ShareLinkInvalidError` | Reject. |
| External URL fetch failed | `ExternalFetchError` | Reject. |
| Upload failed | `FileUploadError` | Caller-decided. |

### Access decision

`intelligence/access.ts:decideForOwnedFile` evaluates in this order:
1. owner_id === current user → `owned` (full caps)
2. visibility === "public" → `public` (read-only)
3. `cld_file_permissions` row matches user (and not expired) → `shared` (level-derived caps)
4. None → `owned` with no caps; the resolver rejects on first request

### Org-scope routing

When uploading, `inheritActiveScope: true` (default) reads `selectOrganizationId / selectProjectId / selectTaskId` from `appContext` and stamps them into `metadata.scope`. The Python backend reads this and writes the column counterparts.

### Lazy signed-URL cache

`intelligence/signed-url-cache.ts` is an in-memory map of `fileId → { url, expiresAt }`, shared by every consumer in the app for the lifetime of the page. The policy is "mint on demand, never preemptively":

- **No background timers.** Nothing runs in the background to refresh URLs. Once the browser has loaded the bytes the URL is a sunk cost.
- **Cache hit → return.** If the cached URL is still valid (with a 60s safety margin so a download started right at the boundary still completes), it's returned as-is.
- **Cache miss → mint + cache.** A single `mintSignedUrl` call populates the cache and resolves the caller.
- **In-flight dedup.** Concurrent callers asking for the same `fileId` share one `Promise`. A grid of 50 thumbnails for the same file produces one `GET /files/{id}/url`, not 50.
- **`invalidateSignedUrl(fileId)`** lets a 403-retry path force a re-mint.
- **`clearSignedUrlCache()`** is called on sign-out so a previous user's URLs don't leak to a new session.

The previous "expiry wheel" — a global timer that preemptively re-minted every URL ~30s before expiry — has been removed. It caused a runaway loop the moment a refresher failed to update its `expiresAt` (see Change Log, 2026-05-17). The lazy model is what AWS, Drive, Dropbox, and Slack do in production: it's simpler, cheaper, and structurally cannot loop.

### CORS-aware transport

S3 signed URLs are CORS-blocked for `fetch()`. `NormalizedFile.capabilities.transportSafeForFetch` is `false` for those; `preferFetchableUrl()` falls back to Python's authenticated download endpoint (`{BACKEND_URL}/files/{id}/download`) — never to a Next.js proxy. The browser talks to Python (or the CDN) directly.

---

## Migration plan (the duplication clusters this replaces)

The following call sites still build their own attachments. Each becomes a small change once the handler is in: replace local logic with `fileHandler.use(source).as(target)`.

| Call site | Replace with | Status |
|---|---|---|
| `features/cx-conversation/ConversationInput.tsx` attachment lifecycle | `useFileMediaBlock` + `fileHandler.toContentPart` | pending |
| `features/agents/redux/execution-system/instance-resources/resource-source.ts` `refineBlockType` + `resourceDataToSource` | `fileHandler.toMediaBlock` | pending |
| `features/cx-chat/utils/buildContentBlocksForSave.ts` | `fileHandler.toContentPart` | pending |
| `features/rag/api/ingest.ts` (file source coercion) | `fileHandler.use(source).as({ kind: "rag_ingest_source" })` | pending |
| `features/tasks/services/taskService.ts` legacy attachments path | `fileHandler.use({ kind: "file_id", fileId })` | pending |
| `components/ui/file-upload/useFileUploadWithStorage.ts` | `useFileUpload` from this feature | done |
| `components/ui/file-upload/usePasteImageUpload.ts` | `useFileUpload` + `{ kind: "file", file }` | done |

The active `supabase.storage` call sites must be migrated to the handler before deletion — see "Obliteration plan" below.

---

## Obliteration plan — Supabase Storage call sites

The user's directive is single-system, no legacy. These call sites still use `supabase.storage` and need rewiring to the handler:

1. `hooks/usePublicFileUpload.ts` (`public-chat-uploads`) — used by public chat. Migrate to handler's anonymous lane (Supabase issues an anonymous auth UUID; cloud-files works with that JWT). Then delete the file and the bucket.
2. `features/transcripts/service/transcriptsService.ts` + `features/transcripts/service/audioStorageService.ts` (`user-private-assets`) — migrate to cloud-files folder `Transcripts/Recordings`.
3. `features/transcripts/components/CreateTranscriptModal.tsx` — follows the service migration.
4. `app/api/admin/feedback/images/route.ts` (dynamic buckets) — backfill old image URLs to `cld_files`, then delete the route's resign path.
5. `app/api/prompt-apps/generate-favicon/route.ts` (`app-assets`) — write favicon to cloud-files; let the handler issue the URL.
6. `lib/code-files/objectStore.ts` legacy path — already dual-mode; remove the `supabase.storage` branch once all `code_files.s3_bucket = "code-editor"` rows are migrated.
7. `features/tasks/services/taskService.ts` legacy `attachments` bucket — already commented "left for backwards compat"; remove after backfill.
8. `features/audio/services/audioFallbackUpload.ts` — comment says it was migrated; verify and remove any residue.

These are tracked in `features/files/migration/INVENTORY.md`.

---

## What this feature deliberately does NOT own

- **AWS SDK on the FE.** Never. All S3 ops stay server-side.
- **Provider-shape conversion (Anthropic/OpenAI/Google).** Stays in the Python backend. The handler emits canonical `MediaBlock` shapes, never provider-specific.
- **Sharp / OCR / Whisper transforms.** Server-side. The handler triggers transforms via existing routes; it does not run them.
- **IndexedDB audio safety store** (`features/audio/services/audioSafetyStore.ts`). Stays as a separate concern (crash-recovery staging); it can later adopt `FileSource` as its export type so finished recordings flow through the handler on commit.
- **Code-editor multi-file state.** That's its own state machine; the handler is the byte-transport layer underneath.

---

## Invariants that MUST hold

1. Every consumer of files (`<img>`, AI media block, download link, OG image, persistence to `cx_message.content[]`, RAG ingest) goes through `fileHandler.use(source).as(target)`. Direct construction of media blocks is banned.
2. `NormalizedFile.fileId` is set whenever known. Output adapters always prefer it over URLs.
3. The S3 bucket is touched only by the Python backend. The FE never sees an AWS SDK.
4. Anonymous users (public chat) are authenticated to Supabase with an anonymous UUID — they use the same handler API. There is no second lane.
5. New file flows must use the handler from day one. ESLint catches direct `supabase.storage` and direct media-block construction.
6. Every uploaded file carries scope (`organization_id / project_id / task_id`) in `metadata.scope` when the active context has them. The handler stamps this.

---

## Change log

- **2026-06-12** — Audio output now renders through the handler (matching images). New `components/mardown-display/blocks/audio/AudioOutputBlockRenderer.tsx` resolves a durable URL via `useFileSrc` from the block's `file_id` (recovered from any URL/URI when not explicit) before mounting the presentational `<AudioOutputBlock>`. Fixes two bugs in `BlockRenderer`'s `audio_output` case, which previously echoed the raw `data.url`: (1) streaming audio didn't play because Python now sends only a `file_id` (no minted URL); (2) the player's "Copy link" leaked a raw signed S3 URL. A resolved-but-still-expiring S3 URL is now surfaced via `reportMediaDurabilityViolation` (loud recovery) rather than silently rendered. Applies to both live-stream and DB-loaded messages (both route through the same case).
- **2026-06-12 (media canonicalization)** — Extended the handler-resolution pattern to **all** chat media output blocks, so there is exactly one durable path per type: image → `UnifiedImageBlockRenderer`, audio → `AudioOutputBlockRenderer`, video → **new** `VideoOutputBlockRenderer`. URL resolution is now shared via `components/mardown-display/blocks/buildMediaSource.ts` (`buildMediaSource` + `fileIdFromAnyUri`), consumed by both the audio and video renderers (no duplicated resolver). `BlockRenderer`'s `video_output` case (and the markdown-link `audio` case) no longer echo the raw `data.url`/`block.src` — both route through the renderers, fixing the same streaming-doesn't-play + S3-copy-leak bugs for video and link-audio. The disruptive `reportMediaDurabilityViolation` `console.error` in `AudioOutputBlockRenderer` (which tripped the Next.js error overlay mid-stream) was replaced with a plain `console.log("[audio-block] resolved", …)`; the still-private-S3 audio is tracked as a backend defect (KNOWN_DEFECTS.md → D1). Added `AudioOutputBlockSkeleton.tsx` (dimension-matched loading twin of the landscape player; zero layout shift) and wired it into the three "Generating audio…" surfaces (cx-chat, cx-conversation, prompts). Deleted the unused multi-track `AudioComponent.tsx` (zero consumers).
- **2026-05-17** — Second consolidation pass — kill every remaining bypass of the centralized file flows beyond signed URLs. Three parallel audits (write path, read path, mutation path) plus follow-up fixes:
  - **Fixed two state-desync bugs.** `features/code-files/service/s3Service.ts:deleteCodeFileFromS3` and `features/transcripts/service/audioStorageService.ts:deleteAudioFromStorage` both called `Files.deleteFile` directly — REST succeeded but the Redux slice waited on the realtime echo, producing a stale-row race window. Both now route through `fileHandler.remove(fileId, { hard: true })` which dispatches the canonical `deleteFile` thunk (REST + slice removal in one).
  - **Fixed three PDF-extractor upload bypasses.** `features/pdf-extractor/components/ManipulationPanel.tsx` (1 call-site) and `features/pdf-extractor/studio/PdfStudioReader.tsx` (2 call-sites) imported raw `uploadFile` from `@/features/files/api/files` to save crop/reorder PDF derivatives — skipping optimistic Redux updates, duplicate-detection, the upload guard, progress instrumentation, and `attachChildToFolder` wiring. All three now use `fileHandler.upload({ kind: "file", file }, { folderPath })` and read `fileId` / `fileUri` from the returned `NormalizedFile`.
  - **Killed parallel MediaRef builder.** `features/agents/redux/execution-system/instance-resources/resource-source.ts:resourceDataToSource` was constructing a `MediaRef` inline ("kept synchronous because the slice reducer needs it inline") — exact duplication of `output/target.ts:toMediaRef`. Exported `toMediaRef` from the handler's output module and from the public `@/features/files` surface; the agent slice now calls it directly. One builder, one source of truth.
  - **Fixed handler URL-stitching bug.** `upload.ts` post-share-link URL chain used `?? ""` for the app-share-URL fallback, which produced an empty string that defeated subsequent `??` fallbacks. Rewrote to use `||` and added `pythonShareUrl(result.shareToken)` as the canonical terminal fallback — now `normalized.url` is guaranteed non-empty whenever `createShareLink: true` succeeds. Removed the consumer-side `pythonShareUrl` fallback from `features/image-studio/modes/shared/save-edited-image.ts` that existed because of this bug.
  - **Consolidated three hand-built share URLs.** `app/(public)/share/[token]/page.tsx` (server-side resolve), `app/(public)/share/[token]/_components/PublicDownloadButton.tsx` (download fallback), and the image-studio save fallback (above) were all assembling `${BACKEND_URL}/share/{token}/...` strings inline. All three now use the canonical `pythonShareResolveUrl(token)` / `pythonShareUrl(token)` helpers from `@/features/files`.
  - **Known exceptions documented (not fixed).** `features/podcasts/components/admin/AssetUploader.tsx` posts raw `FormData` to `/media/podcast/upload-video` — that endpoint is a server-side transcoding + frame-extraction composite, not a generic upload. The right fix is on the Python side (return a `cld_files` UUID alongside the URLs); deferred. `features/research/hooks/useResearchApi.ts` similarly uploads to a research-sources endpoint with its own pipeline. Both are explicit "separate API surface" rather than handler bypasses.
  - **Remaining smell cluster: direct write-thunk dispatches.** ~15 surfaces (`BulkActionsBar`, `FileContextMenu`, `RowContextMenu`, `RenameDialog`, `FileVersionsList`, `PermissionsDialog`, `ShareLinkDialog`, `ImageSharePopover`, `CloudFileInlineEditor`, `CloudFileEditor`, `NewMenu`, `useImageStudio`, `useFileShortcuts`, `CloudImagesTab`, `FileList`) dispatch `deleteFile` / `renameFile` / `moveFile` / `updateFileMetadata` / `updateFolder` / `createFolder` / `createShareLink` / `deactivateShareLink` / `grantPermission` / `revokePermission` / `restoreVersion` / `uploadFiles` thunks directly from `useAppDispatch()` instead of going through `useFileMutation` / `useSharing` / `useFolderMutation`. The thunks still keep state consistent (so these are smells, not bugs), but they're the exact pattern that, when extended, produced last night's loop. Next step: add an ESLint `no-restricted-imports` rule barring `@/features/files/redux/thunks` outside the canonical wrappers, and extend `useFolderMutation` with `.create({ parentId, name })` to close the only legitimate gap (`NewMenu` / `useImageStudio` use of `createFolder` + `ensureFolderPath`).

- **2026-05-17** — Consolidated every signed-URL path through the handler. `Files.getSignedUrl()` is now called from exactly one place — `intelligence/refresh.ts` — which is invoked only by the lazy cache. Concrete changes:
  - **`features/files/redux/thunks.ts:getSignedUrl` thunk** now routes through `fileHandler.use(...).as({ kind: "html_src" })` instead of calling `Files.getSignedUrl` directly. This single edit fans out to ~13 consumers (FileContextMenu, BulkActionsBar, useFileShortcuts, useFileMutation, useFileActions, PreviewErrorBoundary, CloudImagesTab) — every download / copy-URL / open-in-new-tab action now hits the cache.
  - **`features/image-studio/components/StudioVariantTile.tsx`** and **`features/image-studio/components/EmbeddedImageStudio.tsx`** migrated off direct `Files.getSignedUrl` calls and onto the handler.
  - **`features/files/api/server-client.ts`** — removed the dead `getSignedUrl` server-side wrapper (no callers; was a duplicate path that could re-introduce the bypass).
  - Net effect: a copy-URL action on a file that was just viewed in the same session is now a zero-network operation (cache hit). Multiple components asking for the same file's URL share one in-flight request via the cache's dedup map.
- **2026-05-17** — Switched signed-URL strategy from "global expiry wheel re-mints proactively" to "lazy mint on demand, cache while valid". This is the pattern AWS / Drive / Dropbox / Slack use in production. Concrete changes:
  - **Deleted `intelligence/expiry-wheel.ts`.** The wheel was the source of a runaway loop: once any refresher resolved without updating its entry's `expiresAt` (which the resolver's refresher never did), `reschedule()` computed `wait = 0` and `setTimeout(tick, 0)` re-fired immediately, burning ~3 requests/second per open file. A single file left open overnight produced tens of thousands of `GET /files/{id}/url` calls. The class of failure no longer exists because the timer no longer exists.
  - **Added `intelligence/signed-url-cache.ts`.** Module-level map keyed by `fileId` storing `{ url, expiresAt }`, with in-flight request dedup so N concurrent consumers of the same file produce one network call. Exposes `getOrMintSignedUrl`, `invalidateSignedUrl` (for `<img onError>` retries), and `clearSignedUrlCache` (for sign-out).
  - **Rewrote `resolver.ensureSignedUrl`** to route through `getOrMintSignedUrl`. No more `watchExpiry` registration. The previously known follow-up — "freshly minted URL not propagated back to React consumers" — is now obviated: there is no automatic re-mint to propagate. The next consumer that asks for the URL gets a fresh one synchronously through the same code path.
  - **`hooks/useFile.ts`** dropped its `unwatchExpiry` cleanup effect (no longer needed).
  - Rationale: once the browser has the bytes in its HTTP cache the URL string's expiry doesn't matter — the `<img>` keeps rendering. URLs only need to be fresh at the moment something actively asks for them (download, edit, remount), and the cache + lazy mint handles that in one synchronous code path. Net effect: zero requests when idle, one request per (fileId × hour) when active, structurally immune to loop bugs.
- **2026-05-07** — Direct-to-Python doctrine + obliteration round.
  - Removed the entire telemetry module and all `recordTelemetry` calls (Python owns telemetry).
  - All output URLs now point directly at Python (`{BACKEND}/files/{id}/download`, `{BACKEND}/share/{token}`). No Next.js hops.
  - Deleted `hooks/usePublicFileUpload.ts` and the `public-chat-uploads` Supabase bucket — public chat now uses the universal handler with the user's anonymous Supabase auth UUID. Same code path as authenticated callers.
  - Deleted Next.js routes: `app/api/admin/feedback/images`, `app/api/share/[token]/file`, `app/api/code-files/upload`, `app/api/code-files/download`. Their callers (FeedbackDetailDialog, FeedbackTable, ShareLinkDialog, cloudUpload, code-files virtual source, s3Service) now talk to Python directly.
  - Deleted `lib/code-files/objectStore.ts` (legacy server-side dual-mode path).
  - Migrated `features/transcripts/service/audioStorageService.ts`, `transcriptsService.ts`, `CreateTranscriptModal.tsx` off the `user-private-assets` bucket. Audio recordings + uploads now land in `cld_files` under `Transcripts/Recordings` and `Transcripts/Uploads`. `audio_file_path` columns now hold cld_files UUIDs.
  - Deleted the legacy `attachments` bucket branch in `features/tasks/services/taskService.ts`. Task attachments are cloud-files only.
  - Rewrote `features/agents/redux/execution-system/instance-resources/resource-source.ts` to defer to handler primitives (`normalize`, `preferIdentityLocator`). The agent attachment lifecycle is now on the same single system as everything else.
- **2026-05-07** — Phases 0–4 + 7 (partial) + 8 shipped. Handler core complete with input adapters (16), resolver (with hydration + access decision + signed-URL minting + expiry wheel + magic-byte sniffing), output adapters (11), upload path with org-scope routing, stream-event normalization, React hooks, error taxonomy, and ESLint guardrails.
