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

---

# Phase 1b — Legacy thumbnail columns dropped (Added 2026-05-16)

> **Status:** Shipped to `main`. **Two FE-visible wire-shape changes** — both small + previewed in the Phase 0 + Phase 1 notes as deprecations.

## TL;DR

- `cld_files.thumbnail_storage_uri` + `cld_files.thumbnail_url` **columns dropped** (migration 011). Every reader migrated to query the variants store directly via the new `thumbnail_resolver` helper.
- `UnifiedMediaBlock.thumbnail_url` + `UnifiedMediaBlock.thumbnail_uri` **fields removed** from every block kind. The canonical source of truth is `Asset.variants["thumbnail_url"].url` via `GET /assets/{file_id}` (or the bulk thumbnail resolver on the backend).
- The TUS upload pipeline + legacy `/files/upload` paths now write thumbnails through the Phase 1 variants pipeline — every uploaded file gets the SOCIAL_BASELINE (`og_url`, `thumbnail_url`, `tiny_url`) regardless of mime kind.
- `FileRecord.thumbnail_url` on `GET /files/*` endpoints **still works** — now populated by the variants resolver instead of the dropped column. The FE-visible field name + behaviour is unchanged.

## What broke (FE wire shape changes)

### 1. `UnifiedMediaBlock.thumbnail_url` / `thumbnail_uri` — removed

Phase 0 introduced these on `MediaBlockShared` and explicitly marked them legacy: *"kept for Phase 0 backward compat. Phase 1 moves thumbnails into Asset.variants['thumbnail_url']."* That migration is now complete. Both fields are gone from `ImageBlock` / `VideoBlock` / `AudioBlock` / `DocumentBlock` / `YouTubeBlock`.

**Migration:** if any FE code reads `block.thumbnail_url`, switch to:

```typescript
// For inline-rendered media (chat messages, popovers):
//   1. Resolve the asset envelope once
const asset = await fetch(`/assets/${block.file_id}`).then(r => r.json());
const thumbnailUrl = asset.variants["thumbnail_url"]?.url ?? null;
//   2. Or rely on the existing FileRecord.thumbnail_url from /files/{id}
```

If you're rendering blocks inline in a chat without a follow-up GET, the cleanest path is to add a `thumbnail_url` to the block via your existing adapter from a pre-fetched asset cache — same pattern as `UNIFIED_IMAGE_BLOCK.md`'s `useUnifiedImageUrl` hook.

### 2. `cld_files.thumbnail_storage_uri` / `cld_files.thumbnail_url` columns — dropped

Direct DB readers (you shouldn't have any — the API is the contract — but checking: if your Supabase Realtime subscriptions or any FE-side join reads these columns, they'll return `undefined`). The fix is the same as above: read the variants store via `GET /assets/{file_id}` or the variants subscription.

## What still works (no FE change needed)

### `FileRecord.thumbnail_url` on `/files/*` endpoints

The field name + behaviour is preserved. Backend changes:

- `GET /files` (list) — bulk-resolves thumbnails for every record in the page via parallel variant lookups; field stays populated when a thumbnail variant exists.
- `GET /files/{file_id}` — single thumbnail lookup, parallelised with the URL minting.
- `GET /files/by-path/{path}` — same single-record resolver.
- `GET /files/search` — same bulk resolver as list.

If you saw `thumbnail_url` populated on `FileRecord` yesterday, you'll see it populated today. The column's gone but the read path now goes through the variants store transparently.

### Phase 2 generation metadata

Unchanged. `cld_files.metadata.generation` and `MediaBlockData.block.metadata.generation` still carry the typed `MediaGenerationMetadata` from Phase 2.

### Phase 1 variants behaviour

Unchanged + extended. Now applies to **every** newly-uploaded file regardless of upload path:

| Upload path | Phase 1 behaviour | Phase 1b behaviour |
|---|---|---|
| `POST /assets` | SOCIAL_BASELINE variants rendered via universal dispatcher | unchanged |
| AI-generated media (matrx-ai persistence) | SOCIAL_BASELINE variants rendered via universal dispatcher | unchanged |
| **TUS upload** (`POST /files/tus/...`) | Legacy column-based thumbnail (single 256px JPEG) | **Now also routes through the variants pipeline** — `og_url` / `thumbnail_url` / `tiny_url` rendered, universal mime support inherited |
| **Legacy `POST /files/upload`** | Same as TUS — legacy column path | **Now routes through variants pipeline** — same baseline as POST /assets |

The TUS finalize handler still calls `generate_thumbnail_for_file` as a fire-and-forget background task — the function body is rewritten to dispatch through `SyncEngine.variants.render_async` with the SOCIAL_BASELINE specs, so the dispatch contract is unchanged but the storage is now variants-store-native.

## Quick contract reference (post Phase 1b)

```typescript
// MediaBlockShared (all kinds inherit)
interface MediaBlockShared {
  kind: "image" | "video" | "audio" | "document" | "youtube";
  origin: "matrx" | "external";

  // matrx-owned
  file_id?: string | null;
  file_uri?: string | null;
  visibility?: "public" | "private" | "shared" | null;
  cdn_url?: string | null;
  signed_url?: string | null;
  download_url?: string | null;
  signed_url_expires_at?: number | null;
  parent_file_id?: string | null;
  derivation_kind?: string | null;
  // REMOVED in Phase 1b:
  // thumbnail_url?: string | null;
  // thumbnail_uri?: string | null;

  // external
  external_url?: string | null;
  source_label?: string | null;

  // universal
  base64?: string | null;
  mime_type?: string | null;
  file_name?: string | null;
  size_bytes?: number | null;

  status?: "complete" | "streaming" | "error";
  progress?: number | null;
  error_message?: string | null;
  metadata?: Record<string, JsonValue>;
}
```

```jsonc
// FileRecord (unchanged — thumbnail_url now sourced from variants store)
{
  "id": "f1e2d3...",
  "size_bytes": 4567890,
  // ...standard FileRecord fields...
  "thumbnail_url": "https://cdn.matrxserver.com/.../f1e2d3__thumb.jpg",
  // ↑ Now resolved from cld_files variant row instead of the dropped
  //   cld_files.thumbnail_url column. FE code path unchanged.
}
```

## How to get a thumbnail URL (canonical answers)

Three contexts, three answers. All three return the same string when the variant exists.

| Context | Source | Backend helper |
|---|---|---|
| Have an `Asset` envelope (`GET /assets/{id}`) | `asset.variants["thumbnail_url"].url` | — |
| Have a `FileRecord` (`GET /files/*`) | `record.thumbnail_url` | (backend already resolved) |
| Have a `MediaBlock` from a stream event | Follow up with `GET /assets/{block.file_id}` and read `variants["thumbnail_url"].url` | `resolve_thumbnail_url_async(fm, record)` |

If you're rendering many blocks (gallery, list) and a per-block `GET /assets/{id}` is too chatty, the FE-side fix is the same pattern Phase 0 introduced: pre-fetch the asset for each file once, cache it in your store, and bind `variants["thumbnail_url"].url`. Backend isn't shipping a bulk `/assets?ids=...` endpoint in this phase — open a ticket if the per-tile fetch becomes a perf issue and we'll add it.

## Phase 1b backend reference

- New helper: [packages/matrx-utils/matrx_utils/file_handling/cloud_sync/thumbnail_resolver.py](../packages/matrx-utils/matrx_utils/file_handling/cloud_sync/thumbnail_resolver.py) — `resolve_thumbnail_url_async` + `resolve_thumbnail_urls_async` (bulk)
- Rewritten processor: [packages/matrx-utils/matrx_utils/file_handling/cloud_sync/processing/thumbnails.py](../packages/matrx-utils/matrx_utils/file_handling/cloud_sync/processing/thumbnails.py) — now dispatches through `SyncEngine.variants.render_async`
- Migration: [packages/matrx-utils/matrx_utils/file_handling/cloud_sync/sql/011_drop_legacy_thumbnail_columns.sql](../packages/matrx-utils/matrx_utils/file_handling/cloud_sync/sql/011_drop_legacy_thumbnail_columns.sql)
- Backfill updated: [packages/matrx-utils/matrx_utils/file_handling/cloud_sync/backfill/thumbnails.py](../packages/matrx-utils/matrx_utils/file_handling/cloud_sync/backfill/thumbnails.py)
- Router migration: [aidream/api/routers/files/__init__.py](../aidream/api/routers/files/__init__.py) — list, search, by-path, and single-GET endpoints

## Phase 1c and beyond — still deferred

- ~~Kind-specific full-resolution variants — `page1_url` for PDFs at full DPI, `poster_url` for videos at native res~~ **→ shipped in Phase 1c, see below**
- Audio waveform rendering (replaces mime-icon fallback for `audio/*`) — needs ffprobe/pydub for decode
- Bulk `/assets?ids=...` endpoint if per-tile `GET /assets/{id}` becomes a perf issue
- Mappers for Replicate, xAI, ElevenLabs, Groq, Cerebras, Cohere, Fireworks (Phase 2b — non-blocking; the default mapper covers them today)

---

# Phase 1c — Kind-specific full-resolution variants (Added 2026-05-16)

> **Status:** Shipped to `main`. **Wire shape is purely additive** — Phase 0/1/1b/2 contracts preserved. New: two `UnifiedMediaBlock` fields that have been defined since Phase 0 but were always `null` are now populated for PDF + video uploads.

## TL;DR

Every PDF and video uploaded to the platform now gets a full-resolution primary representation alongside the SOCIAL_BASELINE thumbnails:

- **PDF** → `page1_url`: page 1 rendered at 150 DPI as JPEG (~1200×1700 for A4 — a real reading preview, not a thumbnail)
- **Video** → `poster_url`: representative frame at 10% extracted at native resolution as JPEG (the standard HTML5 `<video poster=...>` source)

Both surface as:
- A new entry in `Asset.variants` (key = `"page1_url"` or `"poster_url"`)
- A populated field on `DocumentBlock.page1_url` / `VideoBlock.poster_url`

## What changed (additive)

### `Asset.variants["page1_url"]` (PDFs) and `Asset.variants["poster_url"]` (videos)

`POST /assets` upload of a PDF or video now writes two extra variant rows alongside the SOCIAL_BASELINE thumbnails. They appear in the response envelope's `variants` dict with stable keys:

```jsonc
GET /assets/{pdf_file_id}
{
  "file_id": "...",
  "primary_key": "thumbnail_url",
  "primary_url": "https://cdn.matrxserver.com/.../report__thumb.jpg",
  "variants": {
    "original":      { "key": "original",      ... },  // the PDF itself
    "og_url":        { "key": "og_url",        ... },  // 1200×630 — social preview
    "thumbnail_url": { "key": "thumbnail_url", ... },  // 400×400  — grid view
    "tiny_url":      { "key": "tiny_url",      ... },  // 128×128  — icon
    "page1_url":     {                                  // ← NEW: full-res page 1
      "key": "page1_url",
      "file_id": "...",
      "mime_type": "image/jpeg",
      "width": 1240, "height": 1754,                    // approx A4 at 150 DPI
      "url": "https://cdn.matrxserver.com/.../report__page1.jpg",
      "cdn_url": "...", "signed_url": null, ...
    }
  }
}
```

For videos, the extra variant key is `poster_url` (and `width`/`height` reflect the source video's native frame size).

### `DocumentBlock.page1_url` + `VideoBlock.poster_url` populated

These fields have been on the wire shape since Phase 0 (defined on the block models) but were always `null`. They now carry the rendered variant URLs:

```jsonc
// DocumentBlock — PDF uploaded via POST /assets or AI-generated
{
  "kind": "document", "origin": "matrx",
  "status": "complete",
  "file_id": "...",
  "mime_type": "application/pdf",
  "page_count": null,                              // still null — extraction is separate
  "page1_url": "https://cdn.matrxserver.com/.../report__page1.jpg",  // ← NEW: populated
  "size_bytes": 4567890,
  // ...standard MediaBlockShared fields...
}

// VideoBlock — video uploaded via POST /assets or AI-generated
{
  "kind": "video", "origin": "matrx",
  "status": "complete",
  "file_id": "...",
  "mime_type": "video/mp4",
  "width": 1920, "height": 1080, "duration_ms": null,
  "poster_url": "https://cdn.matrxserver.com/.../movie__poster.jpg",  // ← NEW: populated
  // ...standard MediaBlockShared fields...
}
```

`poster_url` is automatically resolved at emission time for AI-generated videos (`MediaBlockData` streamed by the matrx-ai providers). For block construction elsewhere (e.g., FE constructing a block from an `Asset` envelope), pass the variants catalog through the existing `cloud_file_to_media_block(record, kind_variant_urls={"poster_url": ...})` API.

## What you can build with this

1. **Real PDF previews in chat / file picker**: bind `<img src={DocumentBlock.page1_url}>` for a readable preview of the first page instead of the 400px thumbnail. Falls back to `variants.thumbnail_url.url` when `page1_url` is missing (old uploads, render failures).
2. **HTML5 video poster**: bind `<video poster={VideoBlock.poster_url} src={VideoBlock.url}>` so the FE shows a real frame before play, not a black square.
3. **Document detail view**: `Asset.variants.page1_url.url` is the canonical "render the first page" URL — use it as the hero image when the user opens a PDF detail page.

## What did NOT change

- **No new endpoints**.
- **No field renames**.
- All Phase 0/1/1b/2 fields preserved unchanged.
- Image masters get no new variants (they don't need a "primary representation" beyond `original` + SOCIAL_BASELINE).
- Audio masters still fall back to the mime-family icon for `thumbnail_url` (Phase 1d will add a real waveform).
- Other mime kinds (archives, text, code, generic) get no kind-specific variant — they keep the SOCIAL_BASELINE icon set.

## Quick coverage matrix

| Source mime | `original` | `og_url` | `thumbnail_url` | `tiny_url` | `page1_url` | `poster_url` |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `image/*` | ✓ | ✓ | ✓ | ✓ | — | — |
| `application/pdf` | ✓ | ✓ (page 1) | ✓ (page 1) | ✓ (page 1) | ✓ **(NEW)** | — |
| `video/*` | ✓ | ✓ (frame) | ✓ (frame) | ✓ (frame) | — | ✓ **(NEW)** |
| `audio/*` | ✓ | ✓ (icon) | ✓ (icon) | ✓ (icon) | — | — |
| `application/zip`, `text/*`, etc. | ✓ | ✓ (icon) | ✓ (icon) | ✓ (icon) | — | — |

## Idempotency

`(master_file_id, variant_key)` pairs are unique — re-uploading the same source via `POST /assets` (or re-running the thumbnail backfill) is a no-op for variants that already exist. Migration safe: no schema changes, no data migration needed.

## Phase 1c backend reference

- Kind-specific renderer: [packages/matrx-utils/.../specific_handlers/thumbnail_source.py](../packages/matrx-utils/matrx_utils/file_handling/specific_handlers/thumbnail_source.py) — `render_kind_specific_variants`
- Persistence primitive: [packages/matrx-utils/.../cloud_sync/variants_service.py](../packages/matrx-utils/matrx_utils/file_handling/cloud_sync/variants_service.py) — `VariantsService.persist_prerendered_async`
- POST /assets dispatch: [aidream/api/routers/assets.py](../aidream/api/routers/assets.py) (section "9. Render preset variants")
- AI gen dispatch: [packages/matrx-ai/.../media/media_persistence.py](../packages/matrx-ai/matrx_ai/media/media_persistence.py)
- Block wiring: [packages/matrx-connect/.../media_block.py](../packages/matrx-connect/matrx_connect/context/media_block.py) — `cloud_file_to_media_block(record, *, kind_variant_urls=...)`

---

# Phase 1d — Audio waveform rendering (Added 2026-05-16)

> **Status:** Shipped to `main`. **Pure server-side behaviour change** — zero wire-shape change.

## TL;DR

`audio/*` uploads now get **real waveform PNGs** in their SOCIAL_BASELINE variants (`thumbnail_url`, `og_url`, `tiny_url`) instead of the mime-family "AUDIO" icon. The dispatcher decodes the audio via pydub+ffmpeg, computes per-bucket peak amplitudes, and renders a centered-axis waveform as a 1600×400 PNG that then feeds the variant downsamplers.

## What changed

Before Phase 1d:

```
audio/mpeg upload → SOCIAL_BASELINE renders a green "MPEG" icon  
  → thumbnail_url = 400×400 of that icon
  → og_url        = 1200×630 of that icon
  → tiny_url      = 128×128  of that icon
```

After Phase 1d:

```
audio/mpeg upload → pydub decodes via ffmpeg → 800 peak amplitudes
  → render 1600×400 waveform PNG (sky-400 on slate-900)  
  → SOCIAL_BASELINE downsamples to thumbnail/og/tiny variants
  → grid views now show a recognisable audio signature instead of a generic badge
```

## Coverage matrix (post Phase 1d)

| Source mime | `original` | `og_url` | `thumbnail_url` | `tiny_url` | `page1_url` | `poster_url` |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `image/*` | ✓ | ✓ | ✓ | ✓ | — | — |
| `application/pdf` | ✓ | ✓ (page 1) | ✓ (page 1) | ✓ (page 1) | ✓ | — |
| `video/*` | ✓ | ✓ (frame) | ✓ (frame) | ✓ (frame) | — | ✓ |
| `audio/*` | ✓ | ✓ **(waveform — was icon)** | ✓ **(waveform — was icon)** | ✓ **(waveform — was icon)** | — | — |
| Archives / text / unknown | ✓ | ✓ (icon) | ✓ (icon) | ✓ (icon) | — | — |

## Failure modes

The dispatcher catches every per-kind rasteriser failure and falls back to the mime-family icon (current behaviour). So:

- Corrupt audio file → falls back to "AUDIO" icon (no upload failure)
- ffmpeg missing in the deployment environment → falls back to icon
- pydub raises an unexpected decoder error → falls back to icon

Production deployments need `ffmpeg` available on PATH for pydub to decode MP3/AAC/OGG/M4A/Opus/WebM (WAV + FLAC work without it).

## What did NOT change

- No wire-shape change. No new fields on `AudioBlock`. No new variant keys. No new endpoints.
- No new Pydantic models.
- Failure modes preserved (icon fallback).

If you previously called `Asset.variants["thumbnail_url"].url` for an audio file and got an icon, you'll now get a waveform image. Field names + types are identical.

## Future enhancements (still deferred)

- A wide-format `waveform_url` kind-specific variant (similar to `page1_url` / `poster_url`) for audio-player detail UIs that want the full 1600×400 image rather than the 400×400 thumbnail crop
- Duration extraction → `cld_files.duration_ms` population (currently always null for audio uploads; the dispatcher decodes the file but doesn't yet persist the duration field)
- Mappers for Replicate, xAI, ElevenLabs, Groq, Cerebras, Cohere, Fireworks (Phase 2b — non-blocking; the default mapper covers them today)
- Bulk `/assets?ids=...` endpoint if per-tile GET becomes a perf issue

## Phase 1d backend reference

- Waveform renderer: [packages/matrx-utils/.../specific_handlers/thumbnail_source.py](../packages/matrx-utils/matrx_utils/file_handling/specific_handlers/thumbnail_source.py) — `_render_audio_waveform`
- Module-level tunables: `_WAVEFORM_WIDTH`, `_WAVEFORM_HEIGHT`, `_WAVEFORM_PEAKS`, `_WAVEFORM_BG`, `_WAVEFORM_FG`, `_WAVEFORM_CENTER` (override for theme alignment)
- Dependencies: `pydub` (already in `uv.lock` as transitive); `ffmpeg` binary required on PATH for non-WAV/FLAC formats

---

# Phase 1d.1 — Source-metadata probe (width / height / duration_ms / page_count)

> **Status:** Shipped to `main`. **Additive wire fields** — every `UnifiedMediaBlock` field below has been on the shape since Phase 0 but was always `null`. Phase 1d.1 actually populates them.

## What changed

Every upload (`POST /assets`) and every AI-generated media file (matrx-ai persistence) now probes the source bytes at write time and persists the extracted dimensions / duration / page count to first-class columns or metadata:

| Source kind | Probe target | Storage |
|---|---|---|
| `image/*` | `width`, `height` (pixels via Pillow) | `cld_files.width`, `cld_files.height` columns |
| `application/pdf` | `page_count`, plus first-page `width`/`height` (pixels at 150 DPI) | `cld_files.metadata.page_count`, `cld_files.width`/`height` |
| `video/*` | `width`, `height` (native frame), `duration_ms` (via OpenCV FPS × frame count) | `cld_files.width`, `cld_files.height`, `cld_files.duration_ms` |
| `audio/*` | `duration_ms` (via pydub) | `cld_files.duration_ms` |

The probe runs in a thread executor (CPU-bound work) and is fully best-effort — any decoder failure leaves the column `null` and the upload still succeeds.

## What you now see on the wire (was always null before)

```jsonc
// ImageBlock — width/height now populated for ANY image upload
{
  "kind": "image", "origin": "matrx",
  "file_id": "...", "mime_type": "image/png",
  "width": 1024, "height": 768,         // ← NEW: populated
  ...
}

// VideoBlock — width/height + duration_ms now populated
{
  "kind": "video", "origin": "matrx",
  "file_id": "...", "mime_type": "video/mp4",
  "width": 1920, "height": 1080,         // ← NEW: populated
  "duration_ms": 120000,                  // ← NEW: 2 minutes
  ...
}

// AudioBlock — duration_ms now populated
{
  "kind": "audio", "origin": "matrx",
  "file_id": "...", "mime_type": "audio/mpeg",
  "duration_ms": 215000,                  // ← NEW: 3 min 35 sec
  ...
}

// DocumentBlock — page_count + width/height (first page) now populated
{
  "kind": "document", "origin": "matrx",
  "file_id": "...", "mime_type": "application/pdf",
  "width": 1240, "height": 1754,         // ← NEW: A4 at 150 DPI
  "page_count": 42,                       // ← NEW: total pages
  ...
}
```

## What did NOT change

- Wire shape unchanged. Every field above was already defined; you'll just see real values where you saw `null` before.
- Old uploads (pre Phase 1d.1) keep their `null` values — no backfill yet (open follow-up if needed).
- `cld_files` schema unchanged (`width`/`height`/`duration_ms` columns existed since Phase 0; `page_count` lives in `metadata` JSONB).

## Phase 1d.1 backend reference

- Probe helper: [packages/matrx-utils/.../specific_handlers/thumbnail_source.py](../packages/matrx-utils/matrx_utils/file_handling/specific_handlers/thumbnail_source.py) — `probe_source_metadata` / `ProbedMetadata`
- POST /assets wiring: [aidream/api/routers/assets.py](../aidream/api/routers/assets.py) (section "5b. Probe source metadata")
- AI media wiring: [packages/matrx-ai/.../media/media_persistence.py](../packages/matrx-ai/matrx_ai/media/media_persistence.py)
- DocumentBlock.page_count → [packages/matrx-connect/.../media_block.py](../packages/matrx-connect/matrx_connect/context/media_block.py)

---

# Phase 3a — `cx_message.content[]` media items now carry `file_id` + canonical fields

> **Status:** Shipped to `main`. **Additive storage-shape change** — legacy messages still load cleanly (back-compat reader path). New messages persist the canonical UnifiedMediaBlock-aligned fields. **No DB migration; no breaking change.**

## TL;DR

Closes the long-standing bug where `cx_message.content[]` media items were persisted *without* `file_id` — meaning the FE couldn't re-resolve signed URLs and had to special-case URL-only references. Every media item written from now on includes:

- `file_id` (when set on the source) — **the critical fix**
- `origin: "matrx" | "external"`
- `size_bytes` (mapped from the internal `file_size`)
- Image: `vision_class` and `alt` lifted into metadata for round-trippable storage
- YouTube: `external_url` (mirrors `url`)

Old messages keep working — the reader treats every new field as optional and falls back to the legacy shape when they're absent.

## Storage shape (post Phase 3a)

A media item in `cx_message.content[]` now looks like this when written by a Phase 3a or later server:

```jsonc
{
  "type": "media",                   // cx_message.content[] discriminator (unchanged)
  "kind": "image",                   // image | audio | video | document | youtube
  "origin": "matrx",                 // ← NEW: matrx | external
  "file_id": "122a35b5-...",         // ← NEW: persisted (was always null before!)
  "file_uri": "s3://.../122a35b5...", // optional, when known
  "url": "https://...",              // informational; FE re-mints fresh
  "mime_type": "image/png",
  "size_bytes": 2055674,             // ← NEW: was missing
  "metadata": {
    "vision_class": "anthropic_opus_hires",  // ← NEW: previously lost in roundtrip
    "alt": "blueprint poster",                // ← NEW: previously lost in roundtrip
    "media_resolution": "high",
    // ...any caller-supplied metadata...
  }
}
```

For audio/video/document, the same `file_id` + `origin` + `size_bytes` fields are present, plus the kind-specific extras already in `metadata` (`auto_transcribe`, `video_metadata`, etc.).

For YouTube items, `origin` is always `"external"` and a new `external_url` mirror is written alongside `url`.

## What the FE can do now

Previously, the FE's `from-cx-media-part.ts` adapter had to:
1. Try to find a `file_id` somewhere in the dict (usually missing → fall back to URL handling)
2. Compute origin heuristically
3. Pray the URL hadn't expired by the time the message was read

After Phase 3a:
1. `block.file_id` is reliably present for any matrx-owned media → use `GET /assets/{file_id}` to re-mint URLs without heuristics
2. `block.origin === "matrx" | "external"` is explicit → no guessing
3. `block.size_bytes` lets you size cards/render previews without a DB hit
4. `vision_class` / `alt` survive a write→read cycle

## What did NOT change

- **Storage shape is purely additive**. The legacy fields (`type`, `kind`, `url`, `base64_data`, `file_uri`, `mime_type`, `metadata`) still appear in every new write — exactly where they always did.
- **No schema migration**. `cx_message.content` is JSONB; adding fields requires no DDL.
- **No write-side breaking change**. Existing code that constructs an `ImageContent(file_id=..., ...)` and serializes works unchanged — the dict it produces just has more fields now.
- **No read-side breaking change**. The legacy `reconstruct_media_content` reads still work — pre-Phase-3a messages don't have `file_id`/`origin` at top level, and the reader treats them as `None`/`"external"` cleanly.

## What's intentionally deferred (Phase 3b)

- `width`/`height` (for image/video) and `duration_ms` (for audio/video) and `page_count` (for document) are NOT yet persisted into the cx_message storage shape. These fields don't exist as direct attributes on `ImageContent`/`AudioContent`/etc. (they're sourced from the cld_files row at FE-read time via `GET /assets/{file_id}`). Phase 3b will either add them to the dataclasses or compute them at write time so chat-message reads don't need a follow-up GET.
- Wire shape is still `{"type": "media", ...}` envelope, not a bare `UnifiedMediaBlock`. The `type` field stays as the cx_message dispatcher key. The FE adapter `from-cx-media-part.ts` can shrink (it has fewer fallbacks to handle) but doesn't fully disappear yet.

## Phase 3a backend reference

- Updated writers: [packages/matrx-ai/matrx_ai/config/media_config.py](../packages/matrx-ai/matrx_ai/config/media_config.py) — `ImageContent/AudioContent/VideoContent/DocumentContent/YouTubeVideoContent.to_storage_dict`
- Updated reader: same file — `reconstruct_media_content` (back-compat path)
- The reader detects legacy vs new by the presence of `file_id`/`origin` at the top level — both shapes deserialize cleanly

---

# Phase 3b + 2b — Final session batch (Added 2026-05-16)

> **Status:** Shipped to `main`. Wire-shape change is **purely additive on persisted shapes** (no field renames, no removals); same dimensions you already see on the stream's `MediaBlockData.block` now also appear on the `cx_message.content[]` media item after a write→read cycle.

## Phase 3b — dimensions/duration/page_count persisted on cx_message storage

The Phase 1d.1 probe populated these fields on the `cld_files` row + the stream event's `MediaBlockData.block`. Phase 3b plugs the last gap — when the same media block lands in `cx_message.content[]`, the dimensions are preserved through write→read instead of being lost.

### What's new on the persisted shape

Every media item written to `cx_message.content[]` from now on includes (when set):

| Class | New persisted fields |
|---|---|
| `ImageContent` | `width`, `height` |
| `AudioContent` | `duration_ms` |
| `VideoContent` | `width`, `height`, `duration_ms` |
| `DocumentContent` | `width`, `height`, `page_count` |

These match the same names already used in `UnifiedMediaBlock` (`ImageBlock.width`, `VideoBlock.duration_ms`, `DocumentBlock.page_count`, etc.) so a chat message's media item is shape-symmetric with a stream event's `MediaBlockData.block`.

### Result for the FE

Before Phase 3b: an FE-rendered chat history loaded `cx_message.content[]` media items via `reconstruct_media_content`. The reader produced `ImageContent(width=None, height=None, ...)` even when the source `cld_files` row knew the dimensions — the FE had to `GET /assets/{file_id}` per item to fill in dimensions for layout.

After Phase 3b: `block.width`/`height`/`duration_ms`/`page_count` are populated directly from the persisted storage. **No follow-up GET needed for chat-message renders.**

### Wire-up for AI-generated media

`MediaPersistResult` gains `width`, `height`, `duration_ms`, `page_count` fields populated from `probe_source_metadata` at write time. `BaseMediaGeneration._build_content_block` threads them through to the content class kwargs. The same values land on the synthetic record used to build the stream's `MediaBlockData.block`, so both surfaces carry identical data.

### What did NOT change

- Wire shape unchanged. Both stream `MediaBlockData.block` and `cx_message.content[]` media items had these fields defined since Phase 0 — Phase 3b just makes them actually populate after a roundtrip.
- Storage shape is still `{type: "media", kind: "...", ...}` — adding optional fields, not changing the envelope.
- `reconstruct_media_content` is fully back-compat: legacy messages (no `width`/`height`/`duration_ms` on top level) load with those fields as `None`, exactly like before.

### Phase 3b backend reference

- Dataclass field additions: [packages/matrx-ai/matrx_ai/config/media_config.py](../packages/matrx-ai/matrx_ai/config/media_config.py) — `ImageContent`, `AudioContent`, `VideoContent`, `DocumentContent`
- `MediaPersistResult` extension: [packages/matrx-ai/matrx_ai/media/media_persistence.py](../packages/matrx-ai/matrx_ai/media/media_persistence.py)
- `_build_content_block` threading: [packages/matrx-ai/matrx_ai/providers/base_media.py](../packages/matrx-ai/matrx_ai/providers/base_media.py)

---

## Phase 2b — Canonical generation metadata for Replicate, xAI, ElevenLabs

Phase 2 launched the canonical `MediaGenerationMetadata` shape with rich mappers for OpenAI / Google / Together. Phase 2b adds custom mappers for the next three providers we actually use in production:

| Provider | Modality | Highlights surfaced canonically |
|---|---|---|
| **Replicate** | image | `seed`, `steps`, `cfg_scale` (from `guidance`/`guidance_scale`), `negative_prompt`, `aspect_ratio`, `width`/`height`, `n_requested` (from `num_outputs`). Anything else from the model's input dict lands under `provider_extras.input` so per-model knobs (`safety_tolerance`, `prompt_strength`, model-specific style flags) survive. |
| **xAI grok-imagine** | image | `revised_prompt` (grok rewrites prompts like OpenAI), `width`/`height`/`aspect_ratio` when the SDK reports them, `n_requested` |
| **ElevenLabs** | speech (audio TTS) | `kind="speech"`, `voice_id`, `voice_name`, `audio_format`, `char_count`, `dialogue_mode` (bool — whether the call was multi-speaker dialogue or single-speaker TTS), `duration_seconds`/`duration_ms` from the probed audio |

### ElevenLabs path also got the file_id treatment

The ElevenLabs `_synthesize_audio` path now uses `save_media_envelope_async` instead of `save_media_async`. Effects:

1. `AudioContent.file_id` is populated for ElevenLabs TTS results (was always `None` before)
2. `MediaBlockData.block.file_id` populated on the stream event — FE can re-resolve signed URLs
3. `cld_files.metadata.generation` carries the canonical `MediaGenerationMetadata` for the TTS call
4. `AudioContent.duration_ms` populated automatically from the universal audio probe

Other audio providers (OpenAI TTS, xAI audio, Groq, Google audio) still use the simpler `save_media_async` URL path — they emit `MediaBlockData.block` with `origin: "external"`. Those can be migrated the same way when they become primary surfaces.

### What you can build with this

- **"Regenerate with same settings" on Replicate/Flux images**: replay with `metadata.generation.seed` + `steps` + `cfg_scale` + `negative_prompt`
- **Show xAI revised prompts to users**: same UX pattern as OpenAI gpt-image revisions
- **ElevenLabs voice metadata in chat**: render the voice name + character count next to a TTS audio block. The dialogue_mode flag tells you whether to show a single-speaker label or a list of speakers.

### Per-provider coverage matrix (updated)

| Field | OpenAI | Google | Together | **Replicate** | **xAI** | **ElevenLabs** | Others |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `kind`, `provider`, `model`, `prompt`, `n_returned` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `revised_prompt` | ✓ | — | — | — | ✓ | — | — |
| `width`/`height`/`aspect_ratio` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| `quality`/`style` | ✓ | — | — | — | — | — | — |
| `seed`/`steps`/`cfg_scale` | — | — | ✓ | ✓ | — | — | — |
| `negative_prompt` | — | — | ✓ | ✓ | — | — | — |
| `safety_flagged` | — | ✓ | — | — | — | — | — |
| `duration_seconds`/`duration_ms` | — | — | — | — | — | ✓ | — |
| `voice_id`/`voice_name` (in `provider_extras`) | — | — | — | — | — | ✓ | — |
| `cost_usd`/`duration_ms` (operational) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (defaults) |

### Phase 2b backend reference

- Mappers: [packages/matrx-ai/matrx_ai/media/generation_metadata.py](../packages/matrx-ai/matrx_ai/media/generation_metadata.py) — `map_replicate_image_response`, `map_xai_image_response`, `map_elevenlabs_audio_response`
- Replicate override: [packages/matrx-ai/matrx_ai/providers/replicate/replicate_image_api.py](../packages/matrx-ai/matrx_ai/providers/replicate/replicate_image_api.py)
- xAI override: [packages/matrx-ai/matrx_ai/providers/xai/xai_image_api.py](../packages/matrx-ai/matrx_ai/providers/xai/xai_image_api.py)
- ElevenLabs envelope migration: [packages/matrx-ai/matrx_ai/providers/eleven_labs/elevenlabs_api.py](../packages/matrx-ai/matrx_ai/providers/eleven_labs/elevenlabs_api.py)

---

## Session-end coverage snapshot

After this batch, the contract is fully end-to-end for everything the FE consumes — stream events, `Asset` envelopes, `FileRecord`/`GET /files/*`, and `cx_message.content[]` reads all carry the same canonical fields with the same names. The only remaining items on the deferred list don't change the wire contract — they're all "add custom mappers for additional providers" / "build a bulk `/assets?ids=` endpoint when needed" / "switch other audio providers to the envelope path when they become primary surfaces."

---

# Phase 2c — All TTS providers on the envelope path (Added 2026-05-16)

> **Status:** Shipped to `main`. **Closes the "is this a matrx-owned audio or an external URL?" question across every TTS surface.**

## TL;DR

OpenAI TTS, xAI TTS, and Groq TTS were the three remaining audio providers still using `save_media_async` (URL-only). All three migrated to `save_media_envelope_async` so their `AudioContent` carries `file_id`, their `MediaBlockData.block` carries the full matrx-owned shape (`origin: "matrx"`, `signed_url_expires_at`, every URL flavour), and their generation metadata stamps into `cld_files.metadata.generation` like every other media provider.

ElevenLabs was already migrated in Phase 2b. After Phase 2c, **every dedicated TTS endpoint goes through the envelope path** — no FE-side guessing about which audio is re-resolvable.

## What's new

### Wire shape for OpenAI / xAI / Groq TTS

Before Phase 2c:

```jsonc
{
  "event": "data",
  "data": {
    "type": "media_block",
    "block": {
      "kind": "audio", "origin": "external",   // ← external — no file_id
      "external_url": "https://signed-url-that-will-expire",
      "mime_type": "audio/mpeg"
      // ...no file_id, no signed_url_expires_at, no generation metadata
    }
  }
}
```

After Phase 2c:

```jsonc
{
  "event": "data",
  "data": {
    "type": "media_block",
    "block": {
      "kind": "audio", "origin": "matrx",       // ← matrx-owned
      "file_id": "abc-...",
      "file_uri": "s3://...",
      "cdn_url": "https://cdn.matrxserver.com/...",
      "signed_url": "https://...",
      "signed_url_expires_at": 1716000000000,
      "size_bytes": 45000,
      "duration_ms": 2500,
      "metadata": {
        "generation": {
          "kind": "speech", "provider": "openai",
          "model": "gpt-4o-mini-tts",
          "prompt": "Hello world",
          "duration_seconds": 2.5, "duration_ms": 2500,
          "provider_extras": { "voice": "alloy", "audio_format": "mp3" }
        }
      }
    }
  }
}
```

### Canonical generation metadata for TTS

`map_tts_audio_response(provider, model, prompt, voice, audio_format, duration_ms, extra)` is the new generic helper — every TTS provider uses it. Provider-specific knobs (language, speed, etc.) flow through `extra` into `provider_extras`. ElevenLabs keeps its richer `map_elevenlabs_audio_response` since it handles dialogue mode + character count.

Per-provider data captured:

| Provider | Canonical | provider_extras |
|---|---|---|
| **OpenAI TTS** | provider, model, prompt, duration_seconds/ms | voice, audio_format |
| **xAI TTS** | provider, model, prompt, duration_seconds/ms | voice, audio_format, language |
| **Groq TTS** | provider, model, prompt, duration_seconds/ms | voice, audio_format |
| **ElevenLabs** (Phase 2b) | provider, model, prompt, duration_seconds/ms | voice_id, voice_name, audio_format, char_count, dialogue_mode |

## What did NOT change

- **Wire shape unchanged.** AudioBlock had `file_id` defined since Phase 0 — just always null for these providers. Now it's populated.
- **No new fields on the block.**
- **Same UnifiedMediaBlock shape** as ElevenLabs.

## Still deferred (the one remaining audio surface)

**Google audio (Gemini multi-modal responses)** — Google's audio doesn't go through a dedicated TTS endpoint. It comes back as inline audio data on a multi-modal Gemini response, and `AudioContent.from_google` calls `save_media()` (synchronous, URL-only) to persist it. Migrating Google audio requires:

1. Changing `AudioContent.from_google` to be async + use envelope persistence, or
2. Re-walking the Gemini response in `_emit_media_from_response` to swap external_url blocks for matrx blocks after the audio is persisted

This is structurally different from the dedicated-TTS pattern and warrants its own focused change. **For now, Google audio is the only audio surface still emitting `origin: "external"` blocks.**

## Audio coverage matrix (post Phase 2c)

| Provider | TTS endpoint | Envelope path | file_id on block | Generation metadata |
|---|---|:-:|:-:|:-:|
| ElevenLabs | text_to_dialogue / TTS | ✓ | ✓ | ✓ (dialogue + voice_id) |
| OpenAI | audio.speech.create | ✓ **(NEW)** | ✓ **(NEW)** | ✓ **(NEW)** |
| xAI | api.x.ai/v1/tts | ✓ **(NEW)** | ✓ **(NEW)** | ✓ **(NEW)** |
| Groq | audio.speech.create (Orpheus/PlayAI) | ✓ **(NEW)** | ✓ **(NEW)** | ✓ **(NEW)** |
| Google | (multi-modal Gemini response) | — (deferred) | — | — |

## Phase 2c backend reference

- TTS mapper: [packages/matrx-ai/.../media/generation_metadata.py](../packages/matrx-ai/matrx_ai/media/generation_metadata.py) — `map_tts_audio_response`
- OpenAI TTS: [packages/matrx-ai/.../providers/openai/openai_api.py](../packages/matrx-ai/matrx_ai/providers/openai/openai_api.py) — `_execute_tts`
- xAI TTS: [packages/matrx-ai/.../providers/xai/xai_api.py](../packages/matrx-ai/matrx_ai/providers/xai/xai_api.py) — `_execute_tts`
- Groq TTS: [packages/matrx-ai/.../providers/groq/groq_api.py](../packages/matrx-ai/matrx_ai/providers/groq/groq_api.py) — `_execute_tts`

---

# Phase 1d.2 + 3c — Comprehensive backfill (Added 2026-05-16)

> **Status:** Shipped to `main`. **Two operator-runnable CLIs** that apply every Phase 1 / 1c / 1d.1 / 3a treatment to existing rows so UI testing on legacy data shows the same visuals + canonical fields as fresh uploads. **No FE wire-shape change** — this populates fields that already exist on the contract.

## TL;DR

Two CLIs you run once per environment after every new media phase ships:

1. **`python -m aidream.cli.thumbnail_backfill`** — per cld_files row:
   probes dimensions/duration/page_count (Phase 1d.1), renders
   SOCIAL_BASELINE variants (Phase 1), renders kind-specific full-res
   variants (Phase 1c). Idempotent — re-runnable cheaply.

2. **`python -m aidream.cli.cx_message_media_backfill`** — walks every
   `cx_message.content[]`, finds media items missing `file_id`/`origin`,
   looks them up in `cld_files` by `storage_uri`, and rewrites with
   canonical Phase 3a/3b fields (file_id, origin, size_bytes, width,
   height, duration_ms, page_count).

After both CLIs run, every legacy row + every legacy message item carries
the same canonical data your FE sees on new uploads.

## What the file-level backfill now does

The `generate_thumbnail_for_file` helper (despite the legacy name) is no
longer just thumbnails — it's the comprehensive media-processing pass:

| Step | What | Phase introduced |
|---|---|---|
| 1 | Probe `width`/`height`/`duration_ms`/`page_count` from source bytes | 1d.1 |
| 2 | Persist probed values to cld_files columns (when null — non-overwriting) | 1d.1 |
| 3 | Rasterise via universal dispatcher (image passthrough, PDF page 1, video frame, audio waveform, mime-icon fallback) | 1 |
| 4 | Render SOCIAL_BASELINE variants (og_url, thumbnail_url, tiny_url) | 1 |
| 5 | Render kind-specific full-res variants (page1_url for PDFs, poster_url for videos) | 1c |

Idempotent at every level — VariantsService skips variant keys that
already exist, column updates only fire when the column is null, and
the pre-flight check in the backfill skips rows that are fully complete
without even reading the master bytes.

### CLI usage

```bash
# Process every visual file (image/pdf/video/audio):
python -m aidream.cli.thumbnail_backfill

# Smoke-test on 50 files before the full run:
python -m aidream.cli.thumbnail_backfill --limit 50

# Scope to one user:
python -m aidream.cli.thumbnail_backfill --owner <UUID>

# Force re-render even on complete rows (use after tweaking the dispatcher):
python -m aidream.cli.thumbnail_backfill --force
```

Stats reported: `processed` / `skipped_complete` / `noop` / `failed`.

## What the cx_message backfill now does

For every `cx_message` row in the database, walks each `content[]`
item. For media items missing canonical Phase 3a fields (`file_id`,
`origin`), looks up the corresponding cld_files row via `storage_uri`
match and rewrites in place with:

- `file_id` (the FE can now re-resolve URLs via `GET /assets/{file_id}`)
- `origin` (always `"matrx"` since we matched a cld_files row)
- `size_bytes`, `mime_type` (filled when missing)
- Kind-specific: `width`/`height` for image/video, `duration_ms` for
  audio/video, `page_count` for documents

Items without a `file_uri` field are skipped (no way to match them to
a row reliably). YouTube items are skipped (always external). The
rewrite is **purely additive** — every existing field is preserved.

### CLI usage

```bash
# Process every cx_message row:
python -m aidream.cli.cx_message_media_backfill

# Dry-run — report what would change without writing:
python -m aidream.cli.cx_message_media_backfill --dry-run

# Smoke-test on 200 messages:
python -m aidream.cli.cx_message_media_backfill --limit 200

# Scope to one conversation:
python -m aidream.cli.cx_message_media_backfill --conversation <UUID>
```

Stats reported: `rows_scanned`, `rows_already_canonical`, `rows_updated`,
`items_enriched`, `items_skipped_no_uri`, `items_skipped_no_match`,
`update_failures`.

## Recommended run order

Run the file-level backfill first (it populates the cld_files columns
that the cx_message backfill reads). Then run cx_message:

```bash
# 1. Populate cld_files variants + dimensions on every old row
python -m aidream.cli.thumbnail_backfill

# 2. Backfill cx_message items now that cld_files has the data to copy
python -m aidream.cli.cx_message_media_backfill
```

Both are idempotent + cursor-paginated, so they can be re-run anytime
new phases ship to populate the latest fields on legacy data.

## What did NOT change

- **No wire-shape change.** Every field these CLIs populate has been
  on the contract since the phase introduced it.
- **No DB migrations.** Both scripts use existing columns + JSONB fields.
- **No FE work required.** Once both CLIs have run, the FE renderers
  that already work for fresh uploads will work identically for legacy
  data — same fields, same shape, same behaviour.

## Phase 1d.2 + 3c backend reference

- File-level core: [packages/matrx-utils/.../cloud_sync/processing/thumbnails.py](../packages/matrx-utils/matrx_utils/file_handling/cloud_sync/processing/thumbnails.py) — `generate_thumbnail_for_file` / `ensure_media_processing`
- File-level CLI: [aidream/cli/thumbnail_backfill.py](../aidream/cli/thumbnail_backfill.py)
- cx_message CLI: [aidream/cli/cx_message_media_backfill.py](../aidream/cli/cx_message_media_backfill.py)
- Backfill orchestrator: [packages/matrx-utils/.../cloud_sync/backfill/thumbnails.py](../packages/matrx-utils/matrx_utils/file_handling/cloud_sync/backfill/thumbnails.py) — `run_thumbnail_backfill`

---

# Phase 2c-google — Google multi-modal media on the envelope path (Added 2026-05-16)

> **Status:** Shipped to `main`. **Closes the last external-origin media surface.** Every audio/image/video that comes back from Gemini multi-modal responses now persists via the canonical envelope path with `file_id`, variants, and generation metadata — same shape as every other provider.

## TL;DR

The previous Google audio/image/video path used the SYNCHRONOUS `from_google` classmethods which call `save_media()` (sync, URL-only). The returned `AudioContent` / `ImageContent` / `VideoContent` carried `url` + `mime_type` only — no `file_id` — so `_emit_media_from_response` emitted blocks with `origin: "external"`.

New: `from_google_async` classmethods on each media class + `GoogleTranslator.from_google_async`. The Google API path now `await`s these so the returned content carries:

- `file_id`, `file_uri`, `size_bytes`
- `width`/`height` (image, video) + `duration_ms` (audio, video) from the probe
- `metadata.generation` with canonical `MediaGenerationMetadata`
- SOCIAL_BASELINE variants (og_url, thumbnail_url, tiny_url) rendered automatically as part of `save_media_envelope_async`
- Kind-specific variants (`page1_url` for PDFs, `poster_url` for videos)

`_emit_media_from_response` was already shape-aware (Phase 0 wire conversion) — once `content_item.file_id` is set, it automatically routes through `cloud_file_to_media_block` and emits `origin: "matrx"` blocks. Zero additional changes needed there.

## Audio coverage matrix (final, no remaining external-origin surfaces)

| Provider | Surface | Envelope path | file_id on block | Generation metadata |
|---|---|:-:|:-:|:-:|
| ElevenLabs | text_to_dialogue / TTS | ✓ | ✓ | ✓ (dialogue + voice_id + char_count) |
| OpenAI | audio.speech.create | ✓ | ✓ | ✓ (voice, audio_format) |
| xAI | api.x.ai/v1/tts | ✓ | ✓ | ✓ (voice, audio_format, language) |
| Groq | audio.speech.create (Orpheus/PlayAI) | ✓ | ✓ | ✓ (voice, audio_format) |
| **Google** | Gemini multi-modal | ✓ **(NEW — Phase 2c-google)** | ✓ **(NEW)** | ✓ **(NEW — generic mapper)** |

## What did NOT change

- **Wire shape unchanged.** AudioBlock / ImageBlock / VideoBlock had `file_id` defined since Phase 0; just always null for Google multi-modal until now.
- **Sync `from_google` classmethods preserved** for any legacy callers (e.g. test fixtures, non-async contexts). They keep producing URL-only content.
- **YouTube + file_data parts unchanged.** YouTube has no inline data to persist. `file_data` parts reference external Google-hosted URIs that don't need our envelope path.

## Failure-mode fallback

If `save_media_envelope_async` fails inside any of the three `from_google_async` paths, the helper logs a yellow warning and falls back to the legacy sync `from_google` — the response still ships with at least the URL-only content rather than dropping the media entirely.

## Final session contract summary

Every dedicated media surface — image, audio, video, document, youtube — across every supported provider (OpenAI, Google, Together, Replicate, xAI, ElevenLabs, Groq, **and now Google multi-modal**) now emits canonical `MediaBlockData` with `origin: "matrx"`, `file_id`, all four URL flavours, `signed_url_expires_at`, and `metadata.generation`. The FE can write one renderer for each kind and trust the same fields exist regardless of provider.

## Phase 2c-google backend reference

- Async classmethods: [packages/matrx-ai/matrx_ai/config/media_config.py](../packages/matrx-ai/matrx_ai/config/media_config.py) — `AudioContent.from_google_async`, `ImageContent.from_google_async`, `VideoContent.from_google_async`
- Async translator: [packages/matrx-ai/matrx_ai/providers/google/translator.py](../packages/matrx-ai/matrx_ai/providers/google/translator.py) — `GoogleTranslator.from_google_async`
- Google API caller: [packages/matrx-ai/matrx_ai/providers/google/google_api.py](../packages/matrx-ai/matrx_ai/providers/google/google_api.py) — both call sites now `await`


