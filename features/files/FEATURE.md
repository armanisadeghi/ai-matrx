# features/files — local mechanics

> **Cross-repo system-of-record:** `/Users/armanisadeghi/code/common-docs/systems/media/file-service/STATE.md` — read it before touching this feature in ANY repo. The client wire contract is `WIRE_CONTRACT.md`, the platform-wide handling laws are `FILE_HANDLING_LAWS.md`, the per-file-type capability inventory is `FILE_SURFACES.md`, and open work is `HANDOFF.md`, all in that same directory. Do not restate any of them here.

Frontend-local rules and maps only. If you're modifying anything in this feature, update this file
in the same change.

## Where things are

| Concern                                  | Location                                                                                                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Types (the ONE source)                   | `types.ts`                                                                                                                                                                                              |
| Table column allowlist + client          | `filesDb.ts` (`FILES_TABLE_COLUMNS`)                                                                                                                                                                    |
| Redux                                    | `redux/` — slice `cloudFiles`, `thunks.ts`, `virtual-thunks.ts`, `request-ledger.ts`, `realtime-middleware.ts`                                                                                          |
| Realtime attach/detach                   | `providers/CloudFilesRealtimeProvider.tsx`                                                                                                                                                              |
| Direct-Supabase writes                   | `api/direct.ts`; share links via `utils/permissions/shareLinks.ts`                                                                                                                                      |
| Universal file handler                   | `handler/` (see `handler/FEATURE.md`)                                                                                                                                                                   |
| Upload transport policy                  | `upload/cloudUpload.ts` (`resolveUploadTransport`), `upload/tusUpload.ts`                                                                                                                               |
| Core components                          | `components/core/` — FileTree, FileList, FileMeta, FilePreview, FileAcquisitionActions, FileBreadcrumbs, FileActions, FileContextMenu, ShareLinkDialog, PermissionsDialog. Media renderers (InlineMediaRef, MediaThumbnail, FileIcon, FileUploadDropzone) come from `@ai-matrx/media/react`, wired via `media-client/` |
| Surfaces (6)                             | `components/surfaces/` — PageShell, WindowPanelShell, MobileStack, EmbeddedShell, DialogShell, DrawerShell                                                                                              |
| The one file picker                      | `features/resource-manager/resource-picker/FilesResourcePicker.tsx`, hosted by `components/pickers/CloudFilesPickerHost`                                                                                |
| Previewer registration + dispatch adapter | `components/core/FilePreview/PreviewerSwitch.tsx` (bodies: `@ai-matrx/media/viewers`)                                                                                                                                                    |
| File-type registry                       | `utils/file-types.ts` (`FILE_TYPES`, `getFilePreviewProfile`, `listSupportedTypes`)                                                                                                                     |
| Route ownership (which host answers)     | `lib/api/service-routing.ts` (`STANDALONE_FILE_ROUTE_RULES`, `resolveFilesBaseUrl`)                                                                                                                     |
| URL state                                | `utils/url-state.ts`, `utils/server-search-params.ts`                                                                                                                                                   |
| Routes                                   | `app/(a)/files/` (`/files`; `/cloud-files/*` 308s here). Public shares: `app/(public)/s/[token]/`                                                                                                       |
| Blocks (media rendering — NOT this node) | `blocks/`, `blocks/image/UNIFIED_IMAGE_BLOCK.md`                                                                                                                                                        |
| Webhooks / event spine (NOT this node)   | `webhooks/FEATURE.md`                                                                                                                                                                                   |

## Invariants — do not violate

1. **`types.ts` is the only type source.** Import `@/features/files/types` directly; never duplicate
   types in subfolders, never declare `CloudFile`/`CloudFolder` inline.
2. **`storage_uri` is BANNED on the client.** Never select it, never model it. The column grant is
   REVOKEd, so `select("*")` ERRORS — every read uses `FILES_TABLE_COLUMNS` from `filesDb.ts`.
   ESLint enforces.
3. **No direct object-store SDK calls, ever.** The FE never sees an AWS SDK; all S3 work is
   server-side.
4. **Every file flow goes through the universal handler** — `fileHandler.use(source).as(target)`.
   Direct construction of media blocks is banned. There is one upload primitive
   (`useFileUpload()` / `fileHandler.upload(...)`); custom retry/queue layers around it are wrong.
5. **`fileId` is identity.** Never cache by `file_path` — paths move with renames.
6. **No `Set` in Redux state** — use `FieldFlags<K>` from
   `features/agents/redux/shared/field-flags.ts` (imported, never duplicated). No local `useState`
   for file data; no second Redux slice for files — extend `cloudFiles`.
7. **Mutations are optimistic + rollback**, never spinner-then-refetch, and every REST write ships a
   `requestId` registered in `redux/request-ledger.ts` — that is what lets realtime middleware ignore
   echoes of our own writes.
8. **Reads hit Supabase directly, never Python.** Adding a `getJson('/files/...')` for plain table
   data is a regression.
9. **Renderable media identity and bytes are centrally cached.** Keep `fileId` as identity; use
   `useFileAsset` to select a persisted display variant and the shared `useFileBlob` cache whenever
   private image pixels must not depend on the file-session cookie. `FilePreview`,
   `MediaThumbnail`, and picker thumbnails all consume that same asset/variant identity; HEIC/HEIF
   never binds its original bytes to `<img>`. A successful upload seeds the original bytes under
   its new file ID before the local preview is retired. Never call a file URL endpoint directly
   from image or thumbnail UI. A revoked blob-backed element delegates one bounded re-read to
   `@ai-matrx/data/files` through `recoverBlobLoadError`; the host cache supplies only its existing
   per-file `invalidate` identity door and never implements retry policy.
10. **Dialog on desktop, Drawer on mobile**, branched in the surface. `dvh` not `vh` under
    `app/(a)/files/`; `pb-safe` on fixed bottoms; 16px inputs. Tablet list rows reserve space for
    a visible 44px **More** control; mobile rows expose a 44px **Actions** control plus the canonical
    ContextMenuV3 long-press path. File/folder row menus keep Rename, Move, and Delete parity;
    picker and action-dialog controls are 44px at tablet/mobile widths. Row activation ignores
    portal-rendered menu events. No
    `window.alert/confirm/prompt`.
11. **Core components never know their host** — no imports from `app/`,
    `features/window-panels/`, or `useIsMobile`; no core component opens a Dialog directly.
    Surfaces read `useIsMobile()` once near the root and branch there.
12. **`FilesResourcePicker` is the ONLY file picker.** `AssociationPickerSheet`'s bare list,
    `FilePicker.tsx`/`useFilePicker`, and rag's `CldFilePicker` were deleted — never rebuild any of
    them. `FilePickerWindow` MUST be `next/dynamic`-imported (`lazy-bundle-guard` asserts it).
13. **A file picker must show selectable image pixels, with bounded work.** Never fix request volume
    by replacing image thumbnails with generic icons; lower the mounted page size instead.
14. **Adding a previewer = register it in `PreviewerSwitch`**, never a per-site dynamic import.
    Since media 0.4.1 the dispatcher, the kind vocabulary and the text / code / SVG / HTML /
    generic viewer BODIES live in `@ai-matrx/media/viewers`; `PreviewerSwitch` is the app's
    `registerMediaViewer` list for the engines a package cannot ship (PDF.js via
    `features/pdf`, the markdown stack, SheetJS, the Office extractor, the image/video/audio
    viewers bound to app domain systems) plus the Prism highlighter. **A registered viewer is
    a COMPONENT — never call it, mount it.** Anything unregistered renders the package's
    announcing default, which names the missing engine and still offers download; a dead pane
    is not a reachable state.
15. **Never write `unnest(<stable fn>)` or `= ANY (<stable fn>)` in an RLS policy** — route the array
    through `iam.unnest_uuids`. Guard: `pnpm check:db-guards`.
16. **A listing surface never uses `is_discoverable_for`/`has_access_for` as its row gate;**
    access-by-id never uses `is_listable_for`.
17. **No barrel.** `features/files/index.ts` is gone and ESLint bans `@/features/files` (exact);
    `cache/`, `virtual-sources/`, `upload/`, `providers/`, `services/`, `api/` stay ring-fenced.
18. **Docs are updated in the same change as the code.** Stale docs cascade across parallel agents.
19. **`FileAcquisitionActions` is the one source chooser.** Local file/folder inputs, existing-Matrx-Files selection, and Google Drive connect/import belong there; hosts select a presentation and disable sources with props. A menu host keeps its chooser mounted until local selection returns, then closes through `onLocalSelectionComplete`. Drag/drop and paste remain host gestures, but their resulting `File[]` must enter the same upload callback. Never synthesize an input, query a page-wide file input, or fork a partial source menu.
20. **A selectable file thumbnail is `SelectableFileThumbnail`.** Its thumbnail opens the canonical File Preview WindowPanel, its independent 44px control changes selection, and `FileRightClickMenu` supplies the universal menu. Hosts provide labels/icons and the selection callback; they never rebuild any of those three behaviors.
21. **`get_user_file_tree` is an authenticated Data API door.** Keep its exact signature in
    `platform.client_callable_door` before granting `authenticated`; keep `anon` and `PUBLIC`
    revoked. `migrations/restore_get_user_file_tree_client_door.sql` asserts both halves.
22. **File Copy for AI starts with `<file_ref>`.** `fileInfoAgentPayload` carries `file_id` plus a
    permanent `durable_url` or `null`; `mediaSafe` replaces signed URLs and raw storage paths with
   explicit omission notes. Human Copy remains `fileInfoHumanSummary`.
23. **Duplicate decisions are durable intents.** `Use existing` returns the canonical id,
    `Overwrite` targets the existing path, `Skip` writes nothing, and `Make a copy` sends
    `force_new_copy` plus its reason. A renamed optimistic row backed by the original id is never a
    copy.

## Local commands

`pnpm type-check` · `pnpm check:db-guards` · `pnpm check:access-errors` · `pnpm check:doctrine` ·
`pnpm sync-types`. Diagnostic harness for upload/backend reachability: `/demos/cloud-files-debug`.

`app/(core)/files/` routes additionally follow the core route rules — SSR-first
and zero layout shift, with Cache Components disabled by repository doctrine.

## Change log

- **2026-09-01 — Newly persisted private media self-heals a revoked first object URL.** The
  package-owned element recovery asks data/files to invalidate only that file and re-read its
  durable ref once; a second failure is terminal and reaches Error Inspector. The host's blob
  cache wiring now exposes its existing `invalidate(fileId)` door without adding host policy.

- **2026-09-01 — Make a copy creates a durable duplicate row.** The duplicate dialog carries a
  per-file `force_new_copy` decision through the thunk and multipart API; checksum-identical bytes
  now produce a distinct id linked to the canonical row instead of renaming an optimistic alias.
- **2026-08-31 — Organization admission lives at the files transport.** `POST /files/session`
  and every other authenticated files request is organization-admitted, but the mint fires at boot
  (`AuthSessionWatcher`, the moment an authenticated identity exists) and again on every
  private-media retry — all before app context hydrates. One user produced ~511
  `[AUTH][REJECT] POST /files/session` rejections in ~35 minutes (server app_log family
  `40b5275c-812c-426a-bf73-d8debb43dd78`, 2026-08-31T00:37–01:11Z). The first repair wrapped the
  client's public `ensureSession` and guarded exactly one door — the package mints internally too
  (`recoverLoadError` → `session.ensure({force:true})`), so 124 more rejects landed 23 minutes
  after it shipped. Admission now sits in `filesFetch`, the ONE fetch boundary this host injects,
  so minting, metadata, bytes, shares and uploads cannot drift apart: no `Authorization` header →
  sent untouched (the guest/`<img>` lanes the server admits org-less); `Authorization` present →
  wait for the bootstrap (shared `lib/api/organization-admission` kernel), then bind the
  organization; bootstrap authoritatively finished with none → refused here, once and loudly,
  instead of a guaranteed 400 at the gate. Nothing is guessed; the posture stays fail-closed, minus
  the burned requests. `AuthSessionWatcher` re-mints when the selection arrives or changes. Covered
  by `media-client/client.organization-context.test.ts`; proven live on 2026-08-31 against the
  production backend — both session bases mint `200` carrying the hydrated organization.
- **2026-08-30 — Google Picker stays interactive above Files windows.** The provider injects its
  modal at z-index 1000/1001, below Matrx floating windows; global picker-layer overrides now place
  its scrim and dialog at the application ceiling so ordinary clicks reach Drive items and actions.
- **2026-08-30 — Menu-hosted uploads survive the native chooser.** Local file/folder actions keep the dropdown content mounted until selection returns, then close through the host callback; this prevents Files **New** from silently discarding every chosen file.
- **2026-08-30** — **C9 collapse: `media-client/client.ts` is now a thin construction over
  `@ai-matrx/data/files` 0.4.1** (436 → 202 lines, all injection per C22). Absorbed into the
  package and DELETED here: ref normalization + byte-endpoint promotion (QA F2), the
  resolution/transport decisions, blob in-flight dedup, the ONE retry contract, the
  share-link door (REST against `/files/{id}/share-links` — the Redux share-link thunks no
  longer sit in the media path), `shareableUrlNoMint`, error classification, and the
  session tracker (`handler/session.ts` DELETED; consumers use
  `mediaFilesClient.ensureSession()`). What the host injects: Redux credentials, the two
  byte bases, the Redux file store as the metadata port (`ensureCloudFileFields` +
  `selectFileById`), the 3-tier blob cache, the fileHandler TUS lane as
  `largeUploadTransport`, `requestUpload` as the batch door, and the Error Inspector
  diagnostics sink. `lib/media/our-file-sources.ts` collapsed onto the package recognizer
  (keeps only the marker pre-gate + the host `FileSource` mapping);
  `lib/media/{durability,signed-url}.ts` re-export the package classifiers (the loud
  violation report stays host-side). Package 0.4.1 absorbed two census gaps:
  `parentFolderId` batch-door routing in `upload()` and `fileNameFromUrl`. Host smoke:
  `media-client/client.test.ts` runs the REAL package through the app construction.
- **2026-08-30** — **Media wave 2 (M6 + M7 + M-SHARE hookup).** The unified image/video
  block renderers resolve through `@ai-matrx/media`: `blocks/useBlockMediaSource.ts`
  (over `useMediaResolution` + `useMediaLoadRecovery`) replaces the DELETED divergent
  retry twins `image/useUnifiedImageUrl.ts` / `video/useUnifiedVideoUrl.ts` — the
  client's ONE retry contract (session refresh → same-URL retry once → terminal) is now
  the only load-recovery path. Share popovers: `blocks/BlockSharePopover.tsx` mounts the
  package share body (`@ai-matrx/media/share` `MediaSharePopover`) with the app's
  `ShareLinkDialog` behind `manageLinks` and `AccessSummaryPanel` in the `AccessSummary`
  slot; `image/ImageSharePopover.tsx` + `video/VideoSharePopover.tsx` DELETED. The host
  `MediaActionsPort.SharePopover` slot is filled (lazily, `media-client/share-slot*.tsx`)
  so package toolbars/lightboxes open the same share body. `MediaClient.shareableUrl` now
  implements the full public-link door: permanent CDN URL for public files, else
  reuse-or-mint a no-expiry read-only share link (the retired popovers' exact two paths);
  the quick COPY port action uses the new no-mint variant. The image lightbox is the
  package `MediaLightbox` (video keeps the host lightbox — the package shell has no
  `autoPlay` passthrough yet). FilePreview + Image/Video previewers moved onto
  `useMediaResolution`/`useMediaLoadRecovery`; `handler/hooks/useFileAs.ts` (+ its
  unreferenced wrappers `useFileDownloadUrl`/`useFileMediaBlock`) DELETED. Context menus,
  drawers, hover-toolbar action sets, and agent `SourceFeature` wiring stay host-side by
  design.
- **2026-08-30 — The viewer bodies and the next/image wrapper moved into `@ai-matrx/media`
  (0.4.1).** `TextPreview`, `CodePreview`, `SvgPreview`, `HtmlPreview` and `GenericPreview`
  are DELETED — their bodies are the package's `/viewers` entry, and `PreviewerSwitch` is now
  the app's engine-registration module plus a thin adapter that keeps its three call sites'
  props. New host-side seams: `PrismCodeHighlighter.tsx` (the ~150KB engine the package must
  not ship) and a `HostHtmlViewer` that feeds the `FileViewerControlsProvider` rail into the
  package viewer's `markupControls`. The asset-lane URL (hero/cover variant, authenticated
  blob for a private image) survives as a host-only context read by the app's own
  image/video/audio/PDF viewers — the package's own bodies always resolve through the
  MediaClient, which means a private SVG now renders where it previously showed an endless
  spinner. `media-client/ports.tsx` lost its 35-line `next/image` wrapper and its four
  handler casts: `ImageComponent: NextMediaImage` from `@ai-matrx/media/next`. Three defects
  fixed in the package during the port (a user-visible fuchsia debug ring on the generic
  card, an unguarded `blob.text()`, `formatFileSize` claiming "0 B" for a missing size) —
  see the package CHANGELOG. **The whole `features/pdf` tree stays host-owned** and rides the
  `registerMediaViewer("pdf", …)` seam; so do markdown, spreadsheet and Office.
- **2026-08-30 — File Info Copy for AI leads with durable identity.** The payload starts with
  `<file_ref>`, excludes signed URLs and raw storage paths from every block, and leaves human Copy
  unchanged.
- **2026-08-29** — **C20 media swap.** The render surface moved to `@ai-matrx/media`:
  `InlineMediaRef`, `MediaThumbnail`, `FileIcon`, `FileUploadDropzone`/`UploadProgressList`
  now import from `@ai-matrx/media/react`; the originals are DELETED. The strangler
  `MediaClient` adapter over the handler lives in `media-client/` (client + host ports +
  `MediaHostProvider`, mounted once in `app/Providers.tsx`). `handler/hooks/{useFileSrc,
  useDurableSrc,useFileBlob}.ts` are deleted — consumers use `useMediaResolution` /
  `useMediaLoadRecovery` from `@ai-matrx/media/core`. The handler itself (fileHandler,
  session, upload transports, blob cache, `useFileAs`/`useFileUpload`) stays the engine;
  `useFileAs` retires with the wave-2 block/preview swap.

- **2026-08-29 — File-tree reads require a matching browser session.** The
  canonical tree thunk now verifies that supabase-js has an access token for
  the same user Redux requested before invoking `get_user_file_tree`. This
  closes the hydration/sign-out race where server-seeded Redux identity could
  issue the authenticated-only RPC as `anon` and report a false 42501.

- 2026-08-29 — Registered `get_user_file_tree` as an intentional client-callable definer door so
  the database-wide grant guard preserves signed-in Files and Vault enumeration while anon remains
  denied.
- 2026-08-29 — File preview tab and action rails now scroll horizontally at constrained mobile widths; tab/action labels remain intact instead of collapsing into one-character columns. `FileResourceChip` now gives the universal file menu a real DOM trigger, so nested message-level menus cannot steal file-chip right clicks. Embedded file menus emit a complete canonical Files scope, eliminating the menu guard error caused by declaring always-available browser values without supplying them.

- **2026-08-29 — File selection becomes a reusable preview/menu primitive.**
  `SelectableFileThumbnail` composes the existing metadata hydration, `MediaThumbnail`, File Preview
  WindowPanel opener, universal `FileRightClickMenu`, and a distinct 44px selection control. Product
  Capture is its first consumer. ESLint now blocks resolving an owned file ID to a browser URL and
  fetching that URL back for bytes; callers ask `fileHandler` for `blob`/`array_buffer` directly.
- **2026-08-29 — ID-backed media hydrates only the canonical fields it lacks.** Message/API hints
  seed the shared `cloudFiles` record, `_loadedFields` distinguishes absent values from loaded
  nulls, and concurrent preview/chip consumers share a bounded direct-Supabase read. Private image
  pixels use the authenticated blob cache automatically; only explicitly public files use their
  permanent CDN URL.
- **2026-08-28 — Image preview and thumbnail surfaces converge on the canonical asset variant.**
  `useFileAsset` now exposes the concrete `primaryVariant`; `FilePreview` renders non-public image
  bytes through the existing bearer-authenticated blob cache, and `MediaThumbnail` accepts a
  browser-safe derived primary when an older HEIC/HEIF master predates baseline thumbnails. The
  picker deleted its local `<img>` path and now reuses `MediaThumbnail`.
- **2026-08-28 — Attachment thumbnails retain their pixels through upload, send, and reload.** The
  canonical upload path now seeds the authenticated byte cache under the committed `fileId` before
  callers retire their local object URL. `MediaThumbnail` preserves thumbnail-variant `file_id`
  identity and uses bearer-authenticated blob bytes for non-public media, while public files retain
  their permanent CDN path. Inline uploads also preserve the user-selected filename instead of
  deriving a display label from an opaque durable URL. The bounded 12-item `FilesResourcePicker`
  window again resolves actual image thumbnails, and `FileResourceChip` resolves by durable ID even
  before its Redux row is present, covering composer attachments, submitted message chips, hover
  previews, file grids, and every picker consumer without a parallel renderer.
- **2026-08-28 — Google Drive joins the canonical file-acquisition path.** `FileAcquisitionActions`
  now owns local files, local folders, existing Matrx Files, and auth-aware Google Drive import in
  menu, button, inline, and mobile-icon presentations. `/files`, onboarding, mobile, the shared
  dropzone, and the attachment upload strip consume it; former synthetic inputs, the global input
  query, and surface-local menus were removed. Selected Drive blobs and exportable Workspace files
  become browser `File` objects, then pass through the unchanged canonical Matrx upload pipeline.
- **2026-08-27 — ID-backed mobile media can opt into the authenticated blob cache.** Persisted
  thumbnails that must survive browsers blocking the cross-site file-session cookie use the
  existing `crossOrigin` lane; ordinary previews retain the canonical element transport, and
  external URLs are unchanged.
- **2026-08-27 — PDF Edit reaches the canonical annotation surface on every viewport.** The
  Preview action routes PDFs to Analysis Studio, while the File tab strip and Files/Studio PDF
  annotation controls keep the tablet/mobile 44px touch floor.
- **2026-08-27 — Tablet file actions regain Move and the 44px dialog floor.** The shared file menu
  now opens its canonical picker without requiring a host callback; Rename/Delete actions remain
  44px at tablet/mobile widths for both files and folders.
- **2026-08-27 — Expected asset-envelope access refusals stay out of the incident queue.** A
  `403 permission_denied` or `404 file_not_found` from `GET /files/{id}/asset` remains typed UI
  access-state control flow; genuine asset endpoint faults are still captured.
- **2026-08-27 — Picker footer actions meet the 44px touch floor.** Cancel and confirm controls in
  the shared file/folder picker now keep the same 44px minimum height in Dialog and Drawer hosts.
- **2026-08-27 — Mobile row Rename actions open the canonical editor.** The mobile Files surface
  mounts the shared rename-event host and presents its file/folder editor as a Drawer; desktop
  keeps the existing dialog.
- **2026-08-26 — Row menus no longer activate their file or folder.** Table rows reject synthetic
  clicks from portal-rendered dropdown and context-menu actions before running row activation.
- **2026-08-26 — Files certification no longer asks for an invented agent binding.** The
  `matrx-user/files` readiness note now states the actual disclosure boundary: Files runs no fixed
  AI job, so its remaining browser certification covers the responsive surface itself and must not
  create an agent role or binding merely to manufacture proof.
- **2026-08-26 — Durable file URL contract adopted.** The universal file handler now resolves
  private and public bytes from the live `FileRecord.url` / `download_url` contract instead of the
  retired `/files/{file_id}/url` signed-URL endpoint. Existing compatibility helpers retain their
  names while caching the durable authenticated locator and no longer inventing a frontend wire
  type for the removed response schema.
- **2026-08-26 — Tablet row actions stay on-screen.** File and folder identity cells now truncate
  inside a bounded tablet name column while the 44px **More** control stays fixed-width and visible.
- **2026-08-25 — LUI-007 `/files/all` static surface pass.** Both responsive
  branches now register the canonical `matrx-user/files` read scope (desktop
  remains the sole write-handler host because mobile does not render those
  reversible controls). Initial tree loading and failures render contextual
  skeleton/error/retry states instead of a false empty folder. Desktop and
  mobile file/folder rows, search, section, list, and active preview now carry
  `data-surface-value` anchors. Row-menu move/duplicate/paste failures no longer
  disappear, and the feature admin map reflects the real catch-all/detail
  paths, current coming-soon routes, canonical shells, and window panels.
