> 🚫 HISTORICAL — `storage_uri`/`file_uri` were ERADICATED from the FE (2026-07-06). Any instruction below referencing them is obsolete; see features/files/FEATURE.md.

# Impact inventory — routes, providers, types, build, deps

Companion to [`docs/FILE_HANDLING_CONSOLIDATION_PLAN.md`](./FILE_HANDLING_CONSOLIDATION_PLAN.md). Covers infrastructure, build, deps, types, ESLint, providers, route mounts, and CI — explicitly excluding component-level / Redux-slice / cache-internal work owned by other agents.

## Summary

| Action | Count |
|---|---|
| DELETE | 9 |
| MODIFY | 15 |
| KEEP | 14 |
| CREATE | 9 |

Total files affected: **47** (plus 285+ in-line callsite migrations tracked in other inventories).

---

## app/api/ — Next.js API routes touching files

### Confirmed currently present (live on disk)

| Route | Status today | Action | Why |
|---|---|---|---|
| `app/api/images/studio/process/route.ts` | live (1 file, imports `sharp`) | DELETE | Replaced by Python `POST /assets/preview` (plan E.16). Removes the `sharp` npm dep. |
| `app/api/pdf/compress/route.ts` | live (proxies to Python `/utilities/pdf/compress`) | DELETE | Replaced by Python `POST /assets/pdf-compress` (plan E.17). Today's route is a multipart proxy — drop it; have the FE talk directly to Python with the asset envelope. |
| `app/api/image-proxy/route.ts` | live (cross-origin image fetch + cache-control) | KEEP (audit) | Not in plan's deletion list. Used by Image Manager (`features/image-manager/FEATURE.md` line 47). Audit whether the new SW + IDB cache layer obsoletes this — if yes, schedule as a follow-up; out of scope for the rebuild PR. |

### Confirmed deleted (verified via `git log --diff-filter=D`)

| Route | Deleted in | Notes |
|---|---|---|
| `app/api/images/upload/route.ts` | recent (60d window) | already done |
| `app/api/images/studio/save/route.ts` | recent | already done |
| `app/api/files/content/route.ts` | recent | already done |
| `app/api/share/[token]/file/route.ts` | recent | already done |
| `app/api/code-files/upload/route.ts` | recent | already done |
| `app/api/code-files/download/route.ts` | recent | already done |
| `app/api/admin/feedback/images/route.ts` | recent | already done |

The plan also lists `app/api/images/proxy/route.ts` and `app/api/files/download/route.ts` as already deleted — these names are NOT in git deletion history; the closest matches are `app/api/image-proxy/route.ts` (still live) and `app/api/files/content/route.ts` (already deleted). Flagged as a doc-discrepancy in Open Questions.

### File-related routes that survive the rebuild

`app/api/admin/feedback/list-lite/route.ts`, `app/api/admin/feedback/categories/route.ts`, `app/api/admin/feedback/categories/[id]/route.ts` — feedback subsystem, not file handling. KEEP unchanged.

### Hard rule going forward

**NO new file-related Next.js routes are allowed.** Browser ↔ Python ↔ S3 only. ESLint rule banning new `app/api/(images|files|share|pdf)/*` routes lands in Phase 0 (see ESLint section below).

---

## app/ — page routes + provider mounts

### `<CloudFilesRealtimeProvider>` mount sites — the realtime reorganization

| File | Today | Action |
|---|---|---|
| `app/(a)/files/layout.tsx` | mounts provider wrapping the entire `/files/**` route tree (line 47) | DELETE the mount |
| `app/(a)/images/layout.tsx` | mounts provider wrapping the entire `/images/**` route tree (line 40) | DELETE the mount |
| `features/code/views/explorer/CloudFilesExplorer.tsx` | mounts provider locally in the code-editor explorer (line 97) | DELETE the mount |
| `features/window-panels/windows/cloud-files/CloudFilesWindow.tsx` | mounts provider in the window-panels CloudFiles surface (line 60) | DELETE the mount |
| `features/window-panels/windows/cloud-files/FilePreviewWindow.tsx` | mounts provider in file-preview window (line 64) | DELETE the mount (**5th mount, not in plan's "four mounts" count — see Open Questions**) |
| `app/Providers.tsx` | does NOT mount `CloudFilesRealtimeProvider` today; already mounts `<CloudFilesPickerHost>` and `<UploadGuardHost>` | MODIFY — add single global `<CloudFilesRealtimeProvider userId={...}>` mount gated on `userId` |
| `app/EntityProviders.tsx` | mounts `<CloudFilesPickerHost>` only | KEEP (no realtime provider here) |
| `app/(public)/PublicProviders.tsx` | no `CloudFilesRealtimeProvider` (confirmed by grep) | KEEP |

The plan's "four current mounts deleted" undercounts by one (FilePreviewWindow). Capture in the PR.

### `app/(a)/files/**` route tree — KEEP (entire tree survives)

| File | Action |
|---|---|
| `app/(a)/files/layout.tsx` | MODIFY (remove `CloudFilesRealtimeProvider` mount only) |
| `app/(a)/files/error.tsx` | KEEP |
| `app/(a)/files/loading.tsx` | KEEP |
| `app/(a)/files/[[...path]]/page.tsx` | KEEP |
| `app/(a)/files/[[...path]]/loading.tsx` | KEEP |
| `app/(a)/files/activity/page.tsx` | KEEP |
| `app/(a)/files/trash/page.tsx` | KEEP |
| `app/(a)/files/shared/page.tsx` | KEEP |
| `app/(a)/files/requests/page.tsx` | KEEP |
| `app/(a)/files/starred/page.tsx` | KEEP |
| `app/(a)/files/recents/page.tsx` | KEEP |
| `app/(a)/files/folders/page.tsx` | KEEP |
| `app/(a)/files/photos/page.tsx` | KEEP |
| `app/(a)/files/share/[token]/page.tsx` | KEEP (authenticated-side share view) |

### `app/(a)/images/**` route tree

`app/(a)/images/layout.tsx` — MODIFY (remove `CloudFilesRealtimeProvider` mount). All sub-pages KEEP. The Image Studio sub-pages (`convert/`, `studio/`, `studio-library/`, etc.) lose their reliance on `app/api/images/studio/process` when that Next route is deleted — they migrate to Python `POST /assets/preview` (component-agent scope).

### `app/(public)/share/[token]/` route — KEEP

`app/(public)/share/[token]/page.tsx`, `loading.tsx`, `_components/PublicDownloadButton.tsx` — KEEP. The component-level migration to talk directly to Python `/share/{token}` is component-agent scope; the route slot itself stays.

### `app/(authenticated)/(admin-auth)/administration/blob-cache/` — CREATE

Confirmed NOT present today (no `blob-cache` directory anywhere under `app/`). NEW admin observability route per plan §4A — created by the cache-layer agent. We're noting the route slot here so the parent layout chain knows about it. Will be gated by `selectIsSuperAdmin`.

---

## types/python-generated/ — OpenAPI regen

Confirmed contents of `types/python-generated/` today:

| File | Action | Notes |
|---|---|---|
| `types/python-generated/api-types.ts` | MODIFY (regen) | Already auto-generated via `openapi-typescript` (header at line 1–4). Run `pnpm sync-types` against the Python backend after matrx-utils v1.1.0 ships. Adds Asset/AssetVariant/AssetPreset/MediaRef as paths/components from OpenAPI. |
| `types/python-generated/openapi.json` | MODIFY (regen) | Live OpenAPI document — refreshed by `sync-types`. |
| `types/python-generated/llm-enums.ts` | KEEP | Unrelated (LLM models). |
| `types/python-generated/llm-params-enums.generated.ts` | KEEP | Unrelated. |
| `types/python-generated/llm-params.schema.json` | KEEP | Unrelated. |
| `types/python-generated/stream-events.ts` | KEEP | Streaming event schema. |
| `types/python-generated/stream-events.schema.json` | KEEP | Streaming event schema. |
| `types/python-generated/missing-types.ts` | DELETED (2026-07-15) | Absorbed: server-only wrappers generate into `stream-events.ts` (ServerOnlyRenderBlock); client-only types live in `components/mardown-display/markdown-classification/processors/utils/client-blocks.ts`. |
| `types/python-generated/AI_CORE_API.md` | KEEP | Doc. |
| `types/python-generated/CONTENT-BLOCK-RENDER-LEVELS.md` | KEEP | Doc. |
| `features/files/types.ts:1187-1311` (hand-authored AssetPreset / AssetVariant / Asset / AddAssetVariantsRequest / AssetPatchRequest / AssetPresetVariantDescriptor / AssetPresetDescriptor / PresetsRegistryResponse) | DELETE | 125 lines verified present. Replaced by regenerated types from OpenAPI. |
| `features/files/types.ts:1–1186 + 1312+` | MODIFY | Strip the deleted Asset block; the rest of `types.ts` (MediaRef interface starts line 62, plus 1300-line monolith) splits into `features/files/types/{domain,api,ui}.ts` per plan §6.2 (component-agent owns the split). |

**Total `features/files/types.ts` size today: 1311 lines** — confirms plan's "types.ts 1300 lines → domain.ts/api.ts/ui.ts" target.

---

## OpenAPI codegen pipeline — exists today

Found via `scripts/sync-types.mjs` (which orchestrates) + `package.json` script entries.

| Item | Today | After |
|---|---|---|
| `openapi-typescript` npm dep | **NOT present** in `package.json` (grep returned no match) | CREATE — add as devDep |
| `pnpm sync-types` script | PRESENT — orchestrates Steps 1 (Supabase types) → 2 (Python via `../aidream/scripts/sync-types.mjs`) → 3 (`tsc --noEmit`) | KEEP, but expose a focused `pnpm gen:types` alias that runs only the Python step |
| `pnpm sync-types:local` script | PRESENT — runs all 3 against `http://localhost:8000` | KEEP |
| `pnpm sync-types:fast` script | PRESENT — only Step 2 | KEEP (drives CI gate's tight loop) |
| `pnpm db-types` script | PRESENT — calls `supabase gen types typescript` | KEEP |
| CI gate (`pnpm gen:types && git diff --exit-code`) | **NOT present** (no `.github/workflows/` directory exists) | CREATE — see CI section below |
| OpenAPI URL source | `process.env.NEXT_PUBLIC_BACKEND_URL` or `https://server.app.matrxserver.com` | KEEP |
| Output path | `types/python-generated/api-types.ts` (via `outDir` const line 43) | KEEP |
| Dependency on `../aidream` repo | Script hard-fails if `../aidream/scripts/sync-types.mjs` is missing | MODIFY — consider making the script work without the aidream sibling (so a fresh checkout can regen types from any reachable backend) |

### Codegen pipeline — gaps to address in Phase 0

- Add `openapi-typescript` as a direct devDep (currently lives in `../aidream` per the indirection).
- Add a top-level `gen:types` script that does ONLY the Python OpenAPI regen — independent of Supabase + tsc — for CI use.
- Add a CI workflow (`.github/workflows/ci.yml` — must be CREATEd; the directory does not exist) that runs `pnpm gen:types && git diff --exit-code types/python-generated/`.

---

## package.json — deps + scripts

### Deps to remove

| Dep | Today | Action |
|---|---|---|
| `sharp` | `"sharp": "latest"` (line 221) + `"sharp"` in `serverExternalPackages` (line 303) | DELETE — only consumer is `app/api/images/studio/process/route.ts` which deletes |

### Deps to confirm present (verified via grep)

| Dep | Status |
|---|---|
| `dexie` | ✅ `"dexie": "^4.4.2"` |
| `react-pdf` | ✅ `"react-pdf": "^10.4.1"` |
| `pdfjs-dist` | ❌ NOT a direct dep — comes transitively via `react-pdf`. CREATE — add as direct devDep so `postinstall` can copy the worker reliably |
| `openapi-typescript` | ❌ NOT present — CREATE (devDep) |
| `idb-keyval` | ❌ NOT present — plan uses Dexie directly; flag as unneeded if confirmed |

### Scripts to add (CREATE)

| Script | Purpose |
|---|---|
| `postinstall` | Copy `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` → `public/pdfjs-worker.min.mjs` (plan §4A). The existing `build` script needs to keep working, so wire `postinstall` as a separate hook. |
| `build:sw` | Compile `features/files/cache/service-worker/src/sw.ts` → `public/blob-sw.js` (esbuild or `tsx`). Plan §4A. |
| `gen:types` | Thin wrapper for `pnpm sync-types:fast` against a configured `NEXT_PUBLIC_BACKEND_URL` — single-purpose script for the CI gate |
| `build` (MODIFY) | Wire `pnpm build:sw` into the build pipeline — current value: `ts-node scripts/generate-manifest.ts && tsx scripts/check-registry.ts && next build`. Insert `&& pnpm build:sw` before or after `next build` (likely BEFORE so the SW ships with the deploy). |

### `serverExternalPackages` entry to remove

`package.json` line 303 lists `"sharp"` in `serverExternalPackages` — DELETE together with the dep.

---

## ESLint — current vs. target

Single config file: `eslint.config.mjs` (flat config; legacy `.eslintrc.json` is gone). Faithfully audited.

### Already in place (relevant to this rebuild)

1. **`no-restricted-imports`** — blocks direct object-store client imports and points users at `features/files`.
2. **`no-restricted-syntax` — `fileHandlerSyntaxRestrictions`** — already bans:
   - `direct object-store SDK` member access on `(supabase|client|createClient)` (regex selector)
   - `supabase.from(...).getPublicUrl(...)` call shape
3. **`no-restricted-syntax` — `legacySupabaseKeyBan`** — env-var ban; unrelated to files, keep as-is.
4. **`no-restricted-globals` / `no-restricted-properties`** — bans `confirm`/`alert`/`prompt` — keep.
5. **File-handler / files override block** — `features/file-handler/**` and `features/files/**` get the `legacySupabaseKeyBan` only; the `fileHandlerSyntaxRestrictions` are exempted there (correct — internals own `direct object-store SDK`). After merge, the `features/file-handler/**` glob must be dropped (directory ceases to exist).
6. **`no-barrel-files/no-barrel-files`: `'warn'`** — keep.

### To add (Phase 0) — every rule in plan §6.4

1. `no-restricted-imports` — `@/features/file-handler/*` and `@/features/file-handler/**/*` (will not exist post-merge; this rule prevents accidental resurrection during the migration window)
2. `no-restricted-imports` — internal-only:
   - `@/features/files/api/**`
   - `@/features/files/client/**`
   - `@/features/files/state/**`
   - `@/features/files/resolver/**`
   - `@/features/files/cache/**`
3. `no-restricted-syntax` — `fetch('/files/...')`, `fetch('/assets/...')`, `fetch('/share/...')`, `fetch('/api/files/...')`, `fetch('/api/share/...')`, `fetch('/api/images/...')`, `fetch('/api/pdf/...')` — string-literal CallExpression patterns
4. `no-restricted-syntax` — manual `ImageBlock` / `AudioBlock` / `VideoBlock` / `DocumentBlock` object literals outside `features/files/**` (TS-aware regex on object-property name set)
5. `no-restricted-syntax` — manual `MediaRef` literals outside `features/files/state/converters.ts` (object with `file_id`/`url`/`file_uri` shape)
6. `no-restricted-syntax` — new Redux slices keyed `"files"|"file"|"cloud"` (selector on `createSlice({ name: '...' })`)
7. `no-restricted-syntax` — new `app/api/(images|files|share|pdf)/**/route.{ts,js}` files (project-wide guard via custom no-new-file rule OR a CI step grepping git status — choose whichever is enforceable)

### To remove (Phase 0 cleanup)

- The `features/file-handler/**` glob in the override block at line 172 — DELETE in the same PR that physically removes the directory.
- All "use the universal file handler from `features/file-handler` instead" messages — update to point at `features/files`.

---

## proxy.ts — Next.js 16 middleware replacement

`proxy.ts` (root, 37 lines, replaces `middleware.ts`):

- Pure Supabase session-refresh delegation: `proxy(req) => updateSession(req)`.
- Matcher excludes `api`, `_next/*`, static asset extensions, auth/error/info/dev pages.
- **No file-specific logic** — all auth/route guarding for files happens via the Supabase JWT layer + Python backend.

**Action: KEEP**. After SW lands, audit the matcher to ensure SW-managed URL families (`/files/*` rewrites if any, `/share/*`) still bypass `proxy.ts` correctly — but no change anticipated.

---

## lib/api/endpoints.ts — endpoint constants

Audited line-by-line. File-related entries:

| Constant | Current path | Action |
|---|---|---|
| `ENDPOINTS.utilities.pdfExtractText` | `/utilities/pdf/extract-text` (marked `@deprecated`) | DELETE — replaced by `ENDPOINTS.pdf.extractText` |
| `ENDPOINTS.pdf.compress` | `/utilities/pdf/compress` | MODIFY — point at the new `POST /assets/pdf-compress` envelope endpoint (plan E.17). Deletes `app/api/pdf/compress/route.ts` in the same PR. |
| `ENDPOINTS.pdf.extractText` | `/utilities/pdf/extract-text` | KEEP |
| `ENDPOINTS.pdf.*` (~25 entries) | `/utilities/pdf/...` | KEEP — these are remote-MediaRef-based JSON endpoints that already match the new model |
| `ENDPOINTS.pdf.documents` / `.document(id)` | `/utilities/pdf/documents` | KEEP (both marked `@deprecated` in comments — confirm at delete time) |
| `ENDPOINTS.media.uploadPodcastVideo` | `/media/podcast/upload-video` | KEEP — VIDEO uploads stay on `/media/podcast/...`; the docstring already notes that **image-only uploads now go through `ENDPOINTS.assets.upload` with `preset="podcast"`** |
| `ENDPOINTS.media.uploadPodcastImage` | NOT present | (already removed) |
| `ENDPOINTS.assets.upload` | `/assets` | KEEP — already matches plan §6.1 |
| `ENDPOINTS.assets.detail(id)` | `/assets/{id}` | KEEP |
| `ENDPOINTS.assets.patch(id)` | `/assets/{id}` | MODIFY docstring to reflect the union body (plan A.2 — adds `share/permissions/variants` to the PATCH body after matrx-utils v1.1.0 lands) |
| `ENDPOINTS.assets.addVariants(id)` | `/assets/{id}/variants` | KEEP |
| `ENDPOINTS.assets.presets` | `/assets/presets` | KEEP |
| `ENDPOINTS.assets.forFile(id)` | `/files/{id}/asset` | KEEP |
| `ENDPOINTS.research.document(id)` / `.sources(id)` / etc. | `/research/{id}/document` etc. | KEEP — research files survive |

**To add (plan §6.1 — must land with matrx-utils v1.1.0):**

| New constant | Path | Source |
|---|---|---|
| `ENDPOINTS.assets.preview` | `POST /assets/preview` | plan E.16 |
| `ENDPOINTS.assets.pdfCompress` | `POST /assets/pdf-compress` | plan E.17 |
| `ENDPOINTS.assets.fromReference` | `POST /assets/from-reference` | plan §1, item 4 (MediaRef-only attach) |
| `ENDPOINTS.files.bulk` | `POST /files/bulk` | plan A.3 |

`BACKEND_URLS` at the bottom of the file — KEEP. Already env-driven.

---

## hooks/useBackendApi.ts

Confirmed present (61+ lines). Thin React wrapper around `fetch` with auth headers + base URL from Redux (`apiConfigSlice.selectResolvedBaseUrl`).

**Action: KEEP**. Used by public-route components that can't use `dispatch(callApi())` thunks. No file-specific logic. The new file hooks (`useFile`, `useFileUpload`, etc.) compose their own fetches via `lib/api/backend-client.ts` and `lib/api/call-api.ts` — they do NOT go through `useBackendApi`.

Adjacent files in `lib/api/` (all KEEP):

- `lib/api/backend-client.ts`
- `lib/api/call-api.ts`
- `lib/api/stream-parser.ts`
- `lib/api/errors.ts`
- `lib/api/types.ts`
- `lib/api/ai-models.ts`
- `lib/api/warm-helpers.ts`

---

## Vercel / CI

| File | Action | Notes |
|---|---|---|
| `vercel.json` | **NOT present** | KEEP absence — Vercel auto-detection works for this project. No multi-service split needed for this rebuild. |
| `.github/workflows/` | **NOT present** (no `.github` directory) | CREATE — `.github/workflows/ci.yml` with: 1) `pnpm install --frozen-lockfile` 2) `pnpm gen:types` 3) `git diff --exit-code types/python-generated/` (gates drift) 4) `pnpm lint` 5) `pnpm tsc --noEmit` 6) `pnpm test` |
| `next.config.js` | MODIFY (minimal) | Lines 94–95 already handle the `/cloud-files` → `/files` redirect; no further file-route work needed. Audit `serverExternalPackages` to remove `"sharp"` once that dep goes (currently around line 303 of `package.json` — `next.config.js` may also reference). |

`next.config.js` has no references to `image-proxy`, `images/studio`, `pdf/compress`, `files/download`, `share/*` routes — confirmed via grep. Redirects only cover the historical `/cloud-files` → `/files` path move.

---

## docs/ — files to update in the same PR

| Doc | What changes |
|---|---|
| `CLAUDE.md` | Update the **File handling — single entry point** section to drop `features/file-handler/` references and point at `features/files/README.md`. Update non-negotiables list to match new public surface (`useFile`, `useFileSrc`, `useFileBlob`, `useFileUpload`, `useFileMutation`, `<InlineMediaRef>`). |
| `features/file-handler/FEATURE.md` | DELETE (entire `features/file-handler/` dir folds into `features/files/`) |
| `features/files/FEATURE.md` | RENAME to `README.md` and merge handler FEATURE.md content into it. Bump status to reflect post-rebuild architecture. |
| `features/files/SKILL.md` | MODIFY — update non-negotiables to match new public surface; add ESLint rule list. |
| `features/files/for_python/REQUESTS.md` | MODIFY — flip resolved gap items (A.1–F.18) to ✅ once matrx-utils v1.1.0 ships. |
| `features/files/from_python/UPDATES.md` | MODIFY — append matrx-utils v1.1.0 changes when shipped. |
| `docs/CDN_INTEGRATION.md` | KEEP (re-read; confirm still accurate or queue updates as out-of-scope) |
| `features/image-manager/FEATURE.md` line 47 | MODIFY — note that `image-proxy` survives the rebuild (or schedule its deletion as a follow-up). |
| `features/image-manager/IMAGE-FEATURE-INVENTORY.md` lines 155, 213, 259, 275, 309 | MODIFY — sync references to `image-proxy` survival decision. |

---

## Migration dependencies (ordered)

1. **Phase 0 ESLint rules land first** (blocks new bypasses) — no BE dependency
2. **Phase 0: `package.json` script additions** — `gen:types`, `build:sw`, `postinstall`. Add `openapi-typescript` + `pdfjs-dist` as direct devDeps. No CI workflow yet (next step).
3. **Phase 0: `.github/workflows/ci.yml` CREATE** — adds the `gen:types && git diff --exit-code` drift gate; runs lint + typecheck + test.
4. **Backend matrx-utils v1.1.0 ships** (out of our control) — unlocks `POST /assets/preview`, `POST /assets/pdf-compress`, combined-ops on `POST /assets` + `PATCH /files/{id}`.
5. **`types/python-generated/api-types.ts` regen** against the new BE OpenAPI — this is the moment `Asset`/`AssetVariant`/`AssetPreset`/`MediaRef` come from OpenAPI rather than hand-authored.
6. **Delete hand-authored Asset block** (`features/files/types.ts:1187–1311`) in the same commit as the regen — CI drift gate would catch any mismatch.
7. **SW + IDB scripts in `package.json` land with the SW source** (the cache-layer agent ships the SW source files; build:sw script is Phase 0 but doesn't run until source exists).
8. **`<CloudFilesRealtimeProvider>` move to `Providers.tsx` + per-route deletions are atomic in ONE PR** — 5 mounts go, 1 mount appears. Realtime middleware logic itself doesn't change.
9. **`sharp` removal must follow deletion of `app/api/images/studio/process`** — same PR. Remove from `package.json` dependencies AND from `serverExternalPackages` AND from `next.config.js` if referenced there.
10. **PDF compress route deletion** — pairs with FE callsite migration to new `ENDPOINTS.assets.pdfCompress`.
11. **ESLint `features/file-handler/**` exemption removal** — same PR as physical directory deletion.

---

## Open questions for the user

1. **Plan vs reality on already-deleted routes.** Plan §6.3 lists `app/api/images/proxy/route.ts` and `app/api/files/download/route.ts` as already deleted, but git's deletion history shows `app/api/files/content/route.ts` and `app/api/share/[token]/file/route.ts` instead. The historical `app/api/proxy-image` route (mentioned in `features/image-manager/CLEANUP-CANDIDATES.md` line 80) was deleted earlier — but `app/api/image-proxy/route.ts` is **still live** and not in the plan's deletion list. Confirm intent:
   - Keep `image-proxy` (current Image Manager dep) or delete it as part of "no Next.js routes for files"?
2. **`CloudFilesRealtimeProvider` count.** Plan says "four current mounts deleted" — I found **five**: `app/(a)/files/layout.tsx`, `app/(a)/images/layout.tsx`, `features/code/views/explorer/CloudFilesExplorer.tsx`, `features/window-panels/windows/cloud-files/CloudFilesWindow.tsx`, `features/window-panels/windows/cloud-files/FilePreviewWindow.tsx`. The 5th (FilePreviewWindow) likely wraps a transient floating preview — confirm it should also collapse into the global mount in `Providers.tsx`.
3. **`pdfjs-dist` direct dep.** Currently transitive via `react-pdf`. Plan §4A wants a `postinstall` script that copies the worker from `node_modules/pdfjs-dist/build/`. Should we pin it as a direct devDep to guarantee the path? (Yes recommended.)
4. **`openapi-typescript` location.** `scripts/sync-types.mjs` delegates to `../aidream/scripts/sync-types.mjs`, which presumably has `openapi-typescript` as a dep. For CI to run `pnpm gen:types` reliably without the `../aidream` sibling, either (a) add `openapi-typescript` as a direct devDep and inline the OpenAPI fetch into a local script, OR (b) require the CI runner to also check out `aidream`. Option (a) is cleaner — confirm direction.
5. **`build:sw` build-system choice.** Plan §4A says `features/files/cache/service-worker/src/sw.ts → public/blob-sw.js`. Use `esbuild` (no current dep), `tsx` (already present), or Turbopack? Recommend `esbuild` as a devDep — fastest, ESM-native, no config noise.
6. **CI host.** No `.github/workflows/` directory exists today. Are PRs gated by another CI system (Vercel build only), or is this the first GitHub Actions workflow for the repo? If Vercel-only, the `gen:types` drift check must live in `package.json`'s `build` script (less ideal — it runs on every preview deploy instead of as a fast PR gate).
7. **`features/files/types.ts` split**. Plan §6.2 says `types.ts → domain.ts/api.ts/ui.ts`. Confirmed 1311 lines today. The hand-authored Asset block (1187–1311) deletes; the remaining 1186 lines split. Component-agent owns this split — flagging here so this inventory's "MODIFY" on the file isn't double-counted.
