# Impact inventory — state, hooks, API client (the internal core)

**Scope:** the internal core of the file-handling consolidation. Inputs:
`features/file-handler/**` (22 files), `features/files/api/**` (11 files),
`features/files/redux/**` (9 files), `features/files/hooks/**` (15 files),
`features/files/types.ts`, `features/files/errors.ts` (NB: does not currently
exist — see Open Questions), `features/file-handler/errors.ts`,
`features/files/virtual-sources/**` (12 files), `features/files/utils/**`
(15 files), `features/files/upload/**` (5 files), and the
`types/python-generated/api-types.ts` Asset/MediaRef regeneration boundary.

**Out of scope (other agents own these):** all of `features/files/components/**`,
`features/files/providers/**`, `features/files/upload/UploadGuardHost*` (overlap
on file path — listed here only because the plan touches them), Next.js routes,
the new `features/files/cache/**` Service Worker + IDB layer.

---

## Summary

| Action | Count |
|---|---|
| DELETE | 22 |
| MODIFY | 12 |
| MOVE | 21 |
| SPLIT | 3 |
| KEEP | 13 |
| CREATE | 20 |
| **Total files touched in scope** | **91** |

Net file count for the internal core (file-handler 22 + files/{api,redux,hooks,upload,virtual-sources,utils,types,errors}): **89 → ~60** (≈30 % reduction in this slice; full directory-level reduction is 203 → ~80 once UI is rolled in).

---

## Final target shape (after collapse)

ASCII tree of `features/files/` for the parts owned by this inventory (matches
plan §6.2; component/cache/provider lines elided — those are other agents):

```
features/files/
├── index.ts                            ← public exports only
├── handler.ts                          ← MOVED from file-handler/handler.ts; use().as() removed
├── errors.ts                           ← MERGED from file-handler/errors.ts (NEW canonical file)
│
├── types/                              ← SPLIT from monolithic types.ts (+ file-handler/types.ts merged in)
│   ├── domain.ts                       ← CloudFile/Folder/Version/Permission/ShareLink + Asset/AssetVariant + MediaRef + NormalizedFile/FileSource/FileTarget
│   ├── api.ts                          ← regenerated wire types; ban hand-authored
│   └── ui.ts                           ← UiState, ColumnFilters, SelectionState, RuntimeMetadata, UploadState
│
├── client/                             ← REPLACES features/files/api/
│   ├── client.ts                       ← auth + request-id + idempotency-key + error mapping (slimmed from api/client.ts)
│   ├── requests.ts                     ← typed endpoint wrappers, generated boundary
│   └── tus.ts                          ← TUS client (NEW)
│
├── state/                              ← MOVED from features/files/redux/
│   ├── slice.ts                        ← + assetsByMasterId map
│   ├── selectors.ts                    ← + selectAssetByMasterId, selectVariantUrl
│   ├── thunks/                         ← SPLIT from redux/thunks.ts (1790 lines)
│   │   ├── files.ts
│   │   ├── folders.ts
│   │   ├── permissions.ts
│   │   ├── bulk.ts
│   │   └── upload.ts
│   ├── realtime.ts                     ← was redux/realtime-middleware.ts
│   ├── request-ledger.ts
│   ├── tree-utils.ts                   ← unchanged, MOVE
│   ├── virtual-thunks.ts               ← unchanged, MOVE (or fold under thunks/virtual.ts)
│   └── converters.ts                   ← MediaRef builders kept; ESLint-fenced
│
├── resolver/                           ← MERGED from file-handler/{resolver,intelligence,input,output,utils}
│   ├── normalize.ts                    ← was file-handler/input/normalize.ts
│   ├── resolve.ts                      ← was file-handler/resolver.ts
│   ├── access.ts                       ← was file-handler/intelligence/access.ts
│   ├── refresh.ts                      ← was file-handler/intelligence/refresh.ts
│   ├── magic-bytes.ts                  ← was file-handler/intelligence/magic-bytes.ts
│   ├── classify.ts                     ← was file-handler/utils/classify.ts
│   ├── prefer-locator.ts               ← was file-handler/utils/prefer-locator.ts
│   ├── python-base.ts                  ← was file-handler/utils/python-base.ts (URL minting)
│   └── target.ts                       ← was file-handler/output/target.ts
│
├── upload/
│   ├── upload.ts                       ← NEW single primitive (replaces cloudUpload + file-handler/upload + asset uploadAsset paths)
│   ├── checksum.ts                     ← MOVED from utils/checksum.ts
│   ├── duplicate-detect.ts             ← MOVED from utils/upload-duplicate-detect.ts
│   └── (UploadGuardHost*, uploadGuardOpeners — other agent)
│
├── hooks/                              ← THE 5
│   ├── useFile.ts                      ← NEW canonical (replaces useFileAsset, useSignedUrl, useFile/handler, useFileDocument)
│   ├── useFileSrc.ts                   ← thin wrapper (replaces useFileSrc/handler)
│   ├── useFileBlob.ts                  ← MERGE of files/hooks/useFileBlob.ts + file-handler/hooks/useFileBlob.ts
│   ├── useFileUpload.ts                ← NEW (collapses 5 paths)
│   └── useFileMutation.ts              ← NEW (covers rename/move/delete/restore/share/perms/metadata)
│
├── cache/                              ← OWNED BY ANOTHER AGENT; expiry-wheel + blob-lru land here from this inventory
│
├── virtual-sources/                    ← unchanged (all 12 files KEEP/MOVE in place)
└── utils/                              ← slim subset that remains; rest moves into resolver/upload/types
    ├── folder-conventions.ts           ← KEEP
    ├── format.ts                       ← KEEP
    ├── mime.ts                         ← KEEP
    ├── path.ts                         ← KEEP
    ├── icon-map.ts                     ← KEEP
    ├── file-types.ts                   ← KEEP (2090 lines, big static MIME table)
    ├── preview-capabilities.ts         ← KEEP
    ├── clipboard.ts                    ← KEEP
    ├── url-state.ts                    ← KEEP
    ├── server-cookies.ts               ← KEEP
    └── server-search-params.ts         ← KEEP
```

---

## `features/file-handler/` — entire directory, action by action

The entire directory ceases to exist after PR3. Every file either deletes,
moves, or merges into the destination tree above.

| File | Lines | Action | Destination / Notes |
|---|---:|---|---|
| `features/file-handler/FEATURE.md` | — | DELETE | Content folds into the consolidated `features/files/FEATURE.md` (other agent owns docs merge; flagged here for completeness). |
| `features/file-handler/handler.ts` | 107 | MODIFY then MOVE | → `features/files/handler.ts`. Drop the `use(source).as(target)` builder and the `HandlerHandle` class. New surface is `fileHandler.{ upload, mutate(fileId), resolve, refresh }`. |
| `features/file-handler/resolver.ts` | 223 | MOVE | → `features/files/resolver/resolve.ts`. Body largely unchanged; rename to `resolve.ts`; update imports for the new sibling paths. |
| `features/file-handler/upload.ts` | 261 | MERGE | Folds into `features/files/upload/upload.ts` along with `features/files/upload/cloudUpload.ts`. The single `upload()` primitive auto-selects buffered / presigned PUT / TUS. |
| `features/file-handler/types.ts` | 393 | MERGE into SPLIT | `FileSource`, `NormalizedFile`, `FileOrigin`, `FileCapabilities`, `FileMeta`, `FileLifecycle`, `FileScope`, `FileTarget`, `MediaBlock` → `features/files/types/domain.ts`. `UploadOpts`, `RagIngestSource` → `domain.ts`. `RenderedFor<T>` → `domain.ts`. The whole file disappears. |
| `features/file-handler/errors.ts` | 113 | MERGE | Folds into `features/files/errors.ts` (currently nonexistent — see Open Questions). All 7 error classes + `isS3ExpiredError` carry over. |
| `features/file-handler/hooks/useFile.ts` | 121 | DELETE | Replaced by the new canonical `features/files/hooks/useFile.ts`. New version reads `assetsByMasterId` first; the existing 121-line resolver-coupled implementation is incompatible. |
| `features/file-handler/hooks/useFileAs.ts` | 75 | DELETE | The `use().as()` chain is gone. Five call sites migrate to direct hook usage. |
| `features/file-handler/hooks/useFileBlob.ts` | 18 | MERGE | Folds into `features/files/hooks/useFileBlob.ts` (185 lines). The handler version is a stub delegating to `features/files/hooks/blob-cache.ts`; after merge there is one `useFileBlob` only. |
| `features/file-handler/hooks/useFileDownloadUrl.ts` | 26 | DELETE | Behavior subsumed by `useFile(ref, { target: "download" }).url`. 1 call site. |
| `features/file-handler/hooks/useFileMediaBlock.ts` | 20 | DELETE | Subsumed by `fileHandler.upload(...)` returning a MediaRef, or by `<InlineMediaRef>`. 1 call site. |
| `features/file-handler/hooks/useFileSrc.ts` | 18 | DELETE | Replaced by the new `features/files/hooks/useFileSrc.ts`. Callers migrate to `useFile(ref, { target: "render" }).url`. |
| `features/file-handler/hooks/useFileUpload.ts` | 77 | DELETE | Subsumed by the new canonical `features/files/hooks/useFileUpload.ts`. 22 call sites migrate (renames + arg shape change). |
| `features/file-handler/input/normalize.ts` | 510 | MOVE | → `features/files/resolver/normalize.ts`. Largest single move; the 16 input adapters survive verbatim. |
| `features/file-handler/intelligence/access.ts` | 121 | MOVE | → `features/files/resolver/access.ts`. |
| `features/file-handler/intelligence/expiry-wheel.ts` | 98 | MOVE | → `features/files/cache/expiry-wheel.ts` (owned by the cache agent; cross-listed here for ordering). |
| `features/file-handler/intelligence/magic-bytes.ts` | 103 | MOVE | → `features/files/resolver/magic-bytes.ts`. |
| `features/file-handler/intelligence/refresh.ts` | 49 | MOVE | → `features/files/resolver/refresh.ts`. |
| `features/file-handler/output/target.ts` | 272 | MOVE | → `features/files/resolver/target.ts`. |
| `features/file-handler/utils/classify.ts` | 35 | MOVE | → `features/files/resolver/classify.ts`. |
| `features/file-handler/utils/prefer-locator.ts` | 60 | MOVE | → `features/files/resolver/prefer-locator.ts`. |
| `features/file-handler/utils/python-base.ts` | 201 | MOVE | → `features/files/resolver/python-base.ts`. URL-minting helpers; will be shared with the upload primitive. |

**Totals for this dir:** 22 files in → 0 files at the original path. 7 DELETE, 9 MOVE, 1 MOVE+MODIFY (`handler.ts`), 2 MERGE-into-split (`types.ts`, `errors.ts`), 1 MERGE (`upload.ts`), 1 MERGE (`useFileBlob.ts`), 1 doc DELETE.

---

## `features/files/api/` — collapse to regenerated client

The 52 exported functions across 11 files collapse to ~7 thin wrappers in
`features/files/client/requests.ts` plus the HTTP plumbing in
`features/files/client/client.ts`. Wire-shape types come from
`types/python-generated/api-types.ts` (regenerated boundary).

| File | Lines | # exported fns | Action | Replaced by |
|---|---:|---:|---|---|
| `features/files/api/index.ts` | 16 | (re-exports) | DELETE | Barrel; not a real module. |
| `features/files/api/client.ts` | 703 | 14 | MODIFY then MOVE | → `features/files/client/client.ts`. Slimmed: keeps `newRequestId`, `resolveBaseUrl`, `buildHeaders`, error mapping, multipart, `uploadWithProgress`, `downloadBlob*`, `public*`. The 6 verb helpers (`getJson`, `postJson`, `patchJson`, `putJson`, `del`, `delJson`) consolidate into a single typed `request(...)` switch. |
| `features/files/api/files.ts` | 442 | 21 | DELETE | Replaced by `requests.ts` wrappers driven by generated types. 21 functions collapse to: `assetsRequest` (POST `/assets` bundled), `filePatch`, `fileDelete`, `fileSignedUrl`, `fileBulk`, `fileTree`, `fileDownload`, `fileSearch`. The bulk + search + rename-by-path + migrate-guest endpoints come along but lose their hand-typed signatures. |
| `features/files/api/assets.ts` | 248 | 7 | DELETE | Folded into single `assetsRequest` family in `requests.ts`; `uploadAsset` + `uploadAssetWithProgress` collapse into the `upload()` primitive. `getAsset`, `patchAsset`, `addAssetVariants`, `getAssetPresets` are the generated POSTs + PATCHes. |
| `features/files/api/folders.ts` | 110 | 5 | DELETE | `listFolders / createFolder / patchFolder / deleteFolder / bulkMoveFolders` → typed wrappers in `requests.ts`. |
| `features/files/api/permissions.ts` | 94 | 6 | DELETE | All 6 grant/revoke/list calls fold into the bundled `PATCH /files/{id}` (gap A.2). Only the standalone `list` calls remain as separate wrappers. |
| `features/files/api/share-links.ts` | 107 | 7 | DELETE | `createFileShareLink` / `createFolderShareLink` fold into the bundled POST/PATCH. `listFileShareLinks`, `listFolderShareLinks`, `deactivateShareLink`, `resolveShareLink`, `downloadSharedFile` remain as standalone wrappers. |
| `features/files/api/versions.ts` | 61 | 4 | DELETE | `listVersions / getVersion / downloadVersion / restoreVersion` → typed wrappers. |
| `features/files/api/groups.ts` | 79 | 5 | DELETE | `cld_user_groups` endpoints. Per plan §9 these are deferred; KEEP-as-wrappers in `requests.ts` but the standalone file goes. |
| `features/files/api/document-lookup.ts` | 109 | 3 | DELETE | `lookupFileDocument` is a `processed_documents` SELECT (not Python REST). MOVE to `features/files/state/processed-documents.ts` or fold into `useFileDocument` consolidation (now part of `useFileBlob`). |
| `features/files/api/server-client.ts` | 320 | 9 | DELETE | Per plan §6.3: "320 lines, no callers after Sharp deletion." Verified no production callers — all callers were API-routes that themselves get deleted in PR3. |

**Totals:** 11 files, 52 exported functions → 3 new files (`client.ts`,
`requests.ts`, `tus.ts`), ~7 endpoint wrappers + the HTTP primitives. This
is **the single largest reduction in PR3**.

---

## `features/files/redux/` — reshape + split

| File | Lines | Action | What changes |
|---|---:|---|---|
| `features/files/redux/slice.ts` | 1153 | MODIFY then MOVE | → `features/files/state/slice.ts`. Adds `assetsByMasterId: Record<string, Asset>`. New reducer cases for `assetUpserted`, `assetVariantUpserted`, `assetVariantRemoved`. Rest unchanged. |
| `features/files/redux/selectors.ts` | 531 | MODIFY then MOVE | → `features/files/state/selectors.ts`. Adds `selectAssetByMasterId`, `selectVariantUrl(masterId, variantKey)`, `selectAssetIsLoaded`. Existing 87 selectors carry over. |
| `features/files/redux/thunks.ts` | 1790 | SPLIT then MOVE | → `features/files/state/thunks/{files,folders,permissions,bulk,upload}.ts`. Mapping:<br>• `loadUserFileTree`, `reconcileTree`, `loadFolderContents`, `loadFileVersions`, `loadShareLinks`, `renameFile`, `moveFile`, `updateFileMetadata`, `deleteFile`, `restoreVersion`, `getSignedUrl` → `files.ts`<br>• `createFolder`, `updateFolder`, `deleteFolder`, `ensureFolderPath` → `folders.ts`<br>• `loadPermissions`, `grantPermission`, `revokePermission`, `createShareLink`, `deactivateShareLink` → `permissions.ts`<br>• `bulkDeleteFiles`, `bulkMoveFiles`, `bulkMoveFolders` → `bulk.ts`<br>• `uploadFiles`, `clearUploadEntry`, `migrateGuestToUser` → `upload.ts` |
| `features/files/redux/realtime-middleware.ts` | 509 | MODIFY then MOVE | → `features/files/state/realtime.ts`. New: variant-row UPDATE → patch `assetsByMasterId[parent].variants[key]` (plan §6.6). Existing request-ledger dedup unchanged. |
| `features/files/redux/request-ledger.ts` | 135 | MOVE | → `features/files/state/request-ledger.ts`. |
| `features/files/redux/converters.ts` | 425 | MOVE | → `features/files/state/converters.ts`. ESLint-fence (manual-MediaRef ban points HERE as the only allowed construction site for the 4 MediaRef builders). |
| `features/files/redux/tree-utils.ts` | 351 | MOVE | → `features/files/state/tree-utils.ts`. Pure helpers; no changes. |
| `features/files/redux/virtual-thunks.ts` | 456 | MOVE | → `features/files/state/thunks/virtual.ts` (or sibling file). 7 thunks: `attachVirtualRoots`, `loadVirtualChildren`, `renameAny`, `moveAny`, `deleteAny`, `writeAny`, `readAny`. |
| `features/files/redux/rag-thunks.ts` | 162 | DELETE | Per plan §6.3: "162 lines, moves to `features/rag/`." Single thunk `prefetchRagStatusesForFiles`; the rag-status selectors in `selectors.ts` stay (still keyed off `cloudFiles` slice). |

**Totals:** 9 files → 12 in destination (slice + selectors + realtime +
request-ledger + tree-utils + converters + 5 thunks + virtual). One DELETE
(rag-thunks), one big SPLIT (thunks), 7 MOVE/MODIFY+MOVE.

---

## `features/files/hooks/` and `features/file-handler/hooks/` — five canonical hooks

For every existing hook across both directories, the canonical replacement and
call-site count. Counts via `grep -rl '\\b<hook>\\b'` (excluding node_modules /
.next). Counts include the source file itself — subtract 1 for net call sites.

| Today | Lines | Call-site files | Canonical replacement | Migration style |
|---|---:|---:|---|---|
| `features/files/hooks/useSignedUrl.ts` | 106 | 12 | `useFile(ref, { target: "render" }).url` | Full rewrite of call sites: hook name + return shape change. 11 net call sites. |
| `features/files/hooks/useFileAsset.ts` | 154 | 5 | `useFile(ref)` (canonical hook reads `assetsByMasterId` directly) | Rename + return-shape swap. 4 net call sites. |
| `features/files/hooks/useFileDocument.ts` | 92 | 6 | `useFileBlob(ref)` (folded — was a thin doc-bytes wrapper) | Rename + selector swap. 5 net call sites. |
| `features/files/hooks/useFileBlob.ts` | 185 | 20 | `useFileBlob(ref)` (canonical) — same name; **merges** with file-handler version | KEEP and modify; one hook only. 19 net call sites unaffected. |
| `features/file-handler/hooks/useFileBlob.ts` | 18 | (counted above) | merged into canonical | Stub delegating; deleted file. |
| `features/file-handler/hooks/useFileSrc.ts` | 18 | 4 | new `useFileSrc` (thin wrapper over `useFile`) | Same name, same path post-merge. Net 3 call sites. |
| `features/file-handler/hooks/useFile.ts` | 121 | 2 | new canonical `useFile` | Rewrite. 1 net call site. |
| `features/file-handler/hooks/useFileAs.ts` | 75 | 5 | direct `useFile/useFileSrc/useFileBlob` | Full rewrite per site. 4 net call sites. |
| `features/file-handler/hooks/useFileDownloadUrl.ts` | 26 | 1 | `useFile(ref, { target: "download" }).url` | Rewrite. 0 net call sites outside the hook. |
| `features/file-handler/hooks/useFileMediaBlock.ts` | 20 | 1 | `<InlineMediaRef>` or `fileHandler.toContentPart` | Rewrite. 0 net. |
| `features/file-handler/hooks/useFileUpload.ts` | 77 | 22 | new canonical `useFileUpload` | Rename + arg-shape swap. 21 net call sites. |
| `features/files/hooks/useGuardedFileUpload.ts` | 60 | 4 | new canonical `useFileUpload({ guard: true })` | Rewrite. 3 net call sites. Per plan §6.3 "(legacy shim, 16 callers migrate)" — `useFileUploadWithStorage.ts` lives outside this inventory (in `components/ui/file-upload/`). |
| `features/files/hooks/useSharing.ts` | 154 | 6 | new `useFileMutation(fileId).patch({ share: ... })` (bundled-op) | Rewrite of share-create + share-list paths. List operations still need a separate thin hook (`useFileShareLinks`?) — see Open Questions. 5 net call sites. |
| `features/files/hooks/useFileNode.ts` | 43 | 1 | KEEP (tree-view utility, not part of the 5) | Internal to file-tree component. MOVE in place. |
| `features/files/hooks/useFileSearch.ts` | 82 | 1 | KEEP (search-API wrapper, not user-facing) | MOVE in place. |
| `features/files/hooks/useFileSelection.ts` | 106 | 3 | KEEP (UI selection state, not file-access) | MOVE in place. |
| `features/files/hooks/useFolderContents.ts` | 112 | 6 | KEEP (tree-state wrapper) | MOVE in place. |
| `features/files/hooks/useCloudTree.ts` | 63 | 3 | KEEP | MOVE in place. |
| `features/files/hooks/useInfiniteWindow.ts` | 164 | 4 | KEEP (UI windowing) | MOVE in place. |
| `features/files/hooks/useStorageQuota.ts` | 175 | 2 | KEEP | MOVE in place. |
| `features/files/hooks/blob-cache.ts` | 153 | (helper, no callers outside hooks dir) | MOVE → `features/files/cache/blob-lru.ts` | Cache agent owns; in-memory LRU. |

**The five canonical hooks (NEW files in `features/files/hooks/`):**

1. `useFile.ts` — metadata + capabilities + every URL flavor. Reads `assetsByMasterId` first; falls through to fetch via `requests.ts`. Subscribes to the global expiry-wheel.
2. `useFileSrc.ts` — `string | null` for `src={...}` attrs. Thin wrapper over `useFile`.
3. `useFileBlob.ts` — bytes with the 3-tier cache (L1 LRU → L2 IDB → SW/network). Subsumes `useFileDocument`. **This is a merge of the two existing implementations**, not a fresh file.
4. `useFileUpload.ts` — the only upload primitive. `{ upload, uploading, progress }`. Internally selects buffered / presigned PUT / TUS by size. Optional `{ guard: true }` opens the duplicate-detection dialog before upload. Returns the resulting `Asset` envelope (and per-suboperation `errors[]` for combined-op partial success per plan §5 A.1).
5. `useFileMutation.ts` — `{ patch, delete, restore, bulk }`. Wraps the bundled `PATCH /files/{id}` + `POST /files/bulk` endpoints (plan §5 A.2, A.3). Optimistic-update + rollback via the request ledger.

**Hook migration totals:** 6 existing hooks DELETE outright, 1 KEEP-and-rename
(`useFileSrc` and `useFileBlob` keep their names but get rewritten), 7 KEEP
unchanged in-place (`useFileNode`, `useFileSearch`, `useFileSelection`,
`useFolderContents`, `useCloudTree`, `useInfiniteWindow`, `useStorageQuota`),
5 NEW canonical hooks.

---

## `features/files/types.ts` split

The current 1311-line `types.ts` splits into three files. Mapping below uses
line numbers from the current file.

### → `features/files/types/domain.ts`

Camel-case domain shapes — what Redux/components/hooks work with.

- L28–31: `Visibility`, `PermissionLevel`, `ResourceType`, `GranteeType`
- L62: `MediaRef`
- L139: `FileSource` (the **files** version — does it overlap with the file-handler version? see Open Questions)
- L148: `CloudFile`
- L200: `CloudFolder`
- L215: `CloudFileVersion`
- L227: `CloudFilePermission`
- L239: `CloudShareLink`
- L253: `CloudUserGroup`
- L260: `CloudUserGroupMember`
- L280–311: `CloudTreeFileRow`, `CloudTreeFolderRow`, `CloudTreeRow` + type guards (L1150–1170)
- **From `file-handler/types.ts`:** `FileSource` (16-variant discriminated union), `NormalizedFile`, `FileOrigin`, `FileCapabilities`, `FileMeta`, `FileLifecycle`, `FileScope`, `FileTarget`, `MediaBlock`, `RenderedFor<T>`, `UploadOpts`, `RagIngestSource` — fold all in.

### → `features/files/types/api.ts`

Wire types. Source is `types/python-generated/api-types.ts`. This file contains
only thin re-exports/aliases for ergonomics.

- L88–100: All `CloudFileRow / Insert / Update`, `CloudFolderRow / Insert / Update`, `CloudFileVersionRow`, `CloudFilePermissionRow`, `CloudShareLinkRow`, `CloudUserGroupRow`, `CloudUserGroupMemberRow` — these are derived from `Database` (Supabase-generated). KEEP.
- L107–119: `FileRecordApi`, `FileUploadResponse`, `FilePatchRequest`, `CreateShareLinkRequest`, `ShareLinkResolveResponse`, `GrantPermissionRequest`, `CreateGroupRequest`, `AddGroupMemberRequest`, `SignedUrlResponse` — re-exports from `components["schemas"]`. KEEP, augment with new regenerated names.
- L645–1041: All thunk-arg request/response interfaces (`CreateFolderArg`, `UploadFilesArg`, `SignedUrlArg`, `RenameFileArg`, `MoveFileArg`, `UpdateFileMetadataArg`, `DeleteFileArg`, `RestoreVersionArg`, `GrantPermissionArg`, `RevokePermissionArg`, `CreateShareLinkArg`, `DeactivateShareLinkArg`, `CreateFolderRequest`, `FolderPatchRequest`, `BulkDeleteFilesRequest`, `BulkMoveFilesRequest`, `BulkMoveFoldersRequest`, `BulkResultItem`, `BulkResponse`, `MigrateGuestToUserRequest`, `MigrateGuestToUserResponse`, `StorageUsageResponse`, `TrashListResponse`, `SearchFilesResponse`, `SearchFilesParams`, `RenameFileRequest`, `CopyFileRequest`, `BulkDeleteFilesArg`, `BulkMoveFilesArg`, `BulkMoveFoldersArg`, `UpdateFolderArg`, `MigrateGuestToUserArg`, `RenameFileToPathArg`, `CopyFileArg`, `SearchFilesArg`) — move here, but many become redundant once `requests.ts` consumes the generated types.

### → `features/files/types/ui.ts`

UI-only state shapes.

- L323–365: `RuntimeMetadata<K>`, `CloudFileFieldSnapshot`, `CloudFileRecord`, `CloudFolderFieldSnapshot`, `CloudFolderRecord`, `TreeChildren`, `TreeState`
- L380–500: `ViewMode`, `ChipFilter`, `SortBy`, `SortDirection`, `KindFilter`, `DetailsLevel`, `ModifiedFilter`, `SizeFilter`, `AccessFilter`, `TypeFilter`, `OwnerFilter`, `RagStatus`, `RagFilter`, `ColumnFilters`, `ColumnId`, `VisibleColumns`, `DEFAULT_VISIBLE_COLUMNS`
- L527–613: `UiState`, `SelectionState`, `UploadStatus`, `UploadState`, `RagStatusState`, `CloudFilesState`
- L1055–1089: `RequestKind`, `LedgerEntry`

### → DELETE outright

- **L1187–1311:** All hand-authored Asset types (`AssetPreset`, `AssetVariant`, `Asset`, `AddAssetVariantsRequest`, `AssetPatchRequest`, `AssetPresetVariantDescriptor`, `AssetPresetDescriptor`, `PresetsRegistryResponse`). Plan §6.3 and §6.5: regenerated from BE OpenAPI via `pnpm gen:types`. CI gate `pnpm gen:types && git diff --exit-code` enforces.
- **L1089:** `export type { BackendApiError } from "@/lib/api/errors";` — stays as a re-export but moves to `features/files/errors.ts`.
- **L1122:** `CloudFilesErrorCode` union — moves to `features/files/errors.ts`.

**Net:** 1 file (1311 lines) → 3 files (`domain.ts` ≈ 600 lines, `api.ts` ≈ 250
lines after generated-type adoption, `ui.ts` ≈ 250 lines). ~ 125 lines deleted
outright (hand-authored Asset types).

---

## `features/files/utils/` — disposition per file

| File | Lines | Action | Why |
|---|---:|---|---|
| `utils/resolveRenderableImageUrl.ts` | 287 | DELETE | Plan §6.3: "folded into resolver." Logic moves into `resolver/resolve.ts` + `resolver/python-base.ts` (CDN URL building, signed-URL fallback, MediaRef → URL). Current callers: `features/files/hooks/useSignedUrl.ts` (deleted), `components/image/cloud/resolveCloudFileUrl.ts` (deleted by other agent). |
| `utils/resolveRenderableImageUrl.test.ts` | 115 | DELETE | Companion test; logic re-tested under `resolver/__tests__/resolve.test.ts`. |
| `utils/checksum.ts` | 91 | MOVE | → `features/files/upload/checksum.ts`. Only used by upload (TUS pre-flight + idempotency-key derivation). |
| `utils/upload-duplicate-detect.ts` | 148 | MOVE | → `features/files/upload/duplicate-detect.ts`. Single consumer is `useGuardedFileUpload` / `UploadGuardHost`. |
| `utils/folder-conventions.ts` | 326 | KEEP | Still the source of truth for folder-path conventions. Wide caller base. |
| `utils/format.ts` | 86 | KEEP | `formatBytes`, `formatDate` — generic. |
| `utils/icon-map.ts` | 22 | KEEP | Tiny lookup; widely consumed. |
| `utils/mime.ts` | 20 | KEEP | Tiny MIME helpers; consumed by resolver + components. |
| `utils/path.ts` | 67 | KEEP | Tiny path helpers; consumed by thunks. |
| `utils/file-types.ts` | 2090 | KEEP | Large static MIME-database. No-op. |
| `utils/preview-capabilities.ts` | 57 | KEEP | Used by `FilePreview` registry (other agent). |
| `utils/clipboard.ts` | 109 | KEEP | Wraps the navigator-clipboard fallback dialog plumbing. |
| `utils/url-state.ts` | 433 | KEEP | Files-page URL state encoder/decoder. |
| `utils/server-cookies.ts` | 17 | KEEP | SSR helper for files routes. |
| `utils/server-search-params.ts` | 42 | KEEP | SSR helper. |

**Totals:** 15 files → 13 KEEP + 2 MOVE + 2 DELETE. Two utility files that
should also be considered (not present in `utils/`): `magic-bytes.ts` and
`python-base.ts` arrive **from** `features/file-handler/` and live under
`features/files/resolver/` after the merge (not under `utils/`).

---

## `features/files/virtual-sources/` — unchanged

This entire subtree is unchanged by the consolidation. The virtual-source
abstraction (notes, code-files, prompt-apps, etc.) plugs into the resolver via
its existing `register*` hooks; the rebuild swaps what's *behind* the resolver
without re-wiring the virtual-source contracts.

| File | Lines | Action |
|---|---:|---|
| `virtual-sources/adapt-library-source.ts` | 109 | KEEP |
| `virtual-sources/errors.ts` | 47 | KEEP |
| `virtual-sources/path.ts` | 98 | KEEP |
| `virtual-sources/registerBuiltinVirtualSources.ts` | 21 | KEEP |
| `virtual-sources/registry.ts` | 37 | KEEP |
| `virtual-sources/types.ts` | 341 | KEEP |
| `virtual-sources/adapters/aga-apps.ts` | 176 | KEEP |
| `virtual-sources/adapters/code-files.ts` | 387 | KEEP |
| `virtual-sources/adapters/notes.ts` | 343 | KEEP |
| `virtual-sources/adapters/prompt-apps.ts` | 164 | KEEP |
| `virtual-sources/adapters/tool-ui-components.ts` | 242 | KEEP |
| `virtual-sources/adapters/CodeInlinePreview.tsx` | — | KEEP |
| `virtual-sources/adapters/NotesInlinePreview.tsx` | — | KEEP |

**Totals:** 13 files, 0 changes. Confirm pinned via ESLint that `virtual-sources/**` does NOT import from `features/file-handler/**` post-merge (and instead imports from `features/files/resolver/**`).

---

## `features/files/upload/` — merge with `file-handler/upload`

| File | Lines | Action | Notes |
|---|---:|---|---|
| `features/files/upload/cloudUpload.ts` | 541 | DELETE | Replaced by `upload()` primitive in `features/files/upload/upload.ts`. Per plan §6.3: "replaced by `upload()`." Current callers: `features/tasks/services/taskService.ts`, `features/file-handler/upload.ts`, `features/file-handler/hooks/useFileUpload.ts`, `features/image-studio/components/useCropStudioController.ts`, `components/ui/file-upload/useFileUploadWithStorage.ts` (all out-of-scope migrations for other agents). |
| `features/files/upload/index.ts` | 23 | DELETE | Barrel; ESLint rule forbids new barrels and the new structure doesn't need one. |
| `features/files/upload/UploadGuardHost.tsx` | 36 | MOVE | → `features/files/providers/UploadGuardHost.tsx`. Provider agent owns the move; cross-listed. |
| `features/files/upload/UploadGuardHostImpl.tsx` | 232 | MOVE | → `features/files/providers/UploadGuardHostImpl.tsx`. Component agent territory. |
| `features/files/upload/uploadGuardOpeners.ts` | 109 | MOVE | → `features/files/providers/uploadGuardOpeners.ts`. KEEP code as-is. |
| `features/file-handler/upload.ts` | 261 | MERGE | Folds into new `features/files/upload/upload.ts`. |

**NEW in `features/files/upload/`:**

- `upload.ts` (NEW) — single primitive; auto transport selection (buffered <5 MB / presigned 5–100 MB / TUS ≥100 MB). Calls `client/requests.ts` for the API surface and `client/tus.ts` for resumable.
- `checksum.ts` — moved from `utils/checksum.ts`.
- `duplicate-detect.ts` — moved from `utils/upload-duplicate-detect.ts`.

**Totals:** 6 files in scope → 1 DELETE (`cloudUpload.ts`) + 1 DELETE
(`index.ts` barrel) + 3 MOVE (guard) + 1 MERGE (`file-handler/upload.ts` →
new `upload.ts`) + 2 MOVE in (`checksum`, `duplicate-detect`). End state:
4 files (upload.ts, checksum.ts, duplicate-detect.ts, + UploadGuardHost lives
under providers/).

---

## NEW files to create

| File | Purpose |
|---|---|
| `features/files/handler.ts` | The `fileHandler` facade (no `use().as()` builder). Surface: `upload(source, opts)`, `mutate(fileId)`, `resolve(ref)`, `refresh(file)`, plus the canonical `toMediaBlock` / `toContentPart` helpers for non-React callers. |
| `features/files/errors.ts` | Merged from `file-handler/errors.ts` + existing `CloudFilesErrorCode` from `types.ts` L1122. All 7 error classes + `isS3ExpiredError`. |
| `features/files/types/domain.ts` | (see split section) |
| `features/files/types/api.ts` | (see split section) |
| `features/files/types/ui.ts` | (see split section) |
| `features/files/client/client.ts` | Auth + request-id + idempotency-key + error mapping. Slimmed from `api/client.ts` (14 fns → ~5: `newRequestId`, `resolveBaseUrl`, `buildHeaders`, `request<T>`, `uploadWithProgress`, `downloadBlob`). |
| `features/files/client/requests.ts` | Typed endpoint wrappers driven by `types/python-generated/api-types.ts`. ~7 wrapper functions covering the full BE surface (assets, files, folders, share-links, permissions, versions, bulk). |
| `features/files/client/tus.ts` | TUS resumable-upload client. Used by `upload.ts` for ≥100 MB sources. |
| `features/files/hooks/useFile.ts` | Canonical metadata + URLs + capabilities hook. Reads `assetsByMasterId`. |
| `features/files/hooks/useFileSrc.ts` | URL string for `src={...}` attrs. Thin wrapper. |
| `features/files/hooks/useFileBlob.ts` | Merge of the two existing implementations. Bytes with cache fallthrough. |
| `features/files/hooks/useFileUpload.ts` | Single upload primitive hook. |
| `features/files/hooks/useFileMutation.ts` | `patch / delete / restore / bulk`. |
| `features/files/resolver/normalize.ts` | (moved from `file-handler/input/normalize.ts`) |
| `features/files/resolver/resolve.ts` | (renamed from `file-handler/resolver.ts`) |
| `features/files/resolver/target.ts` | (moved from `file-handler/output/target.ts`) |
| `features/files/resolver/access.ts` | (moved from `file-handler/intelligence/access.ts`) |
| `features/files/resolver/refresh.ts` | (moved from `file-handler/intelligence/refresh.ts`) |
| `features/files/resolver/magic-bytes.ts` | (moved from `file-handler/intelligence/magic-bytes.ts`) |
| `features/files/resolver/classify.ts` | (moved from `file-handler/utils/classify.ts`) |
| `features/files/resolver/prefer-locator.ts` | (moved from `file-handler/utils/prefer-locator.ts`) |
| `features/files/resolver/python-base.ts` | (moved from `file-handler/utils/python-base.ts`) |
| `features/files/upload/upload.ts` | Single upload primitive. Merge of `file-handler/upload.ts` + `cloudUpload.ts` + `api/assets.ts`'s `uploadAsset*`. |
| `features/files/state/thunks/files.ts` | (split from `redux/thunks.ts`) |
| `features/files/state/thunks/folders.ts` | (split from `redux/thunks.ts`) |
| `features/files/state/thunks/permissions.ts` | (split from `redux/thunks.ts`) |
| `features/files/state/thunks/bulk.ts` | (split from `redux/thunks.ts`) |
| `features/files/state/thunks/upload.ts` | (split from `redux/thunks.ts`) |
| `features/files/state/thunks/virtual.ts` | (moved from `redux/virtual-thunks.ts`) |

**Cross-listed (cache agent owns):** `features/files/cache/blob-lru.ts` (from `hooks/blob-cache.ts`), `features/files/cache/expiry-wheel.ts` (from `file-handler/intelligence/expiry-wheel.ts`), `cache/idb-store.ts`, `cache/policy.ts`, `cache/invalidate.ts`, the service-worker subtree.

---

## ESLint rules to add (match plan §6.4)

```yaml
no-restricted-imports:
  # The legacy directory ceases to exist; this catches any straggler import
  - patterns: ["@/features/file-handler/*"]
    message: "features/file-handler has been folded into features/files. Import from @/features/files."

  # Internal modules — public surface is index.ts only (5 hooks + facade + 3 components).
  - patterns: ["@/features/files/api/*"]
    message: "features/files/api is replaced. Use the 5 canonical hooks or the fileHandler facade."
  - patterns: ["@/features/files/client/*"]
    message: "Internal HTTP client. Use the 5 canonical hooks or fileHandler."
  - patterns: ["@/features/files/state/*"]
    message: "Internal Redux. Use the canonical hooks/selectors via @/features/files."
  - patterns: ["@/features/files/redux/*"]
    message: "redux/ moved to state/. And the public surface is @/features/files."
  - patterns: ["@/features/files/resolver/*"]
    message: "Internal resolver. Use the 5 canonical hooks."
  - patterns: ["@/features/files/cache/*"]
    message: "Internal cache. Use useFile / useFileBlob."

no-restricted-syntax:
  - selector: "CallExpression[callee.object.property.name='storage'][callee.object.object.name='supabase']"
    message: "supabase.storage is banned. Use the fileHandler upload/resolve."
  - selector: "CallExpression[callee.property.name='getPublicUrl']"
    message: "Use useFile(ref).url instead."
  - selector: "CallExpression[callee.name='fetch'][arguments.0.value=/^\\/(api\\/)?(files|assets|share|api\\/pdf|api\\/images)\\//]"
    message: "Direct fetch of file endpoints is banned. Use the canonical hooks or fileHandler."
  - selector: "ObjectExpression:has(Property[key.name='file_id']):has(Property[key.name='url'])"
    # MediaRef literal — allowed only inside state/converters.ts
    message: "Manual MediaRef literals are banned. Use cloudFileToMediaRef / fileIdToMediaRef / urlToMediaRef / fileUriToMediaRef."
  - selector: "VariableDeclarator[id.name=/^(ImageBlock|AudioBlock|VideoBlock|DocumentBlock)$/]"
    # Heuristic; final rule will match property keys, not variable name.
    message: "Hand-built media block literals are banned. Use fileHandler.toMediaBlock or <InlineMediaRef>."
  - selector: "Property[key.name='name'][value.value=/^(files|file|cloud)$/]"
    # In createSlice({ name: 'files' | 'file' | 'cloud' })
    message: "Do not create a new files-keyed slice. Extend cloudFiles."

overrides:
  - files: ["features/files/state/converters.ts"]
    rules:
      "no-restricted-syntax": "off"   # converters.ts is the only legal MediaRef construction site
  - files: ["features/files/client/**", "features/files/resolver/**", "features/files/cache/**", "features/files/upload/**", "features/files/state/**", "features/files/hooks/**", "features/files/handler.ts"]
    rules:
      "no-restricted-imports": "off"  # internal modules import each other freely
```

The matching `no-restricted-syntax` patterns for the banned `app/api/(images|files|share|pdf)/*` routes belong in the routes agent's inventory.

---

## Migration dependencies / ordering

The PR3 sequence (plan §7) is mostly correct, but for the internal-core slice
the strict prerequisites are:

1. **Phase 0 ESLint chokepoint lands first** (plan §6.4, PR3 step 1). Locks every new bypass while the rest of PR3 lands incrementally.
2. **`types.ts` split lands first** (PR3 step 2). Every downstream import (resolver, hooks, thunks, components) is shape-compatible after the split. Without this, the merge produces 1000+ TS errors before the resolver moves are even attempted.
3. **`file-handler/types.ts` and `file-handler/errors.ts` merge in with the types split** (same PR3 step 2 commit). `FileSource`/`FileTarget`/`NormalizedFile` must live at their final paths before any hook or resolver file moves.
4. **`client/client.ts` + `client/requests.ts` land before any thunk moves** (PR3 step 3 → step 4). The thunks call into the client; can't move thunks until their callee paths are stable.
5. **`resolver/**` lands as a single commit, in dependency order:** `normalize.ts` and `python-base.ts` first (no internal deps), then `magic-bytes.ts`, `classify.ts`, `prefer-locator.ts`, `access.ts`, `refresh.ts`, finally `resolve.ts` and `target.ts` (which import everything else).
6. **`state/slice.ts` adds `assetsByMasterId` (PR3 step 4)** before `useFile.ts` is written (PR3 step 5). `useFile` reads the new map; without it the hook returns undefined.
7. **`upload/upload.ts` lands before `useFileUpload.ts`** (PR3 step 6). Hook is a thin wrapper.
8. **`useFileSrc` (new) + `useFile` (new) MUST land in the same commit as the 285+ callsite migrations** (PR3 step 8). Otherwise build is red mid-PR. Same for `useFileBlob` merge and its 19 callers.
9. **Hook deletions happen last** (`useFileAsset`, `useFileDocument`, `useSignedUrl`, `useFile/handler`, `useFileAs`, `useFileDownloadUrl`, `useFileMediaBlock`, `useFileUpload/handler`, `useGuardedFileUpload`). The corresponding callsite migrations land in the preceding commits of the same PR.
10. **`api/*` directory deletion is the second-to-last commit.** Until every thunk has been moved into `state/thunks/` and rewired to `client/requests.ts`, the API files must remain as a compile-target for the in-flight redux migration.
11. **`features/file-handler/` directory deletion is the final commit.** Once `features/files/resolver/**`, `features/files/hooks/{useFile,useFileSrc,useFileBlob,useFileUpload}.ts`, `features/files/handler.ts`, and `features/files/errors.ts` all exist and the 28 import sites have been re-pointed, the entire `file-handler` tree can `git rm -r`.

---

## Open questions for the user

1. **`features/files/errors.ts` does not currently exist.** The task brief lists it under in-scope files, but only `features/file-handler/errors.ts` exists today. I've treated this as a CREATE (merge from `file-handler/errors.ts` + `CloudFilesErrorCode` from `types.ts` L1122). Confirm.
2. **Two competing `FileSource` types.** `features/files/types.ts` L139 defines a `FileSource` AND `features/file-handler/types.ts` L49 defines a different (16-variant) `FileSource`. The plan implicitly assumes the file-handler version wins. Confirm — and if so, every consumer of the `features/files/` version must migrate to the file-handler shape.
3. **`useSharing.ts` returns more than `useFileMutation` can offer.** Today it covers create-share-link, list-share-links, revoke-share-link, *and* `cld_share_links`-realtime subscription. `useFileMutation.patch({ share: ... })` covers create + revoke (via the bundled PATCH). List operations need a separate thin hook (proposal: `useShareLinks(fileId)`). Confirm or specify.
4. **`api/groups.ts` (5 fns).** Plan §9 defers `cld_user_groups` audit, but the 5 group endpoints (list/create/list-members/add-member/remove-member) are still wired into UI somewhere. I've kept them as thin wrappers in `requests.ts`. Confirm whether they stay or get yanked.
5. **`api/document-lookup.ts` is NOT a Python REST call.** It SELECTs from `processed_documents`. Where should the equivalent live? Options: (a) fold into `useFileBlob`/`useFileDocument` consolidation as a Redux thunk in `state/thunks/files.ts`, or (b) move to `features/rag/api/`. I lean (a) since `processed_documents` is generally a `cld_files`-derived artifact and the FE consumer cares about the document bytes (covered by `useFileBlob`). Confirm.
6. **`api/server-client.ts` (320 lines, 9 fns).** Plan §6.3 says "no callers after Sharp deletion." Verify before merge — its 9 functions overlap heavily with `api/files.ts` and were apparently created for the Sharp Node.js routes. Grep showed zero in-scope production consumers, but worth a second look.
7. **`virtual-thunks.ts` placement.** I've proposed `state/thunks/virtual.ts`, but it could equally well live alongside `virtual-sources/` as `virtual-sources/thunks.ts`. The 7 thunks are the only place the `cloudFiles` slice talks to the virtual-source registry. Confirm preferred home.
8. **`useFileBlob` merge resolution.** `features/file-handler/hooks/useFileBlob.ts` (18 lines) is a stub that delegates to `features/files/hooks/blob-cache.ts`. The 185-line `features/files/hooks/useFileBlob.ts` is the real implementation. Confirm: the merged canonical version is essentially today's `features/files/hooks/useFileBlob.ts`, extended to (a) accept the broader `FileSource` input shape (currently it accepts `fileId` only) and (b) consult the L2 IDB cache before network. The cache agent owns (b).
9. **Hand-authored `RagStatusState` + `RagFilter`** in `types.ts` L605 / L447: stays in `ui.ts` even after `redux/rag-thunks.ts` deletes? Yes — the selectors that read `state.cloudFiles.ragStatuses` are still in `selectors.ts` and supported by the `cloudFiles` slice. Confirm.
10. **Hook callsite counts include test/spec files.** The 285+ figure in plan §6.3 is for `useFileSrc` callsites overall; the 4-file count above is for the file-handler version specifically. If the user wants a precise per-codebase migration plan, run a targeted grep that excludes test files and tells per-hook how many user-facing components need editing. Out of scope for this inventory unless requested.
