# Unified Image Block

> **Audience:** Python team, frontend engineers, future agents working on streaming, persistence, or rendering of images.
> **Status:** Phase 1 — adapters live, canonical shape in production state. Python wire format unchanged.

## Why

Today, image data crosses the frontend boundary in four different shapes (stream `image_output` data event, stream `partial_image`, stream `render_block:image`, and DB `cx_message.content[]` media part). Each shape carries a different subset of fields; URL flavors are flattened into a single `url` field with no expiry signal; rich metadata (file_id, cdn_url, signed_url, visibility, thumbnails, dimensions) is either dropped or buried in untyped `metadata` blobs. The result: streaming images don't render, signed URLs expire silently, downloads fall back to bad fetches, and every component that touches an image rolls its own URL-resolution + expiry-detection logic.

**Goal:** one shape, one renderer, one resolver, one place where expiry lives — everywhere images touch the system.

## The canonical shape

Source of truth: [`features/files/blocks/image/types.ts`](./types.ts).

```typescript
type UnifiedImageBlock = MatrxImageBlock | ExternalImageBlock;

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
  thumbnailUrl: string | null;
  thumbnailUri: string | null;
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
    thumbnail_url: Optional[str] = None
    thumbnail_uri: Optional[str] = None
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
| `file_size`             | `sizeBytes`                | |
| `visibility`            | `visibility`               | Drives URL strategy. |
| `thumbnail_url`         | `thumbnailUrl`             | |
| `thumbnail_storage_uri` | `thumbnailUri`             | |
| `parent_file_id`        | `parentFileId`             | |
| `derivation_kind`       | `derivationKind`           | |
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
| `from-image-output-data.ts` | Stream `data: image_output` event | **Delete when Python emits `UnifiedImageBlock` directly** |
| `from-partial-image-data.ts` | Stream `data: partial_image` event | **Delete when Python emits `UnifiedImageBlock` with `status: "streaming"`** |
| `from-render-block.ts` | Stream `render_block` (type `image`) | **Delete when render-block emits `UnifiedImageBlock` in `data`** |
| `from-cx-media-part.ts` | DB `cx_message.content[]` media part | **Delete when the on-disk shape IS `UnifiedImageBlock`** |
| `from-cld-files-row.ts` | Direct Supabase `cld_files` row | Permanent — frontend reads Supabase directly for fallback re-hydrate. |
| `to-cx-media-part.ts` | Outbound: `UnifiedImageBlock` → DB media part | **Delete when frontend writes `UnifiedImageBlock` to `cx_message.content[]` directly** |

### The "soft contract" today

Adapters lift fields out of `metadata` so that anything Python puts there as a top-level key OR inside `metadata` produces the same `UnifiedImageBlock`. This lets Python ship the canonical fields incrementally — promote them out of metadata one at a time as code is updated, without breaking anything.

### What Python should emit TODAY for an image

To minimize fallback parsing on the frontend, an image event should carry as much of this as Python knows:

```json
{
  "type": "image_output",
  "origin": "matrx",
  "file_id": "122a35b5-2875-4251-9c11-bb57993f6f2f",
  "file_uri": "s3://cdn.matrxserver.com/4cf62e4e/122a35b5",
  "canonical_file_uri": "s3://matrx-user-files/4cf62e4e/122a35b5",
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
  "metadata": {
    "model": "gpt-image-2",
    "provider": "openai",
    "feature": "ai_images",
    "prompt": "Create a high-quality image of..."
  }
}
```

## Phase plan — how we converge upstream

1. **Phase 1 (now):** Frontend defines `UnifiedImageBlock`. Adapters lift today's wire format into it. All consumers (renderer, popover, action bar, popup viewer) read only the canonical shape. Python wire format unchanged.

2. **Phase 2 (Python catches up — incremental):** Python emits the canonical fields directly on the wire — first as additions (`file_id`, `cdn_url`, `signed_url`, `download_url`, `visibility` already exist; add `width`, `height`, `size_bytes`, `signed_url_expires_at`, `thumbnail_url`, `thumbnail_uri`, `parent_file_id`, `derivation_kind`, `canonical_file_uri`, `origin`). Adapters become near-passthroughs. **All inbound adapters except `from-cx-media-part.ts` get deleted in this phase.**

3. **Phase 3 (storage shape):** `cx_message.content[]` switches to storing `UnifiedImageBlock` directly under a new `kind: "image"` content type that carries the full canonical shape. The remaining inbound adapter and the outbound adapter get deleted. The frontend becomes lossless end-to-end.

Audio, video, document, and YouTube media follow the SAME pattern — Phase 1 image is the template.

## Implementation pointers

| Concern | File |
|---|---|
| Type definitions | [`types.ts`](./types.ts) |
| Render-time URL hook | [`useUnifiedImageUrl.ts`](./useUnifiedImageUrl.ts) |
| Renderer component | [`UnifiedImageBlockRenderer.tsx`](./UnifiedImageBlockRenderer.tsx) |
| Adapters | [`adapters/`](./adapters/) |
| Helpers (viewer-url, expiry parser) | [`helpers/`](./helpers/) |
| Stream ingest wiring | `features/agents/redux/execution-system/thunks/process-stream.ts` |
| DB-load wiring | `features/agents/redux/execution-system/utils/normalize-content-blocks.ts` |
| Outbound wiring | `features/agents/redux/execution-system/utils/assemble-cx-content-blocks.ts` |
| Block-renderer dispatcher | `components/mardown-display/chat-markdown/block-registry/BlockRenderer.tsx` |
| Popover | `features/agents/components/notifications/useImageArrivalPeeks.ts` |
| Action bar | `features/agents/components/messages-display/assistant/AssistantActionBar.tsx` |

## Change log

- **2026-05-16** — Initial Phase 1 landing. Canonical shape, adapters, renderer, expiry hook, doc.
