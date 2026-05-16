# FE Media Block Contract — Phase 0 Changes

> **Audience:** Frontend team and any other downstream consumer of the AIDream API or stream events.
> **Status:** Shipped on `main` as commit `96f7ff7b` (2026-05-16). Not yet pushed — coordinate with backend team before deploying FE changes.
> **Scope:** Phase 0 of the unified-media-block rollout. Establishes the canonical wire shape so the *one shape, one renderer, one resolver, one place where expiry lives* principle from `UNIFIED_IMAGE_BLOCK.md` is now backed end-to-end. Phase 1 (universal thumbnails across PDF/video/audio) and Phase 2 (generation metadata) follow without breaking this contract.

---

## TL;DR

1. **New canonical wire shape**: `UnifiedMediaBlock` (discriminated union of `ImageBlock | VideoBlock | AudioBlock | DocumentBlock | YouTubeBlock`). Replaces four hand-built dict shapes that drifted out of sync.
2. **New stream event**: `data` events with `type: "media_block"` carry the canonical block. Replaces `image_output`, `audio_output`, `video_output`, `partial_image` (all now **deprecated** but still emitted by old code paths during transition).
3. **DB column rename**: `cld_files.file_size` → `cld_files.size_bytes` (same on `cld_file_versions`). Cascades through every response shape — see §3.
4. **New first-class fields**: `signed_url_expires_at` (ms epoch), `file_uri`, `width`, `height`, `duration_ms`, `parent_file_id`, `derivation_kind`, `origin` are now on the wire wherever appropriate.
5. **Typed TS available now**: `aidream/api/generated/stream-events.ts` has all the new interfaces. Re-run `pnpm sync-types` after pulling.

---

## 1. The new canonical shape — `UnifiedMediaBlock`

Source of truth: [`packages/matrx-connect/matrx_connect/context/media_block.py`](../packages/matrx-connect/matrx_connect/context/media_block.py).

The block is a discriminated union over `kind`. The TS generator emits all five interfaces plus the union; consumers narrow on `block.kind` (and additionally on `block.origin` when needed).

### Shared fields (every block kind has these)

| Field | Type | Notes |
|---|---|---|
| `kind` | `"image" \| "video" \| "audio" \| "document" \| "youtube"` | Discriminator. |
| `origin` | `"matrx" \| "external"` | `matrx` = backed by a `cld_files` row we own. `external` = arbitrary URL or inline bytes. |
| `status` | `"complete" \| "streaming" \| "error"` | Default `complete`. `streaming` carries in-flight base64; `error` carries `error_message`. |
| `progress` | `number \| null` | 0..1 during streaming. |
| `error_message` | `string \| null` | When `status === "error"`. |
| `mime_type` | `string \| null` | Canonical `type/subtype`. Always populated server-side for matrx-owned files. |
| `file_name` | `string \| null` | Display name. |
| `size_bytes` | `number \| null` | Bytes. |
| `base64` | `string \| null` | Inline bytes for partials and small attachments. |
| `metadata` | `Record<string, JsonValue>` | Free-form. Phase 2 will stamp `metadata.generation` for AI-generated media. |
| **Matrx-origin only:** | | |
| `file_id` | `string \| null` | cld_files UUID. **Required when `origin="matrx"` and `status="complete"`.** May be null during streaming. |
| `file_uri` | `string \| null` | Native cloud URI (`s3://…`). |
| `visibility` | `"public" \| "private" \| "shared" \| null` | |
| `cdn_url` | `string \| null` | Permanent CDN URL (public files only). |
| `signed_url` | `string \| null` | Inline-disposition signed URL. |
| `download_url` | `string \| null` | `Content-Disposition: attachment` signed URL. |
| `signed_url_expires_at` | `number \| null` | **Ms epoch.** Schedule refresh ~30s before this. `null` when only a CDN URL was minted. |
| `parent_file_id` | `string \| null` | Lineage ancestor (when derived). |
| `derivation_kind` | `string \| null` | `manual_upload`, `extracted_pages`, `cropped`, `rendered_page_image`, etc. |
| `thumbnail_url` | `string \| null` | Legacy — kept for Phase 0 backward compat. Phase 1 moves thumbnails into `Asset.variants["thumbnail_url"]`. |
| `thumbnail_uri` | `string \| null` | Same — legacy. |
| **External-origin only:** | | |
| `external_url` | `string \| null` | **Required when `origin="external"`** (or `base64` must be set). |
| `source_label` | `string \| null` | Optional provenance hint (e.g. `"Wikipedia"`). |

### Kind-specific fields

| `kind` | Additional fields |
|---|---|
| `image` | `width: int \| null`, `height: int \| null`, `vision_class: string \| null` |
| `video` | `width: int \| null`, `height: int \| null`, `duration_ms: int \| null`, `poster_url: string \| null` *(Phase 1)* |
| `audio` | `duration_ms: int \| null`, `transcript: string \| null` |
| `document` | `page_count: int \| null`, `page1_url: string \| null` *(Phase 1)* |
| `youtube` | `video_id: string \| null` *(always `origin: "external"`)* |

### TypeScript shape (verbatim from `stream-events.ts`)

```typescript
export interface ImageBlock {
  kind: "image";
  origin: "matrx" | "external";
  // ...matrx-owned URL set...
  file_id?: string | null;
  file_uri?: string | null;
  visibility?: "public" | "private" | "shared" | null;
  cdn_url?: string | null;
  signed_url?: string | null;
  download_url?: string | null;
  signed_url_expires_at?: number | null;   // ms epoch
  parent_file_id?: string | null;
  derivation_kind?: string | null;
  thumbnail_url?: string | null;
  thumbnail_uri?: string | null;
  // ...external-origin...
  external_url?: string | null;
  source_label?: string | null;
  // ...universal...
  base64?: string | null;
  mime_type?: string | null;
  file_name?: string | null;
  size_bytes?: number | null;
  // ...streaming state...
  status?: "complete" | "streaming" | "error";
  progress?: number | null;
  error_message?: string | null;
  // ...
  metadata?: Record<string, JsonValue>;
  // image-specific
  width?: number | null;
  height?: number | null;
  vision_class?: string | null;
}

// VideoBlock / AudioBlock / DocumentBlock / YouTubeBlock follow the same
// pattern, see stream-events.ts for the exact emitted types.

export type UnifiedMediaBlock =
  | ImageBlock
  | VideoBlock
  | AudioBlock
  | DocumentBlock
  | YouTubeBlock;
```

---

## 2. The new stream event — `data` of type `media_block`

### Wire shape

```json
{
  "event": "data",
  "data": {
    "type": "media_block",
    "block": { "kind": "image", "origin": "matrx", ... }
  }
}
```

### What it replaces (all deprecated)

| Deprecated `data.type` | Replacement |
|---|---|
| `image_output` | `media_block` with `block.kind === "image"` |
| `audio_output` | `media_block` with `block.kind === "audio"` |
| `video_output` | `media_block` with `block.kind === "video"` |
| `partial_image` | `media_block` with `block.kind === "image"` AND `block.status === "streaming"` |

The deprecated payload classes (`ImageOutputData`, `AudioOutputData`, `VideoOutputData`, `PartialImageData`) are still exported from `matrx_connect` for transition compatibility — they will be removed in a future minor release. **No production code path emits them anymore** (enforced by `scripts/audit_api_types.py::deprecated_media_payload`).

### Streaming progressive previews

OpenAI's `gpt-image-*` `partial_images` flow now emits `MediaBlockData` events with `status: "streaming"` instead of `partial_image` events:

```json
// Partial 1
{ "event": "data", "data": { "type": "media_block",
  "block": { "kind": "image", "origin": "matrx",
             "status": "streaming", "progress": 0.25,
             "base64": "iVBORw0K...", "mime_type": "image/png" } } }

// Partial 2
{ "event": "data", "data": { "type": "media_block",
  "block": { "kind": "image", "origin": "matrx",
             "status": "streaming", "progress": 0.5,
             "base64": "iVBORw0K...", "mime_type": "image/png" } } }

// Final (status defaults to "complete")
{ "event": "data", "data": { "type": "media_block",
  "block": { "kind": "image", "origin": "matrx",
             "file_id": "122a35b5-...", "file_uri": "s3://...",
             "cdn_url": "https://cdn.matrxserver.com/.../blueprint.png",
             "signed_url_expires_at": null,
             "width": 1024, "height": 1536, "size_bytes": 2055674,
             "visibility": "public", "mime_type": "image/png",
             "metadata": { "model": "gpt-image-2", "revised_prompt": "..." } } } }
```

Render the same component for both states; switch the source from `base64` to `cdn_url` / `signed_url` when `status === "complete"`.

---

## 3. Field renames at the API boundary

**Every response shape that previously carried `file_size` now carries `size_bytes`.** The DB column is renamed (migration 010); every Pydantic model, response shape, and dict mapped from a `cld_files` row uses the new name.

### Endpoints affected (response field renamed `file_size` → `size_bytes`)

| Endpoint | Response model |
|---|---|
| `GET /files` / `GET /files/{id}` | `FileRecord`, `FileTreeEntry` |
| `POST /files/upload` | `FileUploadResponse` |
| `GET /files/bridge` (sandbox bridge) | `BridgeFileEntry` |
| `POST /media/upload` (vision media) | `VisionMediaUploadResponse` |
| `POST /rag/data-stores/{id}/members` | `RichDataStoreMember` |
| `GET /assets/{id}` / `POST /assets` (variants) | `AssetVariant.size_bytes` (was `AssetVariant.file_size`) |
| `POST /pdf/*` write paths | result envelopes that surfaced `file_size` |
| Image studio commit (`POST /image-studio/commit`) | `CommittedItem.size` (unchanged — was already `size`) |

### Stream events affected

- All `media_block` emissions carry `block.size_bytes` (never `file_size`).
- `cx_message.content[]` items: storage format is currently still the legacy `{type:"media", kind:..., url, file_uri, ...}` shape from matrx-ai's `ImageContent` / `AudioContent` / etc. — **the storage migration to `UnifiedMediaBlock` is Phase 3 of this rollout, not Phase 0.** Treat reads of `cx_message.content` for media parts as legacy until Phase 3 lands.

### What was NOT renamed

In-memory shapes that never appear on the wire keep `file_size` (intentional, to bound this PR):
- `MediaRef.file_size` (resolved-state, internal to matrx-utils)
- `ImageContent.file_size`, `AudioContent.file_size`, etc. (matrx-ai content classes used as provider serializers)
- `ResolvedFile.file_size`, `CachedFile.file_size` (in-process caches)

Unrelated to this PR:
- Quota-limit field `max_file_size_bytes` (DIFFERENT concept — a limit, not a size).
- `zipfile.ZipInfo.file_size` (Python stdlib).

---

## 4. New first-class fields you should adopt

### `signed_url_expires_at: number | null`  — *most impactful*

**Ms epoch** when `signed_url` becomes invalid. Computed at mint time as `int((time.time() + ttl) * 1000)`; default ttl is 3600s (1 hour).

- Available on: `AssetVariant`, `SyncResult`, `MediaPersistResult`, every `MediaBlock`.
- Use case: schedule a refresh ~30s before this timestamp instead of parsing X-Amz query parameters.
- `null` when only a CDN URL was minted (public files served via CDN don't expire).

Recommended FE pattern (matches `UNIFIED_IMAGE_BLOCK.md`'s `useUnifiedImageUrl`):

```typescript
if (block.cdn_url) return block.cdn_url;           // permanent, no refresh
if (block.signed_url && block.signed_url_expires_at) {
  if (block.signed_url_expires_at > Date.now() + 30_000) return block.signed_url;
  return await refreshSignedUrl(block.file_id);    // expiring soon
}
```

### `file_uri: string | null`

Native cloud URI (`s3://bucket/owner_id/file_id`). Available on `AssetVariant` and every `MediaBlock`. Useful for fallback re-hydration paths where you only have storage URI access (e.g., direct Supabase reads).

### `width`, `height`, `duration_ms`

Promoted from `cld_files.metadata` to first-class columns. Now queryable server-side and surfaced directly on `AssetVariant` and `ImageBlock` / `VideoBlock` / `AudioBlock` without metadata digging.

### `parent_file_id`, `derivation_kind`

Always-present lineage hints on matrx-owned media blocks. Use to disambiguate variants, show "derived from" UI, or follow the chain for audit views.

### `origin: "matrx" | "external"`

Explicit discriminator so adapters never have to guess. `external` means the URL came from somewhere else (user paste, third-party tool, YouTube link) and won't have a `file_id`.

---

## 5. Deprecated payload classes — do not introduce new uses

Stop creating these in any new code path:
- `ImageOutputData`
- `AudioOutputData`
- `VideoOutputData`
- `PartialImageData`

Backend CI gate: `scripts/audit_api_types.py` will reject PRs that emit any of these via `emitter.send_data(...)`. Replace with `MediaBlockData(block=...)` and the helpers in `matrx_connect.context.media_block`.

FE migration plan: the four adapters listed in `UNIFIED_IMAGE_BLOCK.md`'s adapter table (`from-image-output-data.ts`, `from-partial-image-data.ts`, `from-render-block.ts`, `from-cx-media-part.ts`) can shrink to near-passthroughs:
- `from-image-output-data.ts` — server no longer emits `image_output`; the adapter only needs to handle in-flight legacy events from un-redeployed services.
- `from-partial-image-data.ts` — same; replaced by `media_block` with `status: "streaming"`.
- `from-render-block.ts` — unchanged for now; `render_block` events carry `data: { ... }` per the `RenderBlockPayload` schema. Server-side typing of `data` for `type === "image"` blocks is deferred.
- `from-cx-media-part.ts` — keep until Phase 3 (cx_message storage migration).

---

## 6. Migration recipe for the FE

1. **Pull `main`**, then `pnpm sync-types` to regenerate `aidream/api/generated/stream-events.ts`. Confirm `MediaBlockData` and the five `*Block` interfaces appear.
2. **Add `media_block` handler** to the stream-event dispatch. Adapt the existing image / audio / video render code to consume `UnifiedMediaBlock` directly. Keep the legacy `image_output` / `audio_output` / `video_output` / `partial_image` handlers as fallbacks for ~one release cycle (until backend deploys complete).
3. **Rename `file_size` reads** to `size_bytes` across:
   - File picker / file manager components reading `FileRecord` / `FileTreeEntry`
   - Upload response handlers (`FileUploadResponse`, `VisionMediaUploadResponse`)
   - Sandbox bridge readers (`BridgeFileEntry`)
   - Asset envelope variant readers (`AssetVariant.size_bytes`)
4. **Wire `signed_url_expires_at`** into the existing `expiry-wheel` so refresh fires automatically when the timestamp approaches (replaces signed-URL parsing).
5. **Replace bespoke origin detection** with `block.origin === "matrx" | "external"` checks.
6. **Adopt `width` / `height` / `duration_ms`** from the block directly instead of `block.metadata.dimensions` / similar legacy lookups.

---

## 7. Concrete example payloads

### 7.1  AI image generation final event (matrx-owned, public)

```json
{
  "event": "data",
  "data": {
    "type": "media_block",
    "block": {
      "kind": "image",
      "origin": "matrx",
      "status": "complete",
      "file_id": "122a35b5-2875-4251-9c11-bb57993f6f2f",
      "file_uri": "s3://matrx-user-files/4cf62e4e-2679-484f-b652-034e697418df/122a35b5-2875-4251-9c11-bb57993f6f2f",
      "visibility": "public",
      "cdn_url": "https://cdn.matrxserver.com/4cf62e4e.../122a35b5...png?v=eb623182",
      "signed_url": null,
      "download_url": null,
      "signed_url_expires_at": null,
      "parent_file_id": null,
      "derivation_kind": null,
      "thumbnail_url": null,
      "thumbnail_uri": null,
      "external_url": null,
      "source_label": null,
      "base64": null,
      "mime_type": "image/png",
      "file_name": "blueprint.png",
      "size_bytes": 2055674,
      "progress": null,
      "error_message": null,
      "width": 1024,
      "height": 1536,
      "vision_class": null,
      "metadata": {
        "model": "gpt-image-2",
        "provider": "openai",
        "revised_prompt": "Create a blueprint-style poster of two babies..."
      }
    }
  }
}
```

### 7.2  Streaming partial during OpenAI image generation

```json
{
  "event": "data",
  "data": {
    "type": "media_block",
    "block": {
      "kind": "image",
      "origin": "matrx",
      "status": "streaming",
      "progress": 0.5,
      "base64": "iVBORw0KGgoAAAANSUhEUgAA...",
      "mime_type": "image/png",
      "file_id": null,
      "size_bytes": null,
      "metadata": {}
    }
  }
}
```

### 7.3  Private (signed) image with TTL

```json
{
  "event": "data",
  "data": {
    "type": "media_block",
    "block": {
      "kind": "image",
      "origin": "matrx",
      "status": "complete",
      "file_id": "ce81...",
      "file_uri": "s3://matrx-user-files/<owner>/ce81...",
      "visibility": "private",
      "cdn_url": null,
      "signed_url": "https://s3.amazonaws.com/.../?X-Amz-Signature=...",
      "download_url": "https://s3.amazonaws.com/.../?X-Amz-Signature=...&response-content-disposition=attachment",
      "signed_url_expires_at": 1716000000000,
      "mime_type": "image/jpeg",
      "file_name": "report-figure-3.jpg",
      "size_bytes": 245678,
      "width": 1920,
      "height": 1080,
      "metadata": {}
    }
  }
}
```

### 7.4  External YouTube reference

```json
{
  "event": "data",
  "data": {
    "type": "media_block",
    "block": {
      "kind": "youtube",
      "origin": "external",
      "status": "complete",
      "external_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "video_id": "dQw4w9WgXcQ",
      "source_label": "User-pasted",
      "metadata": {}
    }
  }
}
```

### 7.5  Asset envelope (unchanged structure — fields renamed)

```jsonc
GET /assets/122a35b5-2875-4251-9c11-bb57993f6f2f
{
  "file_id": "122a35b5-...",
  "visibility": "public",
  "folder": "generations/images",
  "preset": "raw",
  "primary_key": "original",
  "primary_url": "https://cdn.matrxserver.com/.../blueprint.png?v=eb623182",
  "variants": {
    "original": {
      "key": "original",
      "file_id": "122a35b5-...",
      "file_path": "generations/images/blueprint.png",
      "file_uri": "s3://matrx-user-files/.../122a35b5-...",   // NEW
      "width": 1024, "height": 1536,
      "mime_type": "image/png",
      "size_bytes": 2055674,                                   // RENAMED (was file_size)
      "url": "https://cdn.matrxserver.com/.../blueprint.png?v=eb623182",
      "cdn_url": "https://cdn.matrxserver.com/.../blueprint.png?v=eb623182",
      "signed_url": null,
      "download_url": null,
      "signed_url_expires_at": null,                            // NEW
      "metadata": {}
    }
  },
  "metadata": { "model": "gpt-image-2", "provider": "openai" }
}
```

---

## 8. What is NOT changing

To rule out surprises:

- **The 4-URL contract on every variant**: `url` / `cdn_url` / `signed_url` / `download_url` — unchanged semantics. Bind to `url` for rendering; `download_url` for download buttons.
- **`Asset` envelope structure**: `{ file_id, visibility, folder, preset, primary_key, primary_url, variants, metadata }` — unchanged.
- **`POST /assets` endpoint shape** (request + response): unchanged. Only `AssetVariant.size_bytes` rename is visible.
- **`POST /files/upload` shape**: response field rename only (`size_bytes`).
- **`MediaRef` input shape** (the FE-supplied shape for AI requests): unchanged. The three identifier forms (`file_id` / `url` / `file_uri`) still work the same.
- **Visibility values**: `"public" | "private" | "shared"` — unchanged.
- **Auth contract**: unchanged. Supabase JWTs only.
- **Streaming envelope**: NDJSON of `{event, data}` — unchanged. New event types layer on top.

---

## 9. Open questions / non-goals for Phase 0

These are explicitly **not** in this PR. Bring them up in Phase 1/2/3 discussions:

- **Universal thumbnails for non-image files** (PDF page1, video poster, audio waveform, type-icon fallback). Phase 1 will populate `thumbnail_url` for every file type. Today, only image masters that went through `POST /assets` with a preset have variants.
- **Storage migration of `cx_message.content[]`** to `UnifiedMediaBlock` shape. Phase 3. Until then, treat reads of historic message content as legacy.
- **Generation metadata canonicalization** (`MediaGenerationMetadata` Pydantic model with per-provider mappers). Phase 2 — will land under `cld_files.metadata.generation` without changing the wire shape.
- **Removing the in-memory `file_size` on `MediaRef` / `ImageContent` / `AudioContent` / etc.** — deferred to bound this PR's blast radius. Will follow once Phase 3 storage migration lands.

---

## 10. Backend reference

- Canonical Pydantic module: [packages/matrx-connect/matrx_connect/context/media_block.py](../packages/matrx-connect/matrx_connect/context/media_block.py)
- Stream payload registration: [packages/matrx-connect/matrx_connect/context/data_types.py](../packages/matrx-connect/matrx_connect/context/data_types.py)
- Generated TypeScript: [aidream/api/generated/stream-events.ts](../aidream/api/generated/stream-events.ts) (run `pnpm sync-types` after pulling)
- DB migration: [packages/matrx-utils/matrx_utils/file_handling/cloud_sync/sql/010_canonical_media_columns.sql](../packages/matrx-utils/matrx_utils/file_handling/cloud_sync/sql/010_canonical_media_columns.sql)
- Audit gate: [scripts/audit_api_types.py](../scripts/audit_api_types.py) → `deprecated_media_payload` category
- FE-side reference doc this contract aligns with: `matrx-frontend/features/files/blocks/image/UNIFIED_IMAGE_BLOCK.md`

Questions / clarifications: ping the backend team before deploying FE changes that depend on the new shape. Backend will **not push to prod until you confirm** the FE has consumed the new contract.

---

# Phase 1 — Universal Thumbnail Baseline (Added 2026-05-16)

> **Status:** Shipped to `main`. **Wire contract is purely additive** — every shape from Phase 0 is preserved. The new behaviour is: every file uploaded to the platform now gets `og_url`, `thumbnail_url`, and `tiny_url` variants automatically, regardless of file kind.

## What changed

**Server-side behaviour change, no FE wire-shape change.** Phase 0 introduced `UnifiedMediaBlock` and renamed `file_size` → `size_bytes`; Phase 1 lights up universal thumbnails on top of that contract without changing any field names or types. The FE can adopt Phase 1 simply by *trusting* that `thumbnail_url` is always available for any visual upload.

Before Phase 1: only image uploads received `og_url` / `thumbnail_url` / `tiny_url` variants. PDFs, videos, audio, and unknown files showed no preview in galleries — the FE had to fall back to category icons.

After Phase 1: every upload through `POST /assets` (and every AI-generated media file written via the matrx-ai path) renders the `SOCIAL_BASELINE` variant family from a rasterised source:

| Source mime | Raster source | Variants produced |
|---|---|---|
| `image/*` | Original bytes (passthrough) | `og_url` (1200×630 JPEG), `thumbnail_url` (400² JPEG), `tiny_url` (128² JPEG) |
| `application/pdf` | Page 1 rendered at 100 DPI via pdfium | Same three variants |
| `video/*` | Frame at 10% via OpenCV | Same three variants |
| `audio/*` | Mime-family icon PNG (waveform deferred) | Same three variants |
| `application/zip`, `application/x-tar`, ... | Mime-family icon PNG | Same three variants |
| `text/*`, `application/json`, ... | Mime-family icon PNG | Same three variants |
| Anything unrecognised | Generic icon PNG | Same three variants |

The dispatcher is implemented in [packages/matrx-utils/matrx_utils/file_handling/specific_handlers/thumbnail_source.py](../packages/matrx-utils/matrx_utils/file_handling/specific_handlers/thumbnail_source.py) — single function `render_thumbnail_source_bytes(content_bytes, mime_type, file_name=...) -> (image_bytes, mime)`. Per-kind rasteriser failures (corrupt PDF, unsupported video codec) fall back to the mime-family icon so the variant pipeline never fails for a usable upload.

## What the FE now gets

### `POST /assets` for non-image files

Previously the response carried only `variants.original` for non-image masters. Now you also get `og_url`, `thumbnail_url`, `tiny_url`:

```jsonc
POST /assets   (multipart, file=report.pdf, preset=raw or any)
{
  "file_id": "...",
  "visibility": "public",
  "folder": "Assets/...",
  "preset": "raw",
  "primary_key": "thumbnail_url",                  // ← changed: was "original"
  "primary_url": "https://cdn.matrxserver.com/.../report__thumb.jpg",
  "variants": {
    "original":      AssetVariant,  // the PDF itself (file_uri carries s3://...)
    "og_url":        AssetVariant,  // 1200×630 JPEG rendered from page 1
    "thumbnail_url": AssetVariant,  // 400×400 JPEG rendered from page 1
    "tiny_url":      AssetVariant   // 128×128 JPEG rendered from page 1
  },
  "metadata": { ... }
}
```

**`primary_key` change for non-image uploads:** when the master is not an image, `primary_key` now defaults to `"thumbnail_url"` instead of `"original"`. The reason: `original` for a PDF/video/audio file is not directly renderable in a browser `<img>`. Bind `primary_url` for inline display; use `variants.original.url` for the download button.

(Image uploads are unchanged — `primary_key` still follows the preset's declared primary, e.g. `cover_url` for `preset=podcast`.)

### AI-generated media

Every AI image / audio / video persisted via the matrx-ai pipeline (OpenAI, Google, Together, Replicate, xAI, ElevenLabs, Groq) now triggers SOCIAL_BASELINE variant rendering after the master is written. The `MediaBlockData` stream event carries the master block as before; the variants are queryable via `GET /assets/{file_id}` (the response shape is unchanged from Phase 0).

`MediaBlockData.block.thumbnail_url` on the `MatrxImageBlock` side stays populated by the legacy `cld_files.thumbnail_storage_uri`/`thumbnail_url` pipeline for TUS uploads (see "What did NOT change" below) — so existing thumbnail consumers keep working. The recommended source-of-truth for thumbnails going forward is `Asset.variants["thumbnail_url"].url` via `GET /assets/{file_id}`.

## What did NOT change

- **Wire shapes**: `Asset`, `AssetVariant`, `UnifiedMediaBlock`, all stream events — identical to Phase 0.
- **TUS upload pipeline** (`POST /files/tus/...`): still uses the legacy `cld_files.thumbnail_storage_uri`/`thumbnail_url` background thumbnail processor. **Will be unified in Phase 1b.** For now, TUS uploads have *only* the legacy thumbnail; `POST /assets` uploads have *both* the legacy thumbnail AND the SOCIAL_BASELINE variants.
- **Legacy thumbnail columns** (`cld_files.thumbnail_storage_uri`, `cld_files.thumbnail_url`): **not dropped yet** — 4 routers (`files`, `podcast_media`, `file_pages`, `file_analysis`) plus the processing + backfill modules still depend on them. **Phase 1b** will migrate those callers to the variants pipeline and drop the columns.

## Migration recipe for the FE

**No code change is *required* for Phase 1** — every wire field is the same. To take advantage of the new behaviour:

1. **Galleries / file pickers / thumbnail grids**: prefer `Asset.variants["thumbnail_url"].url` (or `Asset.primary_url` when `primary_key === "thumbnail_url"`) over `MatrxImageBlock.thumbnail_url`. For mixed file-type listings, this gives you a real thumbnail for PDFs and videos that previously fell back to icons.

2. **`primary_url` for non-image uploads**: the change from `original` → `thumbnail_url` is automatic. If your current code special-cases non-image masters and falls back to `variants.original.url`, you can drop that branch — `primary_url` will be renderable directly.

3. **Mime-icon UI**: you can keep your client-side icon fallback for now, but Phase 1 also provides a server-rendered icon (PNG) for any unsupported mime. Whether to use it is a UX call — server icons are pixel-consistent across browsers; client icons are theme-aware.

## Concrete example — PDF upload

```jsonc
POST /assets   (file=quarterly-report.pdf, preset=raw, visibility=public)
{
  "file_id": "f1e2d3...",
  "visibility": "public",
  "folder": "Assets/f1e2d3",
  "preset": "raw",
  "primary_key": "thumbnail_url",          // browser-renderable
  "primary_url": "https://cdn.matrxserver.com/.../quarterly-report__thumb.jpg",
  "variants": {
    "original": {
      "key": "original", "file_id": "f1e2d3...",
      "file_path": "Assets/f1e2d3/quarterly-report.pdf",
      "file_uri": "s3://matrx-user-files/.../f1e2d3...",
      "mime_type": "application/pdf",
      "size_bytes": 4567890,
      "url":         "https://cdn.matrxserver.com/.../quarterly-report.pdf",
      "cdn_url":     "https://cdn.matrxserver.com/.../quarterly-report.pdf",
      "signed_url":  null, "download_url": null,
      "signed_url_expires_at": null,
      "width": null, "height": null,        // PDFs don't carry pixel dims
      "metadata": { "asset_master": true, "asset_preset": "raw" }
    },
    "og_url": {
      "key": "og_url", "file_id": "...og-variant-id...",
      "file_path": "system-files/variants/f1e2d3.../og.jpg",
      "mime_type": "image/jpeg",
      "width": 1200, "height": 630, "size_bytes": 78901,
      "url":         "https://cdn.matrxserver.com/.../og.jpg",
      "cdn_url":     "https://cdn.matrxserver.com/.../og.jpg",
      "metadata": { "derived_from": "f1e2d3...", "variant_family": "image",
                    "variant_key": "og_url", "variant_spec_hash": "..." }
    },
    "thumbnail_url": { /* 400×400 JPEG of page 1 */ },
    "tiny_url":      { /* 128×128 JPEG of page 1 */ }
  },
  "metadata": { ... }
}
```

## Phase 1b — what's coming next

Tracked as follow-up; will be communicated when ready:
- TUS upload pipeline unified with `POST /assets` variants pipeline
- 4 router consumers migrated from `cld_files.thumbnail_*` columns to variants lookups
- Migration 011: drop `cld_files.thumbnail_storage_uri` + `cld_files.thumbnail_url`
- Audio waveform rendering (replaces the mime-family icon fallback for `audio/*`)
- Kind-specific full-resolution variants (`page1_url` for PDFs, `poster_url` for videos)

None of these require an FE-visible wire change.

## Phase 1 backend reference

- Universal dispatcher: [packages/matrx-utils/matrx_utils/file_handling/specific_handlers/thumbnail_source.py](../packages/matrx-utils/matrx_utils/file_handling/specific_handlers/thumbnail_source.py)
- POST /assets dispatch: [aidream/api/routers/assets.py](../aidream/api/routers/assets.py) (section "9. Render preset variants")
- AI media variant render: [packages/matrx-ai/matrx_ai/media/media_persistence.py](../packages/matrx-ai/matrx_ai/media/media_persistence.py) `save_response_media_envelope_async`
- Variant store: unchanged from Phase 0 — [VariantsService](../packages/matrx-utils/matrx_utils/file_handling/cloud_sync/variants_service.py) keyed on `metadata.derived_from`

---

# Phase 2 — Canonical AI Generation Metadata (Added 2026-05-16)

> **Status:** Shipped to `main`. **Wire shape is purely additive** — every Phase 0 + Phase 1 contract is preserved. New: every AI-generated media file (image / video / audio) now carries a typed `MediaGenerationMetadata` record at `cld_files.metadata.generation` and on the content block's `metadata.generation` field.

## What changed

**Server-side enrichment of `metadata.generation`.** Phase 0 + Phase 1 established the wire shape and the universal thumbnail pipeline. Phase 2 makes sure that for every AI-produced file, we capture a provider-agnostic, typed record of how it was generated — instead of the previous ad-hoc collection of provider-specific fields drifting around in `metadata`.

Before Phase 2: `cld_files.metadata` carried whatever a provider happened to surface — `model`, `provider`, `prompt`, sometimes `revised_prompt`, sometimes `cost`. Different providers reported different fields. The FE had to special-case each provider to render generation provenance.

After Phase 2: `cld_files.metadata.generation` is a single typed shape with provider-agnostic field names. Per-provider mappers translate from each SDK's response into this canonical form; anything that doesn't fit lands in `provider_extras` so no data is silently dropped.

## The shape — `MediaGenerationMetadata`

Source of truth: [packages/matrx-ai/matrx_ai/media/generation_metadata.py](../packages/matrx-ai/matrx_ai/media/generation_metadata.py)

```typescript
// TypeScript equivalent — generated when matrx-ai's models are exported.
interface MediaGenerationMetadata {
  // Identity
  kind: "image" | "video" | "audio" | "speech" | "music";
  provider: string;          // "openai" | "google" | "together" | "replicate" | "xai" | "elevenlabs" | "groq"
  model: string;             // SDK model id used at call time, e.g. "gpt-image-2"

  // Request
  prompt: string;            // What the user submitted (after our normalization)
  negative_prompt?: string | null;
  revised_prompt?: string | null;  // Provider's rewrite (OpenAI does this often — surface to user!)

  // Output shape (canonical names, normalized across providers)
  width?: number | null;
  height?: number | null;
  aspect_ratio?: string | null;    // "16:9" | "1:1" | "9:16" | ...
  duration_seconds?: number | null;

  // Generation knobs (provider support varies; missing = not applicable)
  quality?: string | null;        // normalized to "draft" | "standard" | "hd" (or pass-through)
  style?: string | null;
  seed?: number | null;           // diffusion-family reproducibility
  steps?: number | null;          // diffusion only
  cfg_scale?: number | null;      // diffusion only
  n_requested: number;            // default 1
  n_returned: number;             // default 1

  // Operational
  response_id?: string | null;
  duration_ms?: number | null;
  cost_usd?: number | null;
  finish_reason?: string | null;  // "completed" | "content_filter" | "error" | ...
  safety_flagged: boolean;        // default false

  // Catch-all — provider-native fields we haven't canonicalized yet
  provider_extras: Record<string, JsonValue>;
}
```

### Per-provider field coverage (canonical fields populated today)

| Field | OpenAI gpt-image-* | Google Imagen | Together Flux/SD | Others (default mapper) |
|---|---|---|---|---|
| `kind`, `provider`, `model`, `prompt`, `n_returned` | ✓ | ✓ | ✓ | ✓ |
| `revised_prompt` | ✓ | — | — | — |
| `width`, `height`, `aspect_ratio` | ✓ | ✓ | ✓ | — |
| `quality` (normalized) | ✓ | — | — | — |
| `style` | ✓ | — | — | — |
| `seed`, `steps`, `cfg_scale` | — | — | ✓ | — |
| `negative_prompt` | — | — | ✓ | — |
| `response_id` | ✓ | — | — | — |
| `safety_flagged` + `provider_extras.safety` | — | ✓ | — | — |
| `cost_usd`, `duration_ms` | ✓ | ✓ | ✓ | ✓ |
| `provider_extras.usage` | ✓ | — | — | — |

"—" doesn't mean the field is wrong; it means the provider doesn't surface it or we haven't wired the mapper yet. Other providers (Replicate, xAI, ElevenLabs, Groq, etc.) get the minimum-viable `build_default_metadata` record until a custom mapper lands.

## Where it appears on the wire

Two surfaces, both already shipping in Phase 0/1 with the new content:

### 1. `cld_files.metadata.generation`

Visible via `GET /assets/{file_id}` → `Asset.metadata.generation` and `GET /files/{file_id}` → `FileRecord.metadata.generation`. Use this when the FE needs to display generation provenance independently of a chat message (gallery detail view, image-studio "edit prompt" UX, audit panels).

### 2. `UnifiedMediaBlock.metadata.generation` (in stream events + `cx_message.content[]`)

Stamped onto the `MediaBlockData.block.metadata` field for every AI-generated asset, so the FE can render generation provenance *inline in a chat message* without a follow-up GET. Same `MediaGenerationMetadata` shape, identical to the cld_files copy.

## Concrete examples

### OpenAI gpt-image-2 — revised prompt + quality + usage

```jsonc
{
  "event": "data",
  "data": {
    "type": "media_block",
    "block": {
      "kind": "image",
      "origin": "matrx",
      "status": "complete",
      "file_id": "122a35b5-...",
      "cdn_url": "https://cdn.matrxserver.com/.../blueprint.png?v=eb623182",
      "width": 1024, "height": 1536, "mime_type": "image/png",
      "metadata": {
        "model": "gpt-image-2",
        "provider": "openai",
        "cost": 0.042,
        "generation": {
          "kind": "image",
          "provider": "openai",
          "model": "gpt-image-2",
          "prompt": "Create a blueprint-style poster of two babies...",
          "revised_prompt": "Render a high-resolution white-line architectural blueprint on a deep cobalt-blue grid background depicting two cartoon babies — one with outstretched arms, one with crossed arms — annotated with cute engineering labels...",
          "width": 1024, "height": 1536, "aspect_ratio": "2:3",
          "quality": "hd", "style": "vivid",
          "n_requested": 1, "n_returned": 1,
          "response_id": "img-abc123",
          "duration_ms": 8400, "cost_usd": 0.042,
          "finish_reason": "completed", "safety_flagged": false,
          "provider_extras": { "usage": { "input_tokens": 12, "output_tokens": 1000 } }
        }
      }
    }
  }
}
```

### Google Imagen — safety flagged

```jsonc
{
  "block": {
    "kind": "image", "origin": "matrx",
    "file_id": "...", "metadata": {
      "generation": {
        "kind": "image", "provider": "google", "model": "imagen-3",
        "prompt": "...",
        "width": 1024, "height": 1024, "aspect_ratio": "1:1",
        "n_requested": 1, "n_returned": 1,
        "safety_flagged": true,
        "finish_reason": "content_filter",
        "provider_extras": {
          "safety": {
            "categories": ["VIOLENCE", "HATE"],
            "scores":     [0.1, 0.8]
          }
        }
      }
    }
  }
}
```

### Together AI Flux — full diffusion knobs for "regenerate same"

```jsonc
{
  "block": {
    "kind": "image", "origin": "matrx",
    "metadata": {
      "generation": {
        "kind": "image", "provider": "together", "model": "flux-1-dev",
        "prompt": "a robot in a forest", "negative_prompt": "low quality",
        "width": 1024, "height": 1024, "aspect_ratio": "1:1",
        "seed": 42, "steps": 28, "cfg_scale": 3.5,
        "n_requested": 1, "n_returned": 1,
        "duration_ms": 6400, "cost_usd": 0.018,
        "finish_reason": "completed", "safety_flagged": false
      }
    }
  }
}
```

## What you can build with this

1. **"Regenerate with same settings"** — for Together / Flux, replay with `seed`, `steps`, `cfg_scale`, `negative_prompt`. For OpenAI, replay with `quality`, `style`, `size = "{width}x{height}"`.
2. **Show the revised prompt** — OpenAI rewrites the user's prompt for safety/clarity. Surfacing `revised_prompt` (when present) makes generation transparent and improves user trust.
3. **Cost / latency analytics** — `cost_usd` and `duration_ms` are stamped on every AI-generated file. Aggregate by provider/model for per-feature spend dashboards.
4. **Safety/finish-reason UX** — when `safety_flagged: true` or `finish_reason: "content_filter"`, render an explanatory banner instead of failing silently.
5. **Re-render decisions** — `aspect_ratio` lets you decide whether a portrait/landscape thumbnail is appropriate.

## What did NOT change

- **Wire shapes**: `Asset`, `AssetVariant`, `UnifiedMediaBlock`, `MediaBlockData`, all stream events — identical to Phase 0.
- **Top-level `metadata` keys**: the existing `metadata.model`, `metadata.provider`, `metadata.cost`, `metadata.prompt` are still set for back-compat. New code should prefer `metadata.generation.{model,provider,cost_usd,prompt}` since those are typed + canonical.
- **API endpoints**: no new endpoints.

## What's deferred (NOT in Phase 2)

- **Mappers for Replicate, xAI, ElevenLabs, Groq, Cerebras, Cohere, Fireworks**: these providers get the default minimum-viable metadata record. Custom mappers will be added as their response shapes are formalized.
- **Audio/video duration extraction**: `duration_seconds` is plumbed through but providers don't always report it. Will be filled in by the variant-rendering pipeline (Phase 1b) once ffprobe is wired.
- **Storage migration of historic `cx_message.content[]`**: legacy messages don't have `metadata.generation`. Treat its absence on older messages as "unknown".

## Phase 2 backend reference

- Canonical model: [packages/matrx-ai/matrx_ai/media/generation_metadata.py](../packages/matrx-ai/matrx_ai/media/generation_metadata.py)
- Hook point: [packages/matrx-ai/matrx_ai/providers/base_media.py](../packages/matrx-ai/matrx_ai/providers/base_media.py) `BaseMediaGeneration._map_generation_metadata`
- OpenAI override: [packages/matrx-ai/matrx_ai/providers/openai/openai_image_api.py](../packages/matrx-ai/matrx_ai/providers/openai/openai_image_api.py)
- Google override: [packages/matrx-ai/matrx_ai/providers/google/google_image_api.py](../packages/matrx-ai/matrx_ai/providers/google/google_image_api.py)
- Together override: [packages/matrx-ai/matrx_ai/providers/together/together_image_api.py](../packages/matrx-ai/matrx_ai/providers/together/together_image_api.py)


