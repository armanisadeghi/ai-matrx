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
