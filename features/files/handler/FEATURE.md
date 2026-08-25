# features/files/handler — the universal file handler (local mechanics)

> **Cross-repo system-of-record:** `/Users/armanisadeghi/code/common-docs/systems/media/file-service/STATE.md` — read it before touching this feature in ANY repo. What the handler enforces (lazy signed-URL minting, share-vs-signed, transport policy, the Vault byte boundary) is stated once in `FILE_HANDLING_LAWS.md` § 9 in that same directory.

Every codepath that touches a file funnels through ONE `FileSource → NormalizedFile → FileTarget`
pipeline. This is the single source of resistance for file flows.

## Public API — import directly, no barrel

```ts
import { fileHandler }        from "@/features/files/handler/handler";
import { useFile }            from "@/features/files/handler/hooks/useFile";
import { useFileSrc }         from "@/features/files/handler/hooks/useFileSrc";
import { useFileBlob }        from "@/features/files/handler/hooks/useFileBlob";
import { useFileMediaBlock }  from "@/features/files/handler/hooks/useFileMediaBlock";
import { useFileDownloadUrl } from "@/features/files/handler/hooks/useFileDownloadUrl";
import { useFileUpload }      from "@/features/files/handler/hooks/useFileUpload";
// types: @/features/files/handler/types   errors: @/features/files/handler/errors
```

`useFileSrc` returns a bare `string | null`, not an object. The handler is a library, not a page —
it owns no slice (files live in `cloudFiles`, in-flight uploads in `cloudFiles.uploads`).

## Where things are

`handler.ts` (entry) · `types.ts` (16 `FileSource` variants, `NormalizedFile`, 11 `FileTarget`
variants) · `errors.ts` · `intelligence/access.ts` (`decideForOwnedFile`) ·
`intelligence/signed-url-cache.ts` (the lazy cache) · `intelligence/refresh.ts` (the ONLY caller of
`Files.getSignedUrl`) · `hooks/useRemintableSrc.ts` · `../upload/cloudUpload.ts` +
`../upload/tusUpload.ts` + `../upload/__tests__/transport-policy.test.ts` ·
`../vault/vaultAttachmentTransport.ts`.

## Invariants — do not violate

1. **Every file consumer** (`<img>`, AI media block, download link, OG image, persistence to
   `cx_message.content[]`, RAG ingest) goes through `fileHandler.use(source).as(target)`. Direct
   media-block construction is banned.
2. **`NormalizedFile.fileId` is set whenever known** and output adapters always prefer it over URLs.
   `storage_uri`/`fileUri` is banned client-side; a ref carrying only a storage URI is treated as
   absent, never an error.
3. **The S3 bucket is touched only by the backend. Never an AWS SDK on the FE.**
4. **The handler never crosses through Next.js.** No `/api/files/*`, no `/api/share/*`.
   `preferFetchableUrl()` falls back to the authenticated `{BACKEND}/files/{id}/download`, never to a
   Next.js proxy.
5. **Anonymous users use the same handler API.** There is no second lane.
6. **Scope inheritance is visibility- and namespace-aware.** Public/shared uploads carry the active
   `organization_id / project_id / task_id` in `metadata.scope`; personal uploads do not, and the
   `Shared Assets/**` / `Private Assets/**` library namespaces never inherit regardless of
   visibility. **`capture-uploader` deliberately combines `inheritActiveScope: true` with `personal`
   visibility** — the org id in `Captures/<orgId>/…` is *filing*, not access, and is what keeps the
   folder collision-free under the server's one-folder-path-per-user constraint. Do not "fix" it.
7. **Signed URLs are private playback credentials, never share links.** `shareableMediaUrl` fails
   closed on both AWS signing dialects; share/copy actions emit an internal viewer URL, a durable
   CDN URL, or a canonical `/share/{token}`.
8. **A successful upload returns `UploadedNormalizedFile`**, whose `fileId` is required at runtime
   and compile time. Agent attachment flows hand that identity to `MediaRef`; an opaque share URL is
   display/recovery data, never the primary locator.
9. **Vault credential attachments are not cloud files.** They must never enter `files.files` or
   expose an object-store URL — the one sanctioned transport is `../vault/vaultAttachmentTransport.ts`
   with the explicitly selected `X-Organization-Id`. A specialized byte boundary, not permission to
   hand-build another flow.
10. **Transport is decided in `resolveUploadTransport` only.** ≥ `TUS_TRANSPORT_THRESHOLD_BYTES`
    (80 MB) → TUS, 16 MiB chunks; below → buffered multipart. **There is no presigned transport.**
    TUS resume URLs live in IndexedDB `mtx-tus-urls` — NEVER the recorder chunk journal.
    **Do not claim live TUS verification until a real browser upload (preflight, resume,
    lost-final-response, token refresh) passes against the deployed server** — today it is unit-tested
    only.
11. **`useRemintableSrc` is for a raw URL string only.** With a `file_id`/`MediaRef`, use
    `useFileSrc` / `<InlineMediaRef>`, which mint up front.
12. **A canvas must not use the bare `/files/{id}/download` URL as `<img src>`** — an element cannot
    attach the bearer token, and a display/CDN URL is not a promise of CORS-readable pixels. Route
    `crossOrigin` consumers through `useFileBlob` and render a same-origin `blob:` URL.
13. **The blob-cache service worker is the platform's ONLY service worker**, registered at scope `/`
    (it also carries education offline study). A second registration would replace it and silently
    kill transparent media serving.
14. **Never a direct `Files.uploadFile`** outside `handler/` and `upload/`.

## Deliberately not owned here

Provider-shape conversion (Anthropic/OpenAI/Google) stays server-side — the handler emits canonical
`MediaBlock` only. Sharp/OCR/Whisper transforms are server-side. The IndexedDB audio safety store
(`features/audio/services/audioSafetyStore.ts`) is a separate crash-recovery concern. Code-editor
multi-file state is its own state machine.

Known non-handler byte paths, documented so they are not mistaken for bypasses:
`features/podcasts/.../AssetUploader.tsx` (server-side transcode + frame extraction) and
`features/research/hooks/useResearchApi.ts` (explicit separate API surface).

## Upload failure playbook

Error subclasses from `handler/errors`: `FileUploadError` (generic, wraps the backend message) ·
`FileAccessDeniedError` (auth/RLS) · `FileExpiredError` (signed URL aged out — retry) ·
`FileNotFoundError` · `FileDeletedError` (in trash) · `ShareLinkInvalidError` (410) ·
`ExternalFetchError`.

Message patterns: `Failed to fetch` → backend unreachable (CORS/network/down) · `HTTP 401` → JWT
missing or expired · `HTTP 413` → over the tier's file-size cap · `HTTP 403` → RLS/permissions ·
`cloud_sync_unavailable` → the files base URL env is not set · `File uploaded but share link
couldn't be created` → the upload succeeded and only the post-upload share create failed.

Then confirm the service is up: `curl https://files.matrxserver.com/files-service/health`, or use
`/demos/cloud-files-debug`, which shows the active URL + JWT and fires raw fetches.
