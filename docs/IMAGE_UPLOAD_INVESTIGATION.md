# Image Upload System — Investigation & Proposal

**Date:** 2026-05-12
**Scope:** Cross-repo (matrx-frontend + aidream Python backend)
**Symptom that started this:** `AssetUploader` in `PodcastForm.tsx` is generating wrong/missing variants and returning `/share/{token}` URLs instead of permanent Cloudflare CDN URLs.
**Real problem:** Image processing was forked into a Next.js+Sharp route that fights the canonical Python pipeline, and even the canonical Python pipeline has a bug that throws away the CDN URL it just earned.

This document is the full picture: where every piece lives, exactly what's broken in each layer, and the minimum set of changes to put it back on rails permanently — for podcasts AND every other consumer.

---

## Part 1 — How image uploads are *supposed* to work in this codebase

There are three independent Python systems for handling images. Knowing which one is for what is the entire investigation.

### System A — Podcast/asset variants (`podcast_media.py`) — the right one for public assets

- **Endpoint:** `POST /media/podcast/upload-image` and `POST /media/podcast/upload-video`
- **File:** `/Users/armanisadeghi/code/aidream/aidream/api/routers/podcast_media.py`
- **What it does:** Accepts one upload, runs every variant in `PODCAST_VARIANTS` (a list of `{key, suffix, width, height, quality, format}` dicts), writes each variant to cloud-files with `visibility="public"`, returns the URLs.
- **Why it's correct for public assets:** every variant is written to the `cdn.matrxserver.com` bucket fronted by Cloudflare, so the backend has the CDN URL available the moment the write returns.
- **Variant definitions:** `PODCAST_VARIANTS` is defined in `/Users/armanisadeghi/code/aidream/packages/matrx-utils/matrx_utils/file_handling/specific_handlers/image_handler.py:58-63`:
  - `cover_url` — 3000×3000 (Apple Podcasts / Spotify hi-res)
  - `cover_sd_url` — 1400×1400 (legacy SD)
  - `og_url` — 1200×630 (OG/Twitter/LinkedIn/Facebook)
  - `thumbnail_url` — 400×400 (UI)
- **Sibling preset lists in the same file** that already exist and are unused for live uploads today:
  - `SOCIAL_VARIANTS` — `image_handler.py:66-72` — og, ig square, ig portrait, ig story, yt thumbnail
  - `WEB_VARIANTS` — `image_handler.py:75-82` — hero 1920×1080, og, card, touch icon, pwa icon, thumb
  - `EMAIL_VARIANTS` — `image_handler.py:85-88` — email header 600×200, email square 200×200
  - `ALL_VARIANTS` — `image_handler.py:91` — concatenation of podcast + social + web

### System B — Vision master (`media.py`) — NOT for public assets

- **Endpoint:** `POST /media/upload`, `GET /media/{file_id}/v/{vision_class}`
- **File:** `/Users/armanisadeghi/code/aidream/aidream/api/routers/media.py`
- **What it does:** Uploads a "vision master" image to `u/{user_id}/{folder}/{uuid}/master.{ext}` with `visibility="private"`. Renders "vision classes" lazily on demand (or eagerly via the `eager_variants` form param).
- **Why it's wrong for our use case:**
  - Master is stored **private** — even when public was wanted, it goes to the private bucket.
  - All returned URLs are **signed URLs with a 1-week TTL** (`expires_in=7*24*3600`) — they expire. They are not CDN URLs.
  - The `vision_class` registry is `matrx_ai.processing.vision.VISION_API_CLASSES` — these are AI-model-tuned encoders (`anthropic_opus_hires`, `gemini3_high`, etc.), **not** social-media sizes.
- **When to use it:** Feeding images to LLMs. Never for public-page assets.

### System C — Image Studio presets (`image_studio_presets.py`) — ad-hoc render-only, not persistence

- **File:** `/Users/armanisadeghi/code/aidream/packages/matrx-utils/matrx_utils/file_handling/specific_handlers/image_studio_presets.py`
- **What it is:** A catalog of every standard social/web/icon size as a `StudioPreset` (`og-image`, `ig-square`, `avatar-xl`, `logo-large`, `favicon-32`, etc.).
- **Where it's used:** `/Users/armanisadeghi/code/aidream/aidream/api/routers/image_studio.py` for the Image Studio render-on-demand UI in `features/image-studio/`. Returns bytes, doesn't persist to cloud-files.
- **Why it's *not* the answer here:** these are render-only specs, not a persisted-asset pipeline. They could be the *menu* the asset endpoint draws from, but they don't replace System A.

### The cloud-files / CDN substrate that both Python and Next.js sit on

- **Two S3 buckets** in `us-east-2` (per `docs/CDN_INTEGRATION.md:31-35`):
  - `matrx-user-files` — fully private. Holds `visibility="private"` and `"shared"`.
  - `cdn.matrxserver.com` — public-read, fronted by Cloudflare. Holds `visibility="public"`.
- **Upload response shape** (`docs/CDN_INTEGRATION.md:47-72`): `POST /files/upload` returns `url` AND `cdn_url`. For public files `cdn_url` is the permanent Cloudflare URL (with `?v=<checksum[:8]>` cache-buster). For private it's `null`.
- **`CloudFile.publicUrl`** in Redux (`features/files/types.ts`, mapped in `features/files/redux/converters.ts`) holds the CDN URL when present, `null` otherwise.

So the *whole point* of the cloud-files layer is: write with `visibility="public"`, get a permanent CDN URL back, render it directly forever.

---

## Part 2 — What's actually broken

### Bug 1 — The whole Next.js Sharp route should not exist

- **File:** `/Users/armanisadeghi/code/matrx-frontend/app/api/images/upload/route.ts` (312 lines)
- **What it does:** Receives an image, runs `sharp(...).resize(...).jpeg(...)` server-side in Node, uploads each variant via `Api.Server.uploadFile` → Python `/files/upload`, returns a fixed shape.
- **Why it shouldn't exist:**
  - Sharp on Vercel duplicates work Python already does better (Pillow + mozjpeg + pillow-heif + pillow-avif, per `image_handler.py:14-38`). Especially HEIC from iPhones — Sharp on Vercel is unreliable, Python is explicit.
  - The variant definitions live here, in `ts`, instead of in the canonical Python `image_handler.py` — two registries that drift.
  - The folder layout is decoupled from any entity. It writes to `Images/<folder>/<uuid>/` — not `Audio/Podcasts/<podcastId>/`, not `Agent Apps/<appId>/`, etc.
  - Adds a serverless function cold start (Sharp ≈ 50 MB layer) to every image upload for no benefit.
- **The agent-introduced regression** the user is reacting to: when this was added, the call site in `AssetUploader.tsx` was changed from `api.upload(ENDPOINTS.media.uploadPodcastImage, ...)` to `fetch('/api/images/upload', ...)`, abandoning `PODCAST_VARIANTS` (3000² cover, 1400² SD) in favor of the smaller Next-side `social` preset (1400² cover, 1200×630 OG, 400² thumb, 128² tiny). 3000² Apple Podcasts hi-res cover is just gone.

### Bug 2 — Even Python's `/media/podcast/upload-image` returns signed URLs instead of CDN URLs

This is the *real* "returning data instead of CDN url" the user is seeing for podcasts created today.

- **File:** `/Users/armanisadeghi/code/aidream/aidream/api/routers/podcast_media.py`
- **Lines 49–60:**
  ```python
  result = await fm.sync_engine.managed_write_async(
      file_path, data, mime_type=mime,
      visibility="public",      # ← uploads to cdn.matrxserver.com bucket ✓
      metadata={"source": "podcast_media", "variant": key},
  )
  if result.url:
      url = await fm.sync_engine._router.get_url_async(
          result.storage_uri, expires_in=URL_EXPIRES_IN   # ← re-signs the S3 URI, 7-day TTL ✗
      )
      urls[key] = url
  ```
- **What's wrong:** `managed_write_async` with `visibility="public"` returns a `result` whose `url`/`cdn_url` field already holds the permanent Cloudflare URL (per `docs/CDN_INTEGRATION.md:47-72` and `aidream/api/routers/files.py:upload_file_endpoint`). The next two lines throw it away and re-call `get_url_async` with an `expires_in`, which produces a **1-week S3-signed URL**.
- **Result:** the FE persists a URL like `https://matrx-user-files.s3.amazonaws.com/.../cover.jpg?X-Amz-Signature=...&X-Amz-Expires=604800` into `podcasts.image_url`. **It dies in 7 days.**
- **Fix:** prefer `result.url` / `result.cdn_url` whenever it's a public file; only fall back to `get_url_async` for private files.

### Bug 3 — `AssetUploader`'s local type silently drops `tiny_url`

- **File:** `/Users/armanisadeghi/code/matrx-frontend/features/podcasts/components/admin/AssetUploader.tsx`
- **Lines 37-42:**
  ```ts
  export interface AssetUrls {
      image_url: string | null;
      og_image_url: string | null;
      thumbnail_url: string | null;
      video_url: string | null;
  }
  ```
- `ImageAssetUploader.onComplete` produces `tiny_url`. `AssetUrls` doesn't have it. So `AssetUploader.handleImageComplete` (lines 90-105) destructures only three of the four and the 128² icon is silently dropped before reaching `PodcastForm`.

### Bug 4 — Next.js preset lists are *mutually exclusive* — no auto OG image baseline

- **File:** `/Users/armanisadeghi/code/matrx-frontend/app/api/images/upload/route.ts:60-87`
- The presets don't compose. If you pick `preset=avatar` you get `400 / 128 / 48` — **no OG image, no 1200×630 social card**. So an org logo upload has no shareable social card unless the dev manually generates it. The user's exact complaint: "*some sizes are highly HIGHLY standard for just about anything we do because they have to have proper social sharing versions and things like that so those need to be automatic.*"
- The Python `PODCAST_VARIANTS` is the same — it bakes OG in because that variant list was hand-tuned for podcasts. There is no general "every preset always renders an OG card" mechanism anywhere.

### Bug 5 — Frontend assumes "preset=social" but routes through a podcast-specific URL pipeline

- **File:** `/Users/armanisadeghi/code/matrx-frontend/features/podcasts/components/admin/AssetUploader.tsx:162-168`
  ```tsx
  <ImageAssetUploader
      onComplete={handleImageComplete}
      preset="social"     // ← 1400² cover, NOT Apple Podcasts' 3000²
      currentUrl={currentImageUrl ?? null}
      label="Cover Image"
      allowUrlPaste={false}
  />
  ```
- Apple Podcasts requires 3000×3000 minimum. Today, podcast covers ship at 1400². Even before bug 2 ate the URLs, the image was wrong-sized.

### Bug 6 — Folder placement is wrong for podcasts (and several other consumers)

- The Next.js route writes podcast covers to `Images/Generated/<uuid>/` (`app/api/images/upload/route.ts:266-269`) instead of `Audio/Podcasts/<podcastId>/` (`features/files/utils/folder-conventions.ts:138-140`). The folder-conventions file has a `folderForPodcast()` helper that nobody is calling because the route ignores it.
- Same problem for org logos, agent app icons, profile photos — they all end up in `Images/Generated/<uuid>/` instead of the entity-specific folder.

---

## Part 3 — Full call-graph: who's using the broken pipelines today

### Callers of the Next.js Sharp route `/api/images/upload`

| Caller | File | Preset used | Folder | Right destination |
|---|---|---|---|---|
| Podcast cover (via `AssetUploader`) | `features/podcasts/components/admin/AssetUploader.tsx` | `social` | none | `Audio/Podcasts/<podcastId>/`, preset `podcast` |
| Organization logo | `features/organizations/components/CreateOrgModal.tsx` | `logo` | `organizations/logos` | should stay roughly where it is, preset `logo` + social baseline |
| Organization settings | `features/organizations/components/GeneralSettings.tsx` | (check) | (check) | same as above |
| Image studio embedded | `features/image-studio/components/EmbeddedImageStudio.tsx` | (check) | studio | unchanged — different flow |
| Image edit shell | `app/(a)/images/edit/EditShellClient.tsx` | (check) | studio | unchanged |
| Profile photo tab | `features/image-manager/components/ProfilePhotoTab.tsx` | (check) | avatars | preset `avatar` + social baseline |
| Branded upload tab | `features/image-manager/components/BrandedUploadTab.tsx` | (check) | (check) | preset `web` + social baseline |
| Cloud upload tab | `components/image/cloud/CloudUploadTab.tsx` | mode=`cloud` | varies | unchanged — uses `useGuardedFileUpload`, not Sharp |
| HTML preview modal | `features/html-pages/components/HtmlPreviewModal.tsx` | (check) | (check) | (check) |
| Image uploader window | `features/window-panels/windows/image/ImageUploaderWindow.tsx` | (check) | varies | varies |
| Applet builder create tab | `features/applet/builder/modules/applet-builder/CreateAppletTab.tsx` | (check) | (check) | preset `logo` or `web` |
| Image manager `BrandedUploadTab` | `features/image-manager/components/BrandedUploadTab.tsx` | (check) | (check) | preset `web` |
| Image manager `ProfilePhotoTab` | `features/image-manager/components/ProfilePhotoTab.tsx` | (check) | avatars | preset `avatar` |
| Tests | `components/official/__tests__/ImageAssetUploader.test.ts` | — | — | rewrite |
| Admin component-displays demo | `app/(authenticated)/(admin-auth)/administration/official-components/component-displays/image-asset-uploader.tsx` | — | — | rewrite |

(All references found via `grep "ImageAssetUploader"` and `grep "AssetUploader"` — see lists at end of doc.)

### Callers of Python `/media/podcast/upload-image`

| Caller | File | Notes |
|---|---|---|
| Old code path before regression | — | The route is currently called *only* by `AssetUploader.tsx` for video uploads (`/upload-video`). Nobody calls `/upload-image` from the FE today. |

### Callers of Python `/media/upload` (vision-master)

| Caller | File | Notes |
|---|---|---|
| (none) | — | Not registered in `lib/api/endpoints.ts`. No FE caller. |

---

## Part 4 — What needs to change, in dependency order

### Phase P (Python) — 2 changes in 2 files

**P1. Fix the signed-URL-instead-of-CDN-URL bug** in `_store_image_variants`.

- **File:** `/Users/armanisadeghi/code/aidream/aidream/api/routers/podcast_media.py:36-64`
- **Change:** after `managed_write_async(..., visibility="public", ...)`, prefer `result.url` (the CDN URL — `docs/CDN_INTEGRATION.md:47-72`) instead of re-signing via `get_url_async`. Fall back to `get_url_async` only when the file is private.
- **Effect:** Every public variant returns a permanent `https://cdn.matrxserver.com/...?v=<checksum>` URL. The 7-day expiry on podcast URLs goes away forever.
- **Verification:** confirm the `WriteResult` from `sync_engine.managed_write_async` exposes the CDN URL field for public uploads — based on `docs/CDN_INTEGRATION.md` it should match the `cdn_url` field on `FileUploadResponse`. The doc explicitly points to the source of truth: `packages/matrx-utils/.../cloud_sync/cdn.py::public_url_for(record)` and `packages/matrx-utils/.../cloud_sync/sync_engine.py`.

**P2. Generalize the endpoint into `POST /media/upload-asset`** with a `preset` form parameter and a mandatory `social-baseline` merge.

- **File:** add to `/Users/armanisadeghi/code/aidream/aidream/api/routers/podcast_media.py` (rename file to `asset_media.py` when convenient — not on the critical path) OR add a new router.
- **Schema additions to `image_handler.py`:**
  - Add `LOGO_VARIANTS` (512², 200², 64²)
  - Add `AVATAR_VARIANTS` (400², 256², 128², 64², 32²)
  - Add `FAVICON_VARIANTS` (192², 180 apple-touch, 32², 16²)
  - Add a `SOCIAL_BASELINE: list[ImageVariant]` = `[og_1200x630, thumbnail_400, tiny_128]` — this is the "every public asset gets these" baseline.
- **New endpoint signature:**
  ```python
  @router.post("/media/upload-asset", response_model=AssetUploadResponse)
  async def upload_asset(
      file: UploadFile = File(...),
      preset: str = Form(...),         # "podcast" | "social" | "web" | "email" | "logo" | "avatar" | "favicon"
      folder: str = Form(...),         # e.g. "Audio/Podcasts/<id>", "Agent Apps/<id>"
      visibility: str = Form(default="public"),
      user_id: str = Depends(require_user_id),
  ) -> AssetUploadResponse:
      variants = PRESET_TO_VARIANTS[preset] + SOCIAL_BASELINE   # always merged, dedup'd by key
      urls, file_id = await _store_image_variants(fm, image_bytes, folder, variants, visibility)
      return AssetUploadResponse(...)
  ```
- **Response shape:**
  ```python
  class AssetUploadResponse(BaseModel):
      file_id: str
      primary_url: str        # preset-defined main variant (cover for podcast, hero for web, logo for logo, etc.)
      image_url: str          # alias of primary_url
      og_image_url: str       # GUARANTEED (from baseline)
      thumbnail_url: str      # GUARANTEED (from baseline)
      tiny_url: str | None    # GUARANTEED (from baseline) when image is large enough
      variants: dict[str, str]   # all rendered variants by key
      preset: str
      folder: str
      visibility: Literal["public", "private", "shared"]
  ```
- **Keep `/media/podcast/upload-image` and `/upload-video` working** for back-compat. `upload-image` becomes a thin wrapper that calls the new generalized helper with `preset="podcast"` and `folder=f"podcast/{uuid4()}"`. `upload-video` keeps its current behavior, just uses the fixed `_store_image_variants` (so the extracted cover frame also gets CDN URLs).

After P1 + P2 ship, regenerate `types/python-generated/api-types.ts` so `AssetUploadResponse` flows into the FE.

### Phase F (Frontend) — sweep and replace

**F1. Add the new endpoint to the canonical endpoints file.**

- **File:** `/Users/armanisadeghi/code/matrx-frontend/lib/api/endpoints.ts:298-303`
- Add `uploadAsset: "/media/upload-asset"` to the `media` section.

**F2. Rewrite `ImageAssetUploader` so its `mode="asset"` branch calls Python directly.**

- **File:** `/Users/armanisadeghi/code/matrx-frontend/components/official/ImageAssetUploader.tsx`
- **Surgery:**
  - Lines 278-309 (the `uploadFile` function): replace the `fetch('/api/images/upload', ...)` block with `api.upload(ENDPOINTS.media.uploadAsset, formData)` (via `useBackendApi()`).
  - Lines 60-89, 134-163 (`IMAGE_PRESETS` import + `PRESET_VARIANT_LABELS` + `PRESET_BLURB`): drop the import from `app/api/images/upload/route` (which is about to be deleted). Replace `ImagePreset` with a local string literal type, OR import the regenerated Python type for the preset enum.
  - Lines 44-49 (`ImageUploaderVariants`): expand to the canonical `AssetUploadResponse` shape (or convert in-line). Keep `tiny_url` — and add `variants: Record<string, string>` for any caller that wants the full bag.
  - `mode="cloud"` branch (lines 311-352) is unchanged — that's `useGuardedFileUpload` and it's correct.
- **Default `preset` and `folder`:** add a contract — every callsite must pass `folder`, picked from `CloudFolders` / the dynamic helpers in `features/files/utils/folder-conventions.ts`. We can keep `social` as the default preset only because the social baseline is now always merged.

**F3. Delete the Next.js Sharp route and its tests.**

- **Delete file:** `/Users/armanisadeghi/code/matrx-frontend/app/api/images/upload/route.ts`
- **Delete test:** `/Users/armanisadeghi/code/matrx-frontend/components/official/__tests__/ImageAssetUploader.test.ts` (and rewrite test to mock `useBackendApi`).
- Remove `sharp` from `package.json` if no other route uses it. Check first.

**F4. Rewrite `features/podcasts/components/admin/AssetUploader.tsx`.**

- Drop the local `AssetUrls` type (which loses `tiny_url`). Consume the canonical `AssetUploadResponse` directly.
- Pass `preset="podcast"` and `folder={folderForPodcast(podcastId)}` to `ImageAssetUploader` so podcasts get 3000² covers and land in `Audio/Podcasts/<podcastId>/`.
- The video upload section already calls Python correctly via `api.upload(ENDPOINTS.media.uploadPodcastVideo, ...)` — leaves alone.
- After P1 fixes the signed-URL bug, the extracted-frame variants from `/upload-video` also become CDN URLs, no FE change needed.

**F5. Update every caller of `ImageAssetUploader` to pick the right preset + folder.**

Edit each file in the table at the end:
- **Organizations:** `preset="logo"`, `folder="Shared Assets/orgs/<orgId>/logo"` (or wherever the existing convention is — `CreateOrgModal.tsx` currently passes `folder="organizations/logos"`).
- **Profile photo:** `preset="avatar"`, `folder={CloudFolders.IMAGES_AVATARS + "/" + userId}`.
- **Agent apps / applets:** `preset="logo"`, `folder={folderForAgentApp(appId)}`.
- **Image manager generic:** unchanged (uses cloud mode).

**F6. PodcastForm.tsx is going to need 2 fields, not 3.**

- **File:** `/Users/armanisadeghi/code/matrx-frontend/features/podcasts/components/admin/PodcastForm.tsx`
- The `image_url`, `og_image_url`, `thumbnail_url` triplet currently persisted on `podcasts` rows is fine. After the fix they will all be Cloudflare CDN URLs. Plus we should consider persisting `cover_url` (3000²) for Apple Podcasts hi-res — open question, depends on DB schema.

---

## Part 5 — Net effect (after all changes ship)

1. **One Python endpoint** (`POST /media/upload-asset`) handles every public-asset upload everywhere — podcasts, orgs, applets, profile photos, agent apps.
2. **One TypeScript type** (`AssetUploadResponse`, auto-generated from the Python OpenAPI) is the canonical response shape. No FE-side drift.
3. **Permanent Cloudflare CDN URLs** persisted into the DB. No more 1-week expiry on podcast covers.
4. **OG image + 400² thumbnail + 128² tiny are baseline variants on every preset** — every public asset has working social sharing previews automatically. The "highly HIGHLY standard sizes" requirement is structural, not opt-in.
5. **No Sharp on Vercel.** Python (Pillow + mozjpeg + pillow-heif + pillow-avif) is the only image-variant authority. HEIC uploads from iPhones work reliably.
6. **Entity-correct folders.** Podcast covers land in `Audio/Podcasts/<podcastId>/`, org logos in their orgs folder, agent app icons in `Agent Apps/<appId>/`, etc. — surfaced cleanly in `/files`.
7. **Apple Podcasts' 3000² requirement** is honored (it's already in `PODCAST_VARIANTS` — the bug is only that the FE was sending `preset=social` after the regression).

---

## Part 6 — File / line references (quick index)

### Python (aidream)
- `/Users/armanisadeghi/code/aidream/aidream/api/routers/podcast_media.py` — image+video endpoints, lines 36-64 are the CDN-URL bug.
- `/Users/armanisadeghi/code/aidream/aidream/api/routers/media.py` — vision-master endpoint (not relevant for public assets).
- `/Users/armanisadeghi/code/aidream/packages/matrx-utils/matrx_utils/file_handling/specific_handlers/image_handler.py:58-91` — `PODCAST_VARIANTS`, `SOCIAL_VARIANTS`, `WEB_VARIANTS`, `EMAIL_VARIANTS`, `ALL_VARIANTS`. New `LOGO_VARIANTS` / `AVATAR_VARIANTS` / `FAVICON_VARIANTS` / `SOCIAL_BASELINE` go here.
- `/Users/armanisadeghi/code/aidream/packages/matrx-utils/matrx_utils/file_handling/specific_handlers/image_studio_presets.py` — Studio render-only presets (not the persistence path).
- `/Users/armanisadeghi/code/aidream/packages/matrx-utils/.../cloud_sync/cdn.py::public_url_for(record)` — source of truth for "should this be a CDN URL".
- `/Users/armanisadeghi/code/aidream/packages/matrx-utils/.../cloud_sync/sync_engine.py` — the engine that `managed_write_async` lives on.

### Next.js (matrx-frontend)
- `app/api/images/upload/route.ts` — **TO DELETE** (312 lines). The Sharp route.
- `components/official/ImageAssetUploader.tsx` — primary uploader component, lines 278-309 are the broken upload call; lines 60-89 are the local preset list to remove.
- `features/podcasts/components/admin/AssetUploader.tsx` — podcast wrapper that needs to drop its local `AssetUrls` type (lines 37-42) and let `ImageAssetUploader` produce the canonical shape.
- `features/podcasts/components/admin/PodcastForm.tsx` — only needs an update if we want to persist `cover_url` (3000²) as a new field.
- `lib/api/endpoints.ts:298-303` — add `media.uploadAsset` here.
- `types/python-generated/api-types.ts:14636-14650` — `PodcastMediaUploadResponse`. After P2 ships, regenerate; `AssetUploadResponse` will appear.
- `types/python-generated/api-types.ts:17376-...` — `VisionMediaUploadResponse` (irrelevant to this work).
- `features/files/utils/folder-conventions.ts` — `CloudFolders` + `folderForPodcast()` / `folderForAgentApp()` / `folderForTask()` etc. + `resolveDefaultVisibility()`. Already correct, just needs callers to use it.
- `features/files/redux/converters.ts:374-388` — `CloudFile.publicUrl` mapping.
- `docs/CDN_INTEGRATION.md` — definitive wire-format spec for CDN vs signed URLs (lines 47-72 show the response shape).
- `features/files/FEATURE.md` — file system docs, mentions `cdn_url` and `CloudFolders.AUDIO_PODCASTS`.
- `hooks/useBackendApi.ts` — the right way to call Python from the FE.

### All `ImageAssetUploader` consumers (sweep targets — F5)
- `components/image/cloud/CloudUploadTab.tsx`
- `features/applet/builder/modules/applet-builder/CreateAppletTab.tsx`
- `features/html-pages/components/HtmlPreviewModal.tsx`
- `features/image-manager/components/BrandedUploadTab.tsx`
- `features/image-manager/components/ProfilePhotoTab.tsx`
- `features/image-studio/components/EmbeddedImageStudio.tsx`
- `features/organizations/components/CreateOrgModal.tsx`
- `features/organizations/components/GeneralSettings.tsx`
- `features/podcasts/components/admin/AssetUploader.tsx`
- `features/window-panels/windows/image/ImageUploaderWindow.tsx`
- `features/window-panels/windows/image/callbacks.ts`
- `app/(a)/images/edit/EditShellClient.tsx`
- `app/(authenticated)/(admin-auth)/administration/official-components/component-displays/image-asset-uploader.tsx`
- `app/(authenticated)/(admin-auth)/administration/official-components/parts/component-list.tsx`
- `components/official/__tests__/ImageAssetUploader.test.ts`

### Files mentioning `/api/images/upload` (sweep targets — should all be zero after F3)
- `features/canvas/social/ShareCoverImagePicker.tsx`
- `features/image-studio/modes/avatar/AvatarModeShell.tsx`
- `features/window-panels/windows/image/callbacks.ts`
- `features/window-panels/windows/image/useOpenImageUploaderWindow.ts`
- `features/window-panels/windows/image/ImageUploaderWindow.tsx`
- `components/official/ImageAssetUploader.tsx`
- `features/podcasts/components/admin/AssetUploader.tsx`
- Documentation references (no code change): `features/files/FEATURE.md`, `features/image-studio/FEATURE.md`, `features/file-handler/FEATURE.md`, `features/image-manager/FEATURE.md`, `features/image-manager/IMAGE-FEATURE-INVENTORY.md`, `features/files/for_python/REQUESTS.md`, `docs/CDN_INTEGRATION.md`

---

## Part 7 — Decisions I need from you before coding

1. **Python repo access** — am I making the two Python changes (P1, P2) directly in `/Users/armanisadeghi/code/aidream`, or do you want me to write them as a patch and you apply them? Either way, the FE work can't ship until the Python changes are live.
2. **Endpoint name** — `POST /media/upload-asset` (new, generalized) is my recommendation. Alternative is to just add a `preset` parameter to the existing `/media/podcast/upload-image` and rename. Either works, the first is cleaner.
3. **Social baseline merge — opt out?** — currently I'd merge `[og 1200×630, thumbnail 400², tiny 128²]` into every preset unconditionally. Should there be a `social_baseline=false` form param to opt out for the very rare cases where you genuinely want only the bare preset? My instinct: no, always merge — it's <50 KB of extra image data per upload, and "OG is always there" is the simplification that fixes the whole bug class.
4. **New presets on the Python side** — confirm I should add `LOGO_VARIANTS`, `AVATAR_VARIANTS`, `FAVICON_VARIANTS` to `image_handler.py`. Sizes I'd use:
   - logo: 512² PNG, 200² PNG, 64² PNG
   - avatar: 400², 256², 128², 64², 32² (all JPEG, square cover-crop, attention anchor)
   - favicon: 192² PNG, 180² PNG (apple-touch-icon), 32² PNG, 16² PNG
5. **3000² podcast covers — DB schema** — `podcasts.image_url` currently holds the 1400² SD cover (when it works). Do we want a new `cover_hires_url` column for the 3000²? Or just bump `image_url` to 3000² and trust modern bandwidth? The cleanest answer is: `image_url` = 3000² master, `og_image_url` = 1200×630, `thumbnail_url` = 400², `tiny_url` = 128². No schema change needed.
6. **`tiny_url` column on `podcasts`** — currently dropped by `AssetUploader`'s local type. Add the column or keep dropping it?

Once you sign off, I'll do P1 + P2 in the Python repo, regenerate the FE OpenAPI types, then sweep all the FE callers and delete the Sharp route. Estimated ~2 hours work split roughly 30% Python, 70% FE sweep.
