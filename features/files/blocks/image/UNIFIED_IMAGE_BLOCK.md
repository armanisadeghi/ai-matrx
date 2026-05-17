# Unified Image Block

> **Audience:** Python team, frontend engineers, future agents working on streaming, persistence, or rendering of images.
> **Status:** Phase 2 — frontend ingestion is **wire-shape ready and awaiting the Python deploy**. The canonical `UnifiedMediaBlock` shape, the `fromMediaBlock` adapter, and the `process-stream.ts` dispatch are all live; Python backend code landed on `main` 2026-05-16 (commit `96f7ff7b`) but isn't deployed yet at the time of writing. The legacy adapters (`image_output` / `partial_image`) currently carry traffic and become fallback once Python deploys.

> **See also:** [docs/PYTHON_UPDATES.md](../../../../docs/PYTHON_UPDATES.md) — the Python rollout that landed Phase 2.
> The image-specific story below is now one slice of the broader media story documented in `features/files/blocks/types.ts` (`UnifiedMediaBlock`).

## Why

Today, image data crosses the frontend boundary in four different shapes (stream `image_output` data event, stream `partial_image`, stream `render_block:image`, and DB `cx_message.content[]` media part). Each shape carries a different subset of fields; URL flavors are flattened into a single `url` field with no expiry signal; rich metadata (file_id, cdn_url, signed_url, visibility, thumbnails, dimensions) is either dropped or buried in untyped `metadata` blobs. The result: streaming images don't render, signed URLs expire silently, downloads fall back to bad fetches, and every component that touches an image rolls its own URL-resolution + expiry-detection logic.

**Goal:** one shape, one renderer, one resolver, one place where expiry lives — everywhere images touch the system.

## The canonical shape

Image is now one variant of the project-wide `UnifiedMediaBlock` discriminated union (`kind: "image" | "video" | "audio" | "document" | "youtube"`). Image-only consumers continue to import `UnifiedImageBlock` from `features/files/blocks/image/types.ts`, which now re-exports the image discriminant of the broader union owned by `features/files/blocks/types.ts`.

Source of truth: [`features/files/blocks/types.ts`](../types.ts) (umbrella) and the image-only re-export at [`features/files/blocks/image/types.ts`](./types.ts).

```typescript
type UnifiedImageBlock = MatrxImageBlock | ExternalImageBlock;
// Each variant carries `kind: "image"` so it can flow through helpers
// that operate on the broader UnifiedMediaBlock.

// Shared by both variants
interface ImageBlockShared {
  cdnUrl: string | null;
  signedUrl: string | null;
  downloadUrl: string | null;
  base64: string | null;

  mimeType: string | null;
  fileName: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;

  status: "complete" | "streaming" | "error";
  progress: number | null;
  signedUrlExpiresAt: number | null;  // ms epoch

  metadata: Record<string, unknown> | null;
}

// Owned (cld_files row)
interface MatrxImageBlock extends ImageBlockShared {
  origin: "matrx";
  fileId: string;                     // REQUIRED — cld_files.id
  fileUri: string;                    // REQUIRED — cld_files.storage_uri
  canonicalFileUri: string | null;    // cld_files.canonical_storage_uri
  visibility: "public" | "private" | "shared";
  // Phase 1b: `thumbnailUrl` / `thumbnailUri` REMOVED. The canonical
  // thumbnail source is `Asset.variants["thumbnail_url"].url` via
  // `GET /assets/{file_id}`. For grid listings, `CloudFile.thumbnailUrl`
  // (resolved server-side onto `FileRecord.thumbnail_url`) is the FE
  // cache of that resolved URL.
  parentFileId: string | null;
  derivationKind: string | null;
}

// External (URL we don't own)
interface ExternalImageBlock extends ImageBlockShared {
  origin: "external";
  externalUrl: string;                // REQUIRED
  sourceLabel: string | null;
}
```

## Pydantic equivalent (suggested)

```python
from typing import Literal, Optional, Union, Dict, Any
from pydantic import BaseModel, Field

class ImageBlockShared(BaseModel):
    cdn_url: Optional[str] = None
    signed_url: Optional[str] = None
    download_url: Optional[str] = None
    base64: Optional[str] = None

    mime_type: Optional[str] = None
    file_name: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    size_bytes: Optional[int] = None

    status: Literal["complete", "streaming", "error"] = "complete"
    progress: Optional[float] = None
    signed_url_expires_at: Optional[int] = None  # ms epoch

    metadata: Optional[Dict[str, Any]] = None


class MatrxImageBlock(ImageBlockShared):
    origin: Literal["matrx"] = "matrx"
    file_id: str
    file_uri: str
    canonical_file_uri: Optional[str] = None
    visibility: Literal["public", "private", "shared"]
    # Phase 1b: thumbnail_url / thumbnail_uri removed. Canonical source:
    # Asset.variants["thumbnail_url"].url via GET /assets/{file_id}.
    parent_file_id: Optional[str] = None
    derivation_kind: Optional[str] = None


class ExternalImageBlock(ImageBlockShared):
    origin: Literal["external"] = "external"
    external_url: str
    source_label: Optional[str] = None


UnifiedImageBlock = Union[MatrxImageBlock, ExternalImageBlock]
```

> Wire serialization: Python emits `snake_case`; the frontend adapter converts to `camelCase` at the boundary. Eventually Python emits `camelCase` directly and the adapter shrinks to a passthrough.

## cld_files → MatrxImageBlock mapping

| `cld_files` column      | `MatrxImageBlock` field    | Notes |
|-------------------------|----------------------------|-------|
| `id`                    | `fileId`                   | Required. The permanent identity. |
| `storage_uri`           | `fileUri`                  | Required. Immutable native URI. |
| `canonical_storage_uri` | `canonicalFileUri`         | When present. |
| `file_name`             | `fileName`                 | For downloads. |
| `mime_type`             | `mimeType`                 | |
| `size_bytes`            | `sizeBytes`                | Phase 0 rename — `file_size` is gone. |
| `width`                 | `width`                    | Phase 1d.1 — first-class column. |
| `height`                | `height`                   | Phase 1d.1 — first-class column. |
| `visibility`            | `visibility`               | Drives URL strategy. |
| ~~`thumbnail_url`~~     | —                          | Phase 1b: column dropped. |
| ~~`thumbnail_storage_uri`~~ | —                      | Phase 1b: column dropped. |
| `parent_file_id`        | `parentFileId`             | |
| `derivation_kind`       | `derivationKind`           | |

**Phase 1b note:** thumbnails for matrx-owned media live on `Asset.variants["thumbnail_url"]` and are fetched per file via `GET /assets/{file_id}`. For grid listings, `CloudFile.thumbnailUrl` (lifted from the REST `FileRecord.thumbnail_url` field, which the backend now resolves from the variants store) is the cached source — see `MediaThumbnail` in `features/files/components/core/MediaThumbnail/MediaThumbnail.tsx`.
| `metadata`              | `metadata`                 | Pass-through. |
| (computed: Python signs) | `cdnUrl`                  | From `storage_uri` for public files. |
| (computed: Python signs) | `signedUrl`               | Pre-signed at emission time. |
| (computed: Python signs) | `downloadUrl`             | Attachment-disposition variant. |
| (computed: Python signs) | `signedUrlExpiresAt`      | Pre-computed `Date.now() + expires_in*1000`. |

Dimensions (`width`, `height`) come from cld_files.metadata if available, otherwise null until probed.

## How is expiry detected & resolved?

Single source of truth: [`features/files/blocks/image/useUnifiedImageUrl.ts`](./useUnifiedImageUrl.ts).

1. **External** → use `externalUrl`. No expiry logic.
2. **Matrx + public visibility** → prefer `cdnUrl`. No expiry logic.
3. **Matrx + signedUrl valid** (`signedUrlExpiresAt > now + 30s`) → use it.
4. **Matrx + signedUrl missing or expired** → call `fileHandler` (existing universal handler), which calls `Files.getSignedUrl(fileId)` and registers the new expiry with the global `expiry-wheel` so a refresh happens 30s before the next expiry — automatically, for every image in the app, with a single global timer.

Components NEVER touch signed-URL plumbing.

## Adapter contract (the temporary translation layer)

All adapters live in [`features/files/blocks/image/adapters/`](./adapters/) and produce `UnifiedImageBlock`. As Python adopts the canonical shape, each adapter shrinks to a passthrough and is then deleted.

| Adapter | Source | Status |
|---|---|---|
| `../adapters/from-media-block.ts` (Phase 2 — **primary path**) | Stream `data: media_block` event (canonical) | Permanent. Snake-case → camel-case at the boundary; near-passthrough since Python's wire shape mirrors the domain shape. |
| `from-image-output-data.ts` | Stream `data: image_output` event (legacy) | **Delete one release cycle after Python's `media_block` rollout completes.** |
| `from-partial-image-data.ts` | Stream `data: partial_image` event (legacy) | **Delete with `from-image-output-data.ts`.** |
| `from-render-block.ts` | Stream `render_block` (type `image`) | Permanent — render-blocks (non-data envelopes) still route through here. |
| `from-cx-media-part.ts` | DB `cx_message.content[]` media part | **Delete when the on-disk shape IS `UnifiedMediaBlock`** |
| `from-cld-files-row.ts` | Direct Supabase `cld_files` row | Permanent — frontend reads Supabase directly for fallback re-hydrate. |
| `to-cx-media-part.ts` | Outbound: `UnifiedImageBlock` → DB media part | **Delete when frontend writes `UnifiedMediaBlock` to `cx_message.content[]` directly** |

### What Python emits for an image (Phase 2 canonical wire shape)

The current canonical wire envelope is the `data: media_block` stream event
(see [`docs/PYTHON_UPDATES.md`](../../../../docs/PYTHON_UPDATES.md) §2 for the
authoritative spec). For an image, the inner `block` looks like:

```json
{
  "type": "media_block",
  "block": {
    "kind": "image",
    "origin": "matrx",
    "file_id": "122a35b5-2875-4251-9c11-bb57993f6f2f",
    "file_uri": "s3://matrx-user-files/4cf62e4e/122a35b5",
    "cdn_url": "https://cdn.matrxserver.com/.../122a35b5.png",
    "signed_url": "https://...?X-Amz-Date=...",
    "download_url": "https://...?disposition=attachment",
    "signed_url_expires_at": 1716000000000,
    "mime_type": "image/png",
    "file_name": "blueprint-poster.png",
    "width": 1024,
    "height": 1536,
    "size_bytes": 2055674,
    "visibility": "public",
    "thumbnail_url": null,
    "thumbnail_uri": null,
    "parent_file_id": null,
    "derivation_kind": null,
    "status": "complete",
    "vision_class": null,
    "metadata": {
      "generation": {
        "model": "gpt-image-2",
        "provider": "openai",
        "feature": "ai_images",
        "prompt": "Create a high-quality image of..."
      }
    }
  }
}
```

The frontend converts this to `UnifiedMediaBlock` (image discriminant) at
the boundary via [`fromMediaBlock`](../adapters/from-media-block.ts). The
adapter is a near-passthrough; only `snake_case` → `camelCase` and
defaulting of nullable fields. The legacy `image_output` / `partial_image`
events still carry traffic until Python deploys and are absorbed by the
fallback path in `process-stream.ts`.

## Phase plan — how we converge upstream

1. **Phase 1 (done):** Frontend defines `UnifiedImageBlock` and lifts the
   legacy `image_output` / `partial_image` events into it via dedicated
   adapters. All consumers (renderer, popover, action bar, popup viewer)
   read only the canonical shape. Python wire format unchanged.

2. **Phase 2 (deployed both sides; phase 1b/1c/1d.1 universal media also shipped):**
   - **Frontend (done):** Owns the umbrella `UnifiedMediaBlock` at
     [`../types.ts`](../types.ts) (`image | video | audio | document |
     youtube`). `UnifiedImageBlock` re-exports the image discriminant.
     [`../adapters/from-media-block.ts`](../adapters/from-media-block.ts)
     is the primary inbound adapter, wired into `process-stream.ts`
     ahead of the legacy event handlers.
   - **Backend (deployed):** Python emits the canonical `media_block`
     event with the full `UnifiedMediaBlock` payload. Phase 1b dropped
     `cld_files.thumbnail_url` / `cld_files.thumbnail_storage_uri` and
     moved thumbnails into the variants store (`Asset.variants
     ["thumbnail_url"]`). Phase 1c added `page1_url` (document) /
     `poster_url` (video) variants. Phase 1d.1 promoted `width`,
     `height`, `duration_ms`, and `page_count` to first-class columns
     populated at upload time. Phase 2 ships `MediaGenerationMetadata`.
   - **Deletion (next release cycle):** Remove the legacy `image_output`
     / `partial_image` event branches in `process-stream.ts` and the
     matching adapters (`from-image-output-data.ts`,
     `from-partial-image-data.ts`). They are dead carriers now.

3. **Phase 3 (storage shape — not started):** `cx_message.content[]`
   switches to storing `UnifiedMediaBlock` directly under a new
   `kind` content type that carries the full canonical shape. The
   `fromCxMediaPart` / `toCxMediaPart` adapters get deleted; the
   frontend becomes lossless end-to-end. Tracked in
   [`docs/PYTHON_UPDATES.md`](../../../../docs/PYTHON_UPDATES.md) as a
   future phase.

Audio, video, document, and YouTube media share the same `UnifiedMediaBlock`
contract. Image is end-to-end; audio and video render via the existing
`BlockRenderer.tsx` `audio_output` / `video_output` cases (which read both
the canonical camelCase shape and the legacy snake_case shape during the
transition); document and YouTube currently store correctly but render
nothing until a `UnifiedDocumentBlockRenderer` / `UnifiedYouTubeBlockRenderer`
lands.

## Implementation pointers

| Concern | File |
|---|---|
| Umbrella `UnifiedMediaBlock` (all kinds) | [`../types.ts`](../types.ts) |
| Umbrella guards / kind narrowing | [`../guards.ts`](../guards.ts) |
| Primary inbound adapter (Phase 2) | [`../adapters/from-media-block.ts`](../adapters/from-media-block.ts) |
| Image-only re-export | [`./types.ts`](./types.ts) |
| Image-only guard re-export | [`./guards.ts`](./guards.ts) |
| `MediaGenerationMetadata` (typed `metadata.generation` shape) | [`../types.ts`](../types.ts) (`parseGenerationMetadata`) |
| Render-time URL hook | [`useUnifiedImageUrl.ts`](./useUnifiedImageUrl.ts) |
| Renderer component | [`UnifiedImageBlockRenderer.tsx`](./UnifiedImageBlockRenderer.tsx) |
| Image-only legacy adapters | [`adapters/`](./adapters/) |
| Helpers (viewer-url, expiry parser) | [`helpers/`](./helpers/) |
| Stream ingest wiring | `features/agents/redux/execution-system/thunks/process-stream.ts` |
| DB-load wiring | `features/agents/redux/execution-system/utils/normalize-content-blocks.ts` |
| Outbound wiring | `features/agents/redux/execution-system/utils/assemble-cx-content-blocks.ts` |
| Block-renderer dispatcher | `components/mardown-display/chat-markdown/block-registry/BlockRenderer.tsx` |
| Popover | `features/agents/components/notifications/useImageArrivalPeeks.ts` |
| Action bar | `features/agents/components/messages-display/assistant/AssistantActionBar.tsx` |

## Change log

- **2026-05-16** — Phase 1b / 1c / 1d / 1d.1 alignment (Python deployed; FE caught up). Python's universal-thumbnail rollout shipped and the legacy `cld_files.thumbnail_url` + `cld_files.thumbnail_storage_uri` columns were dropped. Frontend changes:
  - **`MatrxOriginFields.thumbnailUrl` + `thumbnailUri` REMOVED** from `features/files/blocks/types.ts`. The canonical thumbnail source is now `Asset.variants["thumbnail_url"].url` via `GET /assets/{file_id}` (or `CloudFile.thumbnailUrl` for grid listings, lifted from `FileRecord.thumbnail_url`).
  - `from-cld-files-row.ts` no longer reads the dropped columns; reads first-class `row.width` / `row.height` (Phase 1d.1) with a metadata fallback.
  - `from-media-block.ts`, `from-image-output-data.ts`, and `to-cx-media-part.ts` all drop their thumbnail fields.
  - `useUnifiedImageUrl` drops the `block.thumbnailUrl` placeholder branch; `base64` streaming-partial path unchanged.
  - **New `CloudFile.thumbnailUrl` field** plumbed through `apiFileRecordToCloudFile` from `FileRecord.thumbnail_url` (top-level wire field still works — backend resolves server-side from variants store).
  - **`MediaThumbnail` rewritten around a four-source priority** — `file.thumbnailUrl` → `Asset.variants["thumbnail_url"]` via `useFileAsset` → live `<img>`/`<video>` render → category icon. Every file kind now gets a real thumbnail (PDFs show page 1, videos show a frame at 10%, audio shows a waveform, archives show server-rendered mime-family icon).
  - **`VideoOutputBlock` accepts `posterUrl`** (Phase 1c — populated for matrx-owned videos via `Asset.variants["poster_url"]`). `BlockRenderer.tsx`'s `video_output` case reads camelCase `posterUrl` (or snake_case `poster_url`) from the block's serverData and threads it through as the HTML5 `<video poster>` attribute.
  - **Streaming partials verified end-to-end** — `media_block` events with `status: "streaming"` + `base64` flow through `fromMediaBlock` → `ExternalImageBlock` → `process-stream.ts` upsert (`stableKey="image_block_current"` shared with the final) → `useUnifiedImageUrl` renders the `data:` URI with `isPlaceholder: true`. Final replaces in place. No flicker, no new code.
- **2026-05-16** — Phase 2 frontend landing (wire-shape ready; awaiting Python deploy of commit `96f7ff7b`). The frontend now:
  - Owns the umbrella `UnifiedMediaBlock` (`image | video | audio | document | youtube`) at `features/files/blocks/types.ts`. `UnifiedImageBlock` re-exports the image variant.
  - Adds `features/files/blocks/adapters/from-media-block.ts` as the **primary** inbound path. It mirrors Python's shape one-for-one and only renames `snake_case` → `camelCase` + defaults nullable fields.
  - Routes `media_block` events through this adapter from `process-stream.ts` ahead of the legacy `image_output` / `partial_image` / `audio_output` / `video_output` handlers, which remain in place as the current carrier path and become fallback once Python deploys.
  - Audio and video `BlockRenderer.tsx` cases now read both the canonical camelCase shape (`cdnUrl` / `signedUrl` / `externalUrl` / `mimeType`) and the legacy snake_case shape (`url` / `mime_type`) so they work for both the `media_block` and legacy event paths.
  - `BlockRenderer.tsx` gets an explicit `media_block` case for `document` and `youtube` kinds. They currently render null pending a `UnifiedDocumentBlockRenderer` / `UnifiedYouTubeBlockRenderer`.
  - `from-media-block.ts`'s `pickVisibility` defaults unknown values to `"private"` to match `dbRowToCloudFile` and `from-cld-files-row.ts`.
  - Renames `cld_files.file_size` → `cld_files.size_bytes` across every wire reader. `parseCloudTreeRow` keeps `file_size` as a defensive fallback for in-flight services; `dbRowToCloudFile` / `dbRowToCloudFileVersion` read only `size_bytes` because the Supabase-generated row type was regenerated. `FileRecord`, `FileUploadResponse`, and `RichDataStoreMember` are also renamed (consumed in `apiFileRecordToCloudFile`, `cloudUpload.ts`, `useDataStores.ts`, the share page, and the `FileRecordApi` constructor in `thunks.ts`).
  - Renames `AssetVariant.file_size` → `size_bytes` and adds `file_uri` + `signed_url_expires_at`. The old field is preserved as an optional alias.
  - `useUnifiedImageUrl` now prefers server-supplied `signedUrlExpiresAt` over URL parsing (no code change — verified the hook already had the priority order).
- **2026-05-16** — Initial Phase 1 landing. Canonical shape, adapters, renderer, expiry hook, doc.
