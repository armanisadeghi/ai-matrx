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

- `import { fileHandler } from "@/features/file-handler/handler"` — read/write/refresh
- `import { useFile } from "@/features/file-handler/hooks/useFile"` — generic resolve
- `import { useFileSrc } from "@/features/file-handler/hooks/useFileSrc"` — `<img src>` URL
- `import { useFileBlob } from "@/features/file-handler/hooks/useFileBlob"` — bytes
- `import { useFileMediaBlock } from "@/features/file-handler/hooks/useFileMediaBlock"` — AI block
- `import { useFileDownloadUrl } from "@/features/file-handler/hooks/useFileDownloadUrl"` — `<a download>`
- `import { useFileUpload } from "@/features/file-handler/hooks/useFileUpload"` — write path

**Types** — `@/features/file-handler/types`
**Errors** — `@/features/file-handler/errors`

**Routes:** none. The handler is a library, not a page.

**Redux:** consumes `cloudFiles` and `userAuth` and `appContext` slices. Does not own its own slice — files live in `cloudFiles`, in-flight uploads in `cloudFiles.uploads`.

---

## Data model

**Tables read:** `cld_files`, `cld_file_permissions`, `cld_share_links` (all via existing `features/files` selectors and REST client).

**Tables written:** `cld_files` (via `Files.uploadFile`), optional `file_handler_events` (telemetry — migration pending).

**Key types** (`features/file-handler/types.ts`):
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
5. If the file is public and has `publicUrl` (CDN), use it. Otherwise mint a signed URL via `mintSignedUrl(fileId)` and register expiry with the global `expiry-wheel`.
6. Output adapter `toHtmlSrc` returns the chosen URL.
7. `<img src>` renders. Thirty seconds before the signed URL expires, the wheel re-mints; React subscribers re-render automatically.

### Flow 2 — submit a freshly-pasted image to the agent

1. Paste handler builds `{ kind: "file", file }` and stores it in component state.
2. On send, `useFileUpload().upload(source, opts)` is called.
3. `uploadInternal` coerces source → `File`, stamps `metadata.scope = { organization_id, project_id, task_id }` from `appContext`, posts to `/files/upload`.
4. Returns a `NormalizedFile` pointing at the new `cld_files` row.
5. The agent input layer calls `fileHandler.toMediaBlock(normalized)` to produce an `ImageBlock { file_id, mime_type }`.
6. The block goes into `user_input` on the agent request body.

### Flow 3 — signed URL expires while user is browsing

1. `expiry-wheel` fires ~30s before `expiresAt`.
2. Refresher calls `mintSignedUrl(fileId)` which hits `GET /files/{id}/url`.
3. Backend re-validates owner / permissions; returns fresh URL or 403.
4. On success: wheel `bumpExpiry`. On 403: `isS3ExpiredError` distinguishes "S3 said expired" (refetch) from "backend said access denied" (throw `FileAccessDeniedError`, surface to UI).

### Flow 4 — share link viewer

1. Source: `{ kind: "share_link", token }`.
2. `normalize` sets `url = /api/share/{token}/file`, `origin = "public"`, `shareToken = token`.
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

### Single global expiry wheel

`intelligence/expiry-wheel.ts` keeps one timer for the entire app, sorted by next-due `expiresAt`. Replaces the per-component `setTimeout` pattern in the legacy `useSignedUrl`. Watching is opt-in: `watchExpiry(fileId, expiresAt, refresher)`.

### CORS-aware transport

S3 signed URLs are CORS-blocked for `fetch()`. `NormalizedFile.capabilities.transportSafeForFetch` is `false` for those, and `preferFetchableUrl()` falls back to the same-origin proxy `/api/files/{id}/proxy` instead.

---

## Telemetry

Every interesting event writes to `public.file_handler_events` (Supabase, RLS-restricted to the authenticated user's own rows). Per the project's telemetry rule, telemetry goes to the database — no Sentry, no third parties.

Events: `resolve | upload_started | upload_completed | upload_failed | signed_url_minted | signed_url_refreshed | signed_url_expired | access_denied | share_link_invalid | external_fetch_failed | cors_fallback_to_proxy | mime_sniff | magic_bytes_unknown | stream_event_normalized`.

The `file_handler_events` migration is pending. Until it lands, telemetry no-ops in production and logs in development.

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
| `components/ui/file-upload/useFileUploadWithStorage.ts` | `useFileUpload` from this feature | pending |
| `components/ui/file-upload/usePasteImageUpload.ts` | `useFileUpload` + `{ kind: "file", file }` | pending |

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

- **2026-05-07** — Phases 0–4 + 7 (partial) + 8 shipped. Handler core complete with input adapters (16), resolver (with hydration + access decision + signed-URL minting + expiry wheel + magic-byte sniffing), output adapters (11), upload path with org-scope routing, stream-event normalization, React hooks, error taxonomy, and ESLint guardrails. Deleted three orphaned `@deprecated` sessionStorage backup functions in `audioStorageService.ts`. Migration of active `supabase.storage` call sites and the 5 duplication clusters is queued as Phases 5–6 (one PR per cluster).
