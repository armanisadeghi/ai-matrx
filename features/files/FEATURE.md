# features/files — local mechanics

> **Cross-repo system-of-record:** `/Users/armanisadeghi/code/common-docs/systems/media/file-service/STATE.md` — read it before touching this feature in ANY repo. The client wire contract is `WIRE_CONTRACT.md`, the platform-wide handling laws are `FILE_HANDLING_LAWS.md`, the per-file-type capability inventory is `FILE_SURFACES.md`, and open work is `HANDOFF.md`, all in that same directory. Do not restate any of them here.

Frontend-local rules and maps only. If you're modifying anything in this feature, update this file
in the same change.

## Where things are

| Concern                                  | Location                                                                                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Types (the ONE source)                   | `types.ts`                                                                                                                                                                      |
| Table column allowlist + client          | `filesDb.ts` (`FILES_TABLE_COLUMNS`)                                                                                                                                            |
| Redux                                    | `redux/` — slice `cloudFiles`, `thunks.ts`, `virtual-thunks.ts`, `request-ledger.ts`, `realtime-middleware.ts`                                                                  |
| Realtime attach/detach                   | `providers/CloudFilesRealtimeProvider.tsx`                                                                                                                                      |
| Direct-Supabase writes                   | `api/direct.ts`; share links via `utils/permissions/shareLinks.ts`                                                                                                              |
| Universal file handler                   | `handler/` (see `handler/FEATURE.md`)                                                                                                                                           |
| Upload transport policy                  | `upload/cloudUpload.ts` (`resolveUploadTransport`), `upload/tusUpload.ts`                                                                                                       |
| Core components                          | `components/core/` — FileTree, FileList, FileIcon, FileMeta, FilePreview, FileUploadDropzone, FileBreadcrumbs, FileActions, FileContextMenu, ShareLinkDialog, PermissionsDialog |
| Surfaces (6)                             | `components/surfaces/` — PageShell, WindowPanelShell, MobileStack, EmbeddedShell, DialogShell, DrawerShell                                                                      |
| The one file picker                      | `features/resource-manager/resource-picker/FilesResourcePicker.tsx`, hosted by `components/pickers/CloudFilesPickerHost`                                                        |
| Previewer dispatch                       | `components/core/FilePreview/PreviewerSwitch.tsx`                                                                                                                               |
| File-type registry                       | `utils/file-types.ts` (`FILE_TYPES`, `getFilePreviewProfile`, `listSupportedTypes`)                                                                                             |
| Route ownership (which host answers)     | `lib/api/service-routing.ts` (`STANDALONE_FILE_ROUTE_RULES`, `resolveFilesBaseUrl`)                                                                                             |
| URL state                                | `utils/url-state.ts`, `utils/server-search-params.ts`                                                                                                                           |
| Routes                                   | `app/(a)/files/` (`/files`; `/cloud-files/*` 308s here). Public shares: `app/(public)/s/[token]/`                                                                               |
| Blocks (media rendering — NOT this node) | `blocks/`, `blocks/image/UNIFIED_IMAGE_BLOCK.md`                                                                                                                                |
| Webhooks / event spine (NOT this node)   | `webhooks/FEATURE.md`                                                                                                                                                           |

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
9. **Renderable image/file URLs are centrally cached** — use `useFileSrc` (or
   `fileHandler.use(...).as({kind:"html_src"})` outside React). Never call `/files/{id}/url` directly
   from image or thumbnail UI.
10. **Dialog on desktop, Drawer on mobile**, branched in the surface. `dvh` not `vh` under
    `app/(a)/files/`; `pb-safe` on fixed bottoms; 16px inputs. Tablet list rows reserve space for
    a visible 44px **More** control; mobile rows expose a 44px **Actions** control plus the canonical
    ContextMenuV3 long-press path. No `window.alert/confirm/prompt`.
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

## Local commands

`pnpm type-check` · `pnpm check:db-guards` · `pnpm check:access-errors` · `pnpm check:doctrine` ·
`pnpm sync-types`. Diagnostic harness for upload/backend reachability: `/demos/cloud-files-debug`.

`app/(core)/files/` routes additionally follow the core route rules — SSR-first
and zero layout shift, with Cache Components disabled by repository doctrine.

## Change log

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
