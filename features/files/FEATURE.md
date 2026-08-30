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
| Previewer dispatch                       | `components/core/FilePreview/PreviewerSwitch.tsx`                                                                                                                                                       |
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
   from image or thumbnail UI.
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
14. **Adding a previewer = edit `PreviewerSwitch`**, never a per-site dynamic import.
15. **Never write `unnest(<stable fn>)` or `= ANY (<stable fn>)` in an RLS policy** — route the array
    through `iam.unnest_uuids`. Guard: `pnpm check:db-guards`.
16. **A listing surface never uses `is_discoverable_for`/`has_access_for` as its row gate;**
    access-by-id never uses `is_listable_for`.
17. **No barrel.** `features/files/index.ts` is gone and ESLint bans `@/features/files` (exact);
    `cache/`, `virtual-sources/`, `upload/`, `providers/`, `services/`, `api/` stay ring-fenced.
18. **Docs are updated in the same change as the code.** Stale docs cascade across parallel agents.
19. **`FileAcquisitionActions` is the one source chooser.** Local file/folder inputs, existing-Matrx-Files selection, and Google Drive connect/import belong there; hosts select a presentation and disable sources with props. Drag/drop and paste remain host gestures, but their resulting `File[]` must enter the same upload callback. Never synthesize an input, query a page-wide file input, or fork a partial source menu.
20. **A selectable file thumbnail is `SelectableFileThumbnail`.** Its thumbnail opens the canonical File Preview WindowPanel, its independent 44px control changes selection, and `FileRightClickMenu` supplies the universal menu. Hosts provide labels/icons and the selection callback; they never rebuild any of those three behaviors.
21. **`get_user_file_tree` is an authenticated Data API door.** Keep its exact signature in
    `platform.client_callable_door` before granting `authenticated`; keep `anon` and `PUBLIC`
    revoked. `migrations/restore_get_user_file_tree_client_door.sql` asserts both halves.
22. **File Copy for AI starts with `<file_ref>`.** `fileInfoAgentPayload` carries `file_id` plus a
    permanent `durable_url` or `null`; `mediaSafe` replaces signed URLs and raw storage paths with
    explicit omission notes. Human Copy remains `fileInfoHumanSummary`.

## Local commands

`pnpm type-check` · `pnpm check:db-guards` · `pnpm check:access-errors` · `pnpm check:doctrine` ·
`pnpm sync-types`. Diagnostic harness for upload/backend reachability: `/demos/cloud-files-debug`.

`app/(core)/files/` routes additionally follow the core route rules — SSR-first
and zero layout shift, with Cache Components disabled by repository doctrine.

## Change log

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
