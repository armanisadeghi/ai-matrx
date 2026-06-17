/**
 * features/files/blocks/adapters/from-media-ref.ts
 *
 * Generic platform primitive: turn a bare `MediaRef` (or file_id / URL)
 * into a minimal `UnifiedMediaBlock` so it can be fed to the canonical
 * renderers (`UnifiedImageBlockRenderer`, `UnifiedVideoBlockRenderer`)
 * which consume a `block`, not a `MediaRef`.
 *
 * Why this exists: many callsites only ever have a durable reference to a
 * file — a `{file_id}` (we own it) or a `{url}` (external / already-public)
 * — yet they want the full rich-media affordances (expand → fullscreen,
 * the "…" menu, mobile long-press, share, download). Those affordances
 * live ONLY on the canonical block renderers. This adapter bridges the
 * gap without forcing every caller to hand-build a block literal (which
 * the CLAUDE.md file-handling rules forbid).
 *
 * Mapping (consistent with the invariants in `../types.ts`):
 *   - `{ file_id }` ref → an `origin: "matrx"` block. `fileId` is set;
 *     `visibility` is "private" (unknown) and `cdnUrl` / `signedUrl` are
 *     null, so `useUnifiedImageUrl` / `useUnifiedVideoUrl` resolve a fresh
 *     URL via the file handler (durable — re-minted on every load).
 *   - `{ url }` ref → an `origin: "external"` block. `externalUrl` is set;
 *     the renderer uses it as-is.
 *   - A ref that resolves to neither → an `external` "broken" block with a
 *     null/empty `externalUrl`; the renderer shows its error state.
 *
 * `status` is always "complete" — these refs point at finished media. For
 * streaming partials, use the streaming adapters in `from-media-block.ts`.
 *
 * NOTE on `fileUri`: a matrx block's type requires `fileUri`, but a bare
 * `file_id` doesn't carry one. We set it to `file_id://<id>` as a stable
 * non-null sentinel — the URL resolvers never read `fileUri` (they resolve
 * via the handler from `fileId`), so this satisfies the type contract
 * without affecting resolution.
 */

import type { MediaRef } from "@/features/files/types";
import type {
  ExternalImageBlock,
  ExternalVideoBlock,
  ImageBlock,
  MatrxImageBlock,
  MatrxVideoBlock,
  VideoBlock,
} from "../types";

/** The kinds this generic adapter can synthesize a block for. */
export type MediaBlockKindArg = "image" | "video";

function commonBase(ref: MediaRef) {
  return {
    status: "complete" as const,
    progress: null,
    errorMessage: null,
    mimeType: ref.mime_type ?? null,
    fileName: null,
    sizeBytes: null,
    base64: null,
    metadata: null,
  };
}

function matrxBase(fileId: string) {
  return {
    origin: "matrx" as const,
    fileId,
    // Non-null sentinel — resolvers never read this; they go via `fileId`.
    fileUri: `file_id://${fileId}`,
    canonicalFileUri: null,
    visibility: "private" as const,
    cdnUrl: null,
    signedUrl: null,
    downloadUrl: null,
    signedUrlExpiresAt: null,
    parentFileId: null,
    derivationKind: null,
  };
}

function externalBase(url: string) {
  return {
    origin: "external" as const,
    externalUrl: url,
    sourceLabel: null,
  };
}

/**
 * Build a minimal `ImageBlock` from a durable reference.
 */
export function imageBlockFromMediaRef(ref: MediaRef | null): ImageBlock | null {
  if (!ref) return null;
  const common = commonBase(ref);
  const imageBits = {
    kind: "image" as const,
    width: null,
    height: null,
    visionClass: null,
  };
  if (ref.file_id) {
    const block: MatrxImageBlock = {
      ...common,
      ...matrxBase(ref.file_id),
      ...imageBits,
    };
    return block;
  }
  const block: ExternalImageBlock = {
    ...common,
    ...externalBase(ref.url ?? ""),
    ...imageBits,
  };
  return block;
}

/**
 * Build a minimal `VideoBlock` from a durable reference.
 */
export function videoBlockFromMediaRef(ref: MediaRef | null): VideoBlock | null {
  if (!ref) return null;
  const common = commonBase(ref);
  const videoBits = {
    kind: "video" as const,
    width: null,
    height: null,
    durationMs: null,
    posterUrl: null,
  };
  if (ref.file_id) {
    const block: MatrxVideoBlock = {
      ...common,
      ...matrxBase(ref.file_id),
      ...videoBits,
    };
    return block;
  }
  const block: ExternalVideoBlock = {
    ...common,
    ...externalBase(ref.url ?? ""),
    ...videoBits,
  };
  return block;
}

/**
 * Kind-dispatching convenience: build an image or video block from a ref.
 * Returns `null` when `ref` is null.
 */
export function blockFromMediaRef(
  ref: MediaRef | null,
  kind: MediaBlockKindArg,
): ImageBlock | VideoBlock | null {
  return kind === "video"
    ? videoBlockFromMediaRef(ref)
    : imageBlockFromMediaRef(ref);
}
