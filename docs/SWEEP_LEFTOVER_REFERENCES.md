# Sweep: leftover references to the old file-handling system

Scope: whole repo at `/Users/armanisadeghi/code/matrx-frontend`, excluding
`node_modules/`, `.claude/worktrees/`, `docs/`, `features/files/migration/`,
`pnpm-lock.yaml`, `package-lock.json`.

## Headline counts

- LIVE references that need fixing: 4
- COMMENT references (doc / comment only): 49
- IRRELEVANT (false positives): 18

The system is in remarkably good shape. There are NO live callers of the
deleted hooks, NO live `supabase.storage` calls, NO live references to the
deleted API routes, and NO live imports from the old `@/features/file-handler`
path. The remaining LIVE items are: stale path strings inside doc-comments
that an agent might follow, one stale `ImagePreset` type alias, and the
`Api.Server.uploadAndShare` server-side wrapper which the spec lists as old
but which is the **canonical** server-side upload path per the codebase
docs — flagged as **VERIFY** so the user can confirm intent.

---

## LIVE — must fix

### 1) Stale `@/features/file-handler/...` import paths (in agent-facing docs that will be copy-pasted)

`features/file-handler/` was moved to `features/files/handler/`. The
following live doc strings tell future agents to import from the old path,
which no longer exists. These are *not* TS imports (the compiler isn't
catching them), but they are normative agent instructions — anyone following
them will write broken imports.

| File | Line | Match |
|---|---|---|
| `CLAUDE.md` | 150 | `...funnels through \`features/file-handler\`. Read [\`features/file-handler/FEATURE.md\`](./features/file-handler/FEATURE.md)...` |
| `CLAUDE.md` | 154 | `\`import { fileHandler } from "@/features/file-handler/handler"\`` |
| `CLAUDE.md` | 155 | `**No \`supabase.storage\` anywhere outside \`features/file-handler/**\` and \`features/files/**\`...` |
| `CLAUDE.md` | 160 | `If a file shape isn't in the existing \`FileSource\` union, add it to \`features/file-handler/types.ts\`` |
| `CLAUDE.md` | 198 | `\| Universal file handler ... \| \`features/file-handler/FEATURE.md\` \|` |
| `features/files/UPLOAD_TROUBLESHOOTING.md` | 10 | `\`features/file-handler\`. There is one upload primitive — anything else is wrong.` |
| `features/files/UPLOAD_TROUBLESHOOTING.md` | 13 | `import { useFileUpload } from "@/features/file-handler/hooks/useFileUpload";` |
| `features/files/UPLOAD_TROUBLESHOOTING.md` | 37 | `import { fileHandler } from "@/features/file-handler/handler";` |
| `features/files/UPLOAD_TROUBLESHOOTING.md` | 54 | `\`@/features/file-handler/errors\`:` |
| `features/files/UPLOAD_TROUBLESHOOTING.md` | 83 | `\`features/file-handler/\` and \`features/files/upload/\`. Always go through` |
| `features/files/handler/FEATURE.md` | 21 | `\`import { fileHandler } from "@/features/file-handler/handler"\` — read/write/refresh` |
| `features/files/handler/FEATURE.md` | 22 | `\`import { useFile } from "@/features/file-handler/hooks/useFile"\` — generic resolve` |
| `features/files/handler/FEATURE.md` | 23 | `\`import { useFileSrc } from "@/features/file-handler/hooks/useFileSrc"\` — \`<img src>\` URL` |
| `features/files/handler/FEATURE.md` | 24 | `\`import { useFileBlob } from "@/features/file-handler/hooks/useFileBlob"\` — bytes` |
| `features/files/handler/FEATURE.md` | 25 | `\`import { useFileMediaBlock } from "@/features/file-handler/hooks/useFileMediaBlock"\` — AI block` |
| `features/files/handler/FEATURE.md` | 26 | `\`import { useFileDownloadUrl } from "@/features/file-handler/hooks/useFileDownloadUrl"\` — \`<a download>\`` |
| `features/files/handler/FEATURE.md` | 27 | `\`import { useFileUpload } from "@/features/file-handler/hooks/useFileUpload"\` — write path` |
| `features/files/handler/FEATURE.md` | 29 | `**Types** — \`@/features/file-handler/types\`` |
| `features/files/handler/FEATURE.md` | 30 | `**Errors** — \`@/features/file-handler/errors\`` |
| `features/files/handler/FEATURE.md` | 46 | `**Key types** (\`features/file-handler/types.ts\`):` |

**Fix:** global s/`features/file-handler`/`features/files/handler`/g in
the files above (verify each path resolves under
`features/files/handler/`). These are the docs that agents quote verbatim
when writing new imports, so they MUST be correct.

### 2) Legacy `ImagePreset` type alias still exported

The spec lists this as deleted. It is still exported (as an alias of
`AssetPreset`).

| File | Line | Match |
|---|---|---|
| `components/official/ImageAssetUploader.tsx` | 54 | ` * the legacy \`ImagePreset\` union (\`"social" \| "cover" \| "avatar" \| ...\`).` |
| `components/official/ImageAssetUploader.tsx` | 60 | `export type ImagePreset = AssetPreset;` |

**Fix:** delete the `export type ImagePreset = AssetPreset;` alias and the
JSDoc line above it. Then run typecheck to find any stragglers.

### 3) `Api.Server.uploadAndShare` server wrapper — VERIFY whether to delete

The cleanup spec says `Api.Server.uploadFile` and `Api.Server.uploadAndShare`
are "old server-side wrappers" to remove. However the codebase docs
(`features/files/FEATURE.md` line 336, `features/files/UPLOAD_TROUBLESHOOTING.md`
line 46) describe `Api.Server.uploadAndShare` as the **canonical** server-side
cloud-files upload path. There is exactly one live caller:

| File | Line | Match |
|---|---|---|
| `app/api/agent-apps/generate-favicon/route.ts` | 140 | `const ctx = Api.Server.createServerContext({` |
| `app/api/agent-apps/generate-favicon/route.ts` | 144 | `const { fileId, shareUrl } = await Api.Server.uploadAndShare(ctx, {` |
| `features/files/api/server-client.ts` | 299 | `export async function uploadAndShare(` (the definition) |

**Action required from user:** decide whether this is genuinely deprecated
(in which case the favicon route needs migration to the handler, and the
`Api.Server` wrapper deleted) or whether the spec is wrong and this should
stay. `Api.Server.uploadFile` itself has **zero** call sites in live code —
only `uploadAndShare` is used.

### 4) `Files.uploadFileWithProgress` direct import from outside `features/files/`

The spec says `Files.uploadFile` direct imports from outside `features/files/`
must go through the handler. `uploadFileWithProgress` is in the same family
and has one out-of-feature live caller:

| File | Line | Match |
|---|---|---|
| `features/whatsapp-clone/chat-view/MessageInputBar.tsx` | 18 | `import { uploadFileWithProgress } from "@/features/files/api/files";` |
| `features/whatsapp-clone/chat-view/MessageInputBar.tsx` | 55 | `const { data } = await uploadFileWithProgress(...)` |
| `features/whatsapp-clone/chat-view/MessageInputBar.tsx` | 145 | `const { data } = await uploadFileWithProgress(...)` |

**Fix:** migrate `MessageInputBar` to `useFileUpload()` from
`@/features/files/handler/hooks/useFileUpload`. (The other
`uploadFileWithProgress` references are inside `features/files/` itself, which
is allowed.)

---

## COMMENT — clean up when convenient

These are JSDoc comments, prose explanations, and Change-Log entries that
reference deleted hooks/utils by name. They won't break anything, but they
will mislead future agents who grep for these names.

### Deleted hooks (comments referencing `useSignedUrl`)

| File | Line | Match |
|---|---|---|
| `features/scraper/FEATURE.md` | 108 | `- Hooks: \`useSignedUrl\` (auto-refreshing storage signed URLs).` |
| `features/transcripts/README.md` | 79 | `│   └── useSignedUrl.ts                   # Auto-refreshing signed URLs` |
| `features/files/types.ts` | 167 | `* should fall back to \`\`useSignedUrl(fileId)\`\` for a 1h AWS-signed URL.` |
| `features/files/types.ts` | 176 | `* rows, fall back to \`\`useSignedUrl(fileId)\`\` to fetch the canonical` |
| `features/files/SKILL.md` | 61 | `import { useSignedUrl } from '@/features/files/hooks/useSignedUrl';` |
| `features/files/SKILL.md` | 63 | `const { url } = useSignedUrl(fileId);` |
| `features/files/SKILL.md` | 120 | `\| Signed URL returns 403 \| Expired. Use \`useSignedUrl\` (auto-refreshes)...` |
| `features/files/FEATURE.md` | 319 | `\`useSignedUrl()\` and Image Manager cloud-file resolution now delegate through this path.` |
| `features/files/FEATURE.md` | 327 | `Hooks: [hooks/useSignedUrl.ts](hooks/useSignedUrl.ts) (expiry-aware auto-refresh)...` |
| `features/files/FEATURE.md` | 332 | `...image-thumbnail grid via \`useSignedUrl\`...` |
| `features/files/handler/intelligence/expiry-wheel.ts` | 5 | `per-component \`setTimeout\` pattern in the legacy \`useSignedUrl\` hook —` |
| `features/files/handler/FEATURE.md` | 120 | `Replaces the per-component \`setTimeout\` pattern in the legacy \`useSignedUrl\`...` |
| `features/files/components/surfaces/desktop/FileGridCell.tsx` | 5 | `* file is an image (via \`useSignedUrl\`), else a large file icon...` |
| `features/files/hooks/useFileAsset.ts` | 8 | `* Why this hook instead of {@link useSignedUrl}...` |
| `features/files/hooks/useFileAsset.ts` | 13 | `* \`useSignedUrl\` stays for legacy callers that only need the raw signed` |
| `features/files/hooks/useFileAsset.ts` | 19 | `* \`useSignedUrl\`'s policy). Public/CDN URLs never expire so the` |
| `features/files/hooks/useFileAsset.ts` | 22 | `* Pattern matches \`useSignedUrl.ts\` — no TanStack Query in` |
| `features/files/redux/converters.ts` | 86 | `// should fall back to useSignedUrl(fileId) when this is null.` |
| `features/files/redux/thunks.ts` | 246 | `// here; surfaces that need a CDN URL fetch via useSignedUrl.` |
| `features/files/redux/thunks.ts` | 275 | `// here; surfaces that need a CDN URL fetch via useSignedUrl.` |
| `CLAUDE.md` | 154 | `Never call \`useSignedUrl\` directly — use \`useFileSrc\` instead.` (correct guidance, but lists a name that no longer exists — replace with "Never call legacy signed-URL hooks") |

### Deleted hooks (comments referencing `useFileUploadWithStorage` / `usePasteImageUpload`)

| File | Line | Match |
|---|---|---|
| `features/image-manager/IMAGE-FEATURE-INVENTORY.md` | 58 | `**\`ImageUploadField\`** ... (uses \`useFileUploadWithStorage\`). **LINK-FROM.**` |
| `features/image-manager/IMAGE-FEATURE-INVENTORY.md` | 59 | `**\`PasteImageHandler\`** + **\`usePasteImageUpload\`** ... \`usePasteImageUpload.ts\`...` |
| `features/cx-conversation/DEPENDENCIES.md` | 99 | `\| \`@/components/ui/file-upload/useFileUploadWithStorage\` \| ConversationInput \| **Keep**...` |
| `features/conversation/DEPENDENCIES.md` | 114 | `\| \`useFileUploadWithStorage\` \| ConversationInput \| Eager \|` |
| `features/conversation/CONVERSATION_SYSTEM.md` | 207 | `\| \`useFileUploadWithStorage\` \| \`components/ui/file-upload/useFileUploadWithStorage.ts\`...` |
| `features/files/FEATURE.md` | 336 | `\`components/ui/file-upload/useFileUploadWithStorage.ts\` was rewritten in place...` (historical Change-Log entry — fine as history, but the file no longer exists; reword as "was deleted in <date>") |
| `features/files/handler/types.ts` | 168 | `/** Legacy-compat shape from \`components/ui/file-upload/useFileUploadWithStorage\`. */` |
| `features/files/handler/FEATURE.md` | 139 | `\| \`components/ui/file-upload/useFileUploadWithStorage.ts\` \| \`useFileUpload\` from this feature \| pending \|` (now "done") |
| `features/files/handler/FEATURE.md` | 140 | `\| \`components/ui/file-upload/usePasteImageUpload.ts\` \| \`useFileUpload\` + \`{ kind: "file", file }\` \| pending \|` (now "done") |
| `components/ui/file-upload/PasteImageHandler.tsx` | 6 | `* \`usePasteImageUpload\` hook was deleted in Phase 1 of the file-handling` (this one is fine; it correctly says deleted) |
| `components/ui/file-upload/FileUploadWithStorage.tsx` | 38 | `// handler. Mirrors what the deleted useFileUploadWithStorage shim used to do.` (this one is fine; it correctly says deleted) |
| `components/image/ImageManager.tsx` | 98 | `* changes — the path scheme matches what \`useFileUploadWithStorage\`` |

### Deleted utilities (`resolveRenderableImageUrl`, `cloudUploadMany`, `isCloudUploadSuccess`)

| File | Line | Match |
|---|---|---|
| `features/image-manager/FEATURE.md` | 156 | `...\`features/files/utils/resolveRenderableImageUrl.ts\` via \`resolveCloudFileUrl\`...` |
| `features/image-manager/FEATURE.md` | 177 | `Use \`resolveCloudFileUrl()\` / \`resolveRenderableImageUrl()\` instead of calling \`/files/{id}/url\` directly...` |
| `features/image-manager/FEATURE.md` | 213 | `...the cache-aware \`resolveRenderableImageUrl\` path...` |
| `features/files/FEATURE.md` | 291 | `**Renderable image/file URLs are centrally cached** — use [utils/resolveRenderableImageUrl.ts]...` |
| `features/files/FEATURE.md` | 319 | `Central renderable image URL resolver added at [utils/resolveRenderableImageUrl.ts]...` |
| `features/files/upload/cloudUpload.ts` | 166 | `export function isCloudUploadSuccess(` (still exported — confirm if internal-only) |
| `features/files/upload/cloudUpload.ts` | 492 | `export async function cloudUploadMany(` (still exported — confirm if internal-only) |
| `features/files/upload/index.ts` | 11 | `cloudUploadMany,` (barrel re-export) |
| `features/files/upload/index.ts` | 14 | `isCloudUploadSuccess,` (barrel re-export) |
| `features/image-studio/components/useCropStudioController.ts` | 23 | `* \`cloudUploadMany\` from the cloud-files pipeline.` |
| `features/image-studio/components/useCropStudioController.ts` | 548 | `// filename/size matching dance the old cloudUploadMany required.` |

(Note: `cloudUpload.ts` still defines `cloudUploadMany`/`isCloudUploadSuccess`
and they are re-exported from `features/files/upload/index.ts`. The spec says
external callers were migrated — so the public exports likely want to be
demoted to internal. Confirm and then strip from the barrel.)

### Deleted routes (comments only — no live callers)

| File | Line | Match |
|---|---|---|
| `types/python-generated/api-types.ts` | 6622 | `* @description No-persist PDF compression. Replaces app/api/pdf/compress.` |
| `hooks/usePdfOptimize.ts` | 5 | `* no Next.js hop. The previous proxy at \`app/api/pdf/compress/route.ts\`` |
| `lib/api/endpoints.ts` | 369 | `* Replaces the deleted Next.js route at app/api/pdf/compress.` |
| `features/image-manager/FEATURE.md` | 48 | `(Replaces the legacy Next.js+Sharp route at \`/api/images/upload\`...)` |
| `features/image-manager/IMAGE-FEATURE-INVENTORY.md` | 56 | `(was the Next.js+Sharp route at \`/api/images/upload\` until 2026-05-12)` |
| `features/image-manager/IMAGE-FEATURE-INVENTORY.md` | 210 | `**Replaced** the legacy Next.js+Sharp route at \`/api/images/upload\`...` |
| `features/files/FEATURE.md` | 322 | `**2026-05-12** — Phase 4 cleanup. The Next.js Sharp route at \`/api/images/upload\` has been deleted...` |
| `features/files/FEATURE.md` | 338 | `**API-route migration (Phase C6).** \`/api/images/upload\` was migrated in place...` (Change Log) |
| `features/files/handler/FEATURE.md` | 44 | `(The legacy Next.js+Sharp route at \`/api/images/upload\` was deleted on 2026-05-12...)` |
| `features/files/handler/FEATURE.md` | 153 | `\`app/api/admin/feedback/images/route.ts\` (dynamic buckets) — backfill old image URLs...` |
| `features/files/handler/FEATURE.md` | 190 | `Deleted Next.js routes: \`app/api/admin/feedback/images\`, \`app/api/share/[token]/file\`, \`app/api/code-files/upload\`, \`app/api/code-files/download\`.` |
| `features/files/for_python/REQUESTS.md` | 584 | `same-origin Next.js+Sharp \`/api/images/upload\` proxy worked.` |

### Old `features/files/api/client` path

| File | Line | Match |
|---|---|---|
| `features/files/SKILL.md` | 16 | `**Never \`supabase.storage.*\` in new code.** Only legacy. Use [features/files/api/client.ts](api/client.ts).` (broken link — file moved to `lib/python-client.ts`) |
| `features/files/for_python/REQUESTS.md` | 677 | `**FE side:** Both headers added to [features/files/api/client.ts](../api/client.ts)` (broken link) |
| `features/image-studio/api/python.ts` | 12 | `* The auth/header pattern is identical to features/files/api/client.ts` |
| `lib/python-client.ts` | 8 | `* Cloud-files originally owned this module under \`features/files/api/client\`;` (historical breadcrumb — fine to keep) |

### `supabase.storage` mentions (all in comments, all describing migration)

| File | Line | Match |
|---|---|---|
| `features/resource-manager/resource-picker/FilesResourcePicker.tsx` | 8 | `(features/files/*) instead of supabase.storage — no more buckets, one` |
| `features/audio/services/audioFallbackUpload.ts` | 9 | `Migrated from direct \`supabase.storage\` usage to the new cloud-files` |
| `features/files/handler/handler.ts` | 7 | `to \`supabase.storage\`, and direct uploads through \`useFileUpload\` are` |

### Legacy bucket names (comments / migration docs)

| File | Line | Match |
|---|---|---|
| `features/canvas/social/ShareCoverImagePicker.tsx` | 8 | `2. Upload their own image (stored in the user-public-assets bucket)` (stale — uploads no longer go there) |
| `features/files/handler/FEATURE.md` | 150 | `\`hooks/usePublicFileUpload.ts\` (\`public-chat-uploads\`)...` |
| `features/files/handler/FEATURE.md` | 151 | `(\`user-private-assets\`) — migrate to cloud-files folder \`Transcripts/Recordings\`.` |
| `features/files/handler/FEATURE.md` | 189 | `Deleted \`hooks/usePublicFileUpload.ts\` and the \`public-chat-uploads\` Supabase bucket...` |
| `features/files/handler/FEATURE.md` | 192 | `Migrated \`features/transcripts/service/audioStorageService.ts\`...off the \`user-private-assets\` bucket.` |
| `features/files/FEATURE.md` | 341 | `\`utils/supabase/{StorageManager,bucket-manager,file-store}.ts\`...` |
| `features/files/FEATURE.md` | 342 | `(historical Phase 11 deletion list)` |

### `Api.Server.uploadAndShare` mentions in docs

| File | Line | Match |
|---|---|---|
| `features/image-manager/IMAGE-FEATURE-INVENTORY.md` | 214 | `...uploaded to cld_files via \`Api.Server.uploadAndShare\`.` |
| `features/files/UPLOAD_TROUBLESHOOTING.md` | 46 | `\`Api.Server.uploadAndShare\` with a server context built from the user's` |
| `features/files/upload/cloudUpload.ts` | 13 | `* \`Api.Server.uploadAndShare\` which wraps the same Python \`/files/upload\`` |
| `features/files/upload/cloudUpload.ts` | 17 | `* via the universal handler, OR through \`Api.Server.uploadAndShare\`.**` |

(Update these once the user resolves LIVE #3 above.)

### `mode="cloud" | "asset"` + `pasteCaptureMode` (props the spec says were removed)

Live code uses these props nowhere. They appear only in image-manager docs:

| File | Line | Match |
|---|---|---|
| `features/image-manager/FEATURE.md` | 120 | `...powered by \`<ImageAssetUploader mode="cloud">\`...` |
| `features/image-manager/FEATURE.md` | 121 | `**Branded Upload** ... wraps \`<ImageAssetUploader pasteCaptureMode="asset">\`...` |
| `features/image-manager/FEATURE.md` | 149 | `\`<ImageAssetUploader mode="cloud">\` renders the shared official image dropzone...` |
| `features/image-manager/FEATURE.md` | 163 | `\`<ImageAssetUploader pasteCaptureMode="asset">\` calls \`uploadAsset()\`...` |
| `features/image-manager/FEATURE.md` | 214 | `Change-Log: \`<ImageAssetUploader mode="cloud">\`...` |
| `features/image-manager/FEATURE.md` | 215 | `Change-Log: \`ImageAssetUploader pasteCaptureMode="asset"\`...` |
| `features/files/FEATURE.md` | 320 | `**2026-05-07** — ...\`components/official/ImageAssetUploader\` in \`mode="cloud"\`...` (Change Log — historical) |

(These docs describe the **current** Image Manager UI but with the
**old** prop names. Verify the components actually still accept these
props before deciding what to change.)

### Old `FileSystemProvider` / `FilesPack` (already commented out)

| File | Line | Match |
|---|---|---|
| `app/Providers.tsx` | 80 | `//   - lib/redux/fileSystem/Provider (FileSystemProvider)` |
| `app/Providers.tsx` | 81 | `//   - components/file-system/preview (FilePreviewProvider)` |
| `app/Providers.tsx` | 82 | `//   - providers/FileSystemProvider (OldFileSystemProvider)` |
| `app/Providers.tsx` | 83 | `//   - providers/packs/FilesPack` |

These are already commented out — they're informational tombstones. Fine
to delete the block entirely.

---

## IRRELEVANT (false positives, not listed individually)

18 matches share names with deleted items but are unrelated:

- `userContent` as a **column / variable name** in `cx-chat`, `public-chat`,
  `agents/redux/execution-system/messages`, `prompts/utils/prompt-json-generator`,
  `prompts/hooks/usePromptExecution`, `agent-apps/sample-code/templates`,
  `prompt-apps/sample-code/templates` — these are database `user_content` JSONB
  columns / local variables, not the legacy Supabase bucket.
- `userContent` as a **prop default** on input components
  (`PromptInputContainer`, `SmartAgentInput`, `ConversationInput`, etc.) — this
  is the `uploadBucket` *default value* threaded down to `PasteImageHandler` /
  `FileUploadWithStorage`, which (per the live code in those components)
  is now correctly mapped via `mapLegacyBucket()` to a cld_files folder.
  Not a bug.
- `'code-editor'` as a **context-filter string** in
  `features/code-editor/components/CodeEditorContextMenu.tsx`,
  `features/prompt-builtins/utils/menuHierarchy.ts`,
  `features/context-menu-v2/UnifiedAgentContextMenu.tsx`,
  `app/(dev)/demos/context-menu-v2/page.tsx` — this is the shortcut-system
  context filter, not the deleted Supabase bucket.
- `'attachments'` as a **toggle option id** in
  `app/(authenticated)/(admin-auth)/administration/official-components/to-be-added/toggle-menu-demo/page.tsx`
  — unrelated demo.
- `extractFileId` defined privately inside
  `features/agents/components/inputs/resources/SmartAgentResourceChips.tsx`
  (lines 201, 223) — separate local helper, not a reference to the
  deleted hook export.
- `lib/redux/constants.ts` lines 2–13 — a constant list that still includes
  `'userContent'`, `'audio-recordings'`, `'code-editor'`. If this drives
  legacy-bucket mapping for `FileUploadWithStorage`/`PasteImageHandler`,
  it's still LIVE config and required. If it drives nothing, it can be
  pruned — but it's not a stale reference per se. (Worth a glance, not
  in the LIVE list.)
- `Files.uploadFileWithProgress` calls **inside** `features/files/*`
  (the implementation and one internal caller) — allowed per scope rules.

---

## Suggested batch order

1. **LIVE #1 — fix `@/features/file-handler` path strings in agent-facing
   docs** (`CLAUDE.md`, `features/files/UPLOAD_TROUBLESHOOTING.md`,
   `features/files/handler/FEATURE.md`). Global path rewrite, single PR.
   Highest priority because these docs are the canonical instructions agents
   copy-paste from.
2. **LIVE #4 — migrate `MessageInputBar` (whatsapp-clone) to
   `useFileUpload()`** from the handler. Isolated, one file.
3. **LIVE #2 — remove `export type ImagePreset = AssetPreset;`** from
   `components/official/ImageAssetUploader.tsx` and typecheck.
4. **LIVE #3 — decide `Api.Server.uploadAndShare` fate.** Either (a) keep
   and update the cleanup spec, or (b) deprecate, migrate the favicon
   route, delete the wrapper, and update the four docs that recommend it.
5. **COMMENT — `useSignedUrl` mentions in `features/files/types.ts`,
   `features/files/SKILL.md`, `features/files/redux/converters.ts`,
   `features/files/redux/thunks.ts`, `features/files/hooks/useFileAsset.ts`,
   `features/files/components/surfaces/desktop/FileGridCell.tsx`,
   `features/files/handler/intelligence/expiry-wheel.ts`,
   `features/files/handler/FEATURE.md`.** These are inside `features/files/`,
   so an agent working on cloud-files is most likely to read them. Reword to
   "the handler" / "useFileSrc" / "the expiry wheel" as appropriate.
6. **COMMENT — `useFileUploadWithStorage` / `usePasteImageUpload` in
   feature DEPENDENCIES.md / CONVERSATION_SYSTEM.md / IMAGE-FEATURE-INVENTORY.md.**
   These are top-of-file inventories that future agents grep.
7. **COMMENT — `resolveRenderableImageUrl` mentions** in `features/files/FEATURE.md`
   and `features/image-manager/FEATURE.md`. Replace with the actual
   replacement path (the handler's resolver).
8. **COMMENT — `mode="cloud"` / `pasteCaptureMode` mentions** in
   `features/image-manager/FEATURE.md`. Verify whether the props were
   actually deleted (Live #2 fix may inform this) and then either restore
   them or rewrite the docs to current API.
9. **COMMENT — deleted-route mentions in `usePdfOptimize.ts`,
   `lib/api/endpoints.ts`, `types/python-generated/api-types.ts`,
   `features/files/for_python/REQUESTS.md`, and various FEATURE.md change
   logs.** These are mostly historical and may be worth keeping as
   tombstones; trim only if confusing.
10. **COMMENT — stale `Api.Server.uploadAndShare` doc mentions** (resolve
    after LIVE #3 is decided).
11. **COMMENT — broken `features/files/api/client.ts` links** in
    `features/files/SKILL.md` and `features/files/for_python/REQUESTS.md`
    — repoint to `lib/python-client.ts`.
12. **COMMENT — delete the commented-out provider list at
    `app/Providers.tsx:80-83`.** Trivial cleanup.
13. **COMMENT — fix stale "user-public-assets bucket" comment at
    `features/canvas/social/ShareCoverImagePicker.tsx:8`.**

After batches 1–4 the codebase is functionally clean. Batches 5–13 are
documentation hygiene that prevents future agents from chasing dead
references.
