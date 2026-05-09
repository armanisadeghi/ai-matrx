/**
 * features/agents/redux/execution-system/instance-resources/resource-source.ts
 *
 * Bridge between resource-picker output and the universal file handler.
 * Used to be ~135 lines of MIME-sniffing + locator-picking; that logic
 * now lives in `features/file-handler` so this file is just shape coercion.
 *
 * Two responsibilities:
 *   1. `refineBlockType` — narrows `"document"` → image/audio/video when
 *      the data carries a real image/video/audio MIME. Forwards to the
 *      handler's classifier so a freshly-uploaded JPEG goes to the AI as
 *      an image, not a document.
 *
 *   2. `resourceDataToSource` — produces the value stored on the
 *      `ManagedResource.source` field. For media blocks it normalizes to
 *      a `MediaRef` (file_id > file_uri > url) using the handler's own
 *      `preferIdentityLocator`. Non-media block types pass through.
 *
 * No fork: every shape coercion the picker → agents path needs goes
 * through `@/features/file-handler/*`.
 */

import type { MediaRef } from "@/features/files/types";
import type { ResourceBlockType } from "@/features/agents/types/instance.types";
import { preferIdentityLocator } from "@/features/file-handler/utils/prefer-locator";
import type { FileSource, NormalizedFile } from "@/features/file-handler/types";
import { normalize } from "@/features/file-handler/input/normalize";

const MEDIA_BLOCK_TYPES = new Set<ResourceBlockType>([
  "image",
  "audio",
  "video",
  "document",
]);

function pickFileSource(d: Record<string, unknown>): FileSource | null {
  const fileId =
    typeof d.fileId === "string"
      ? d.fileId
      : typeof d.id === "string"
        ? d.id
        : null;
  const mime = readMime(d);
  if (fileId) return { kind: "file_id", fileId, mime };
  if (typeof d.file_uri === "string")
    return { kind: "file_uri", fileUri: d.file_uri, mime };
  if (typeof d.url === "string") return { kind: "external_url", url: d.url, mime };
  return null;
}

function readMime(d: Record<string, unknown>): string | undefined {
  if (typeof d.mime_type === "string" && d.mime_type) return d.mime_type;
  if (typeof d.mimeType === "string" && d.mimeType) return d.mimeType;
  const meta = d.metadata as Record<string, unknown> | undefined;
  if (meta && typeof meta.mimetype === "string" && meta.mimetype) {
    return meta.mimetype;
  }
  const details = d.details as Record<string, unknown> | undefined;
  if (details && typeof details.mimetype === "string" && details.mimetype) {
    return details.mimetype;
  }
  if (typeof d.type === "string" && d.type.includes("/")) return d.type;
  return undefined;
}

/**
 * Narrow `"document"` to `"image"` / `"audio"` / `"video"` when the
 * underlying data carries a real media MIME. Defers to the handler's
 * classifier — same registry, same rules.
 */
export function refineBlockType(
  blockType: ResourceBlockType,
  data: unknown,
): ResourceBlockType {
  if (blockType !== "document") return blockType;
  if (!data || typeof data !== "object") return blockType;
  const source = pickFileSource(data as Record<string, unknown>);
  if (!source) return blockType;
  const normalized: NormalizedFile = normalize(source);
  switch (normalized.meta.category) {
    case "IMAGE":
      return "image";
    case "AUDIO":
      return "audio";
    case "VIDEO":
      return "video";
    default:
      return blockType;
  }
}

/**
 * Convert a picker payload into the `source` value stored on a
 * ManagedResource. For media blocks, returns a canonical `MediaRef`.
 * Identical to what `fileHandler.toMediaRef(source)` would produce on
 * outbound — kept synchronous because the slice reducer needs it inline.
 */
export function resourceDataToSource(
  blockType: ResourceBlockType,
  data: unknown,
): unknown {
  if (!MEDIA_BLOCK_TYPES.has(blockType)) return data;
  if (!data || typeof data !== "object") return data;
  const source = pickFileSource(data as Record<string, unknown>);
  if (!source) return data;
  const normalized: NormalizedFile = normalize(source);
  const locator = preferIdentityLocator(normalized);
  const ref: MediaRef = {};
  if (locator.file_id) ref.file_id = locator.file_id;
  if (locator.file_uri) ref.file_uri = locator.file_uri;
  if (locator.url) ref.url = locator.url;
  if (normalized.meta.mime) ref.mime_type = normalized.meta.mime;
  return ref;
}
