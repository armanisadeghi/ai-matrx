/**
 * features/files/blocks/image/adapters/from-image-output-data.ts
 *
 * Convert a Python `image_output` data event into a UnifiedImageBlock.
 *
 * Today's Python wire shape (ImageOutputData):
 *   { type: "image_output", url, mime_type, file_id?, cdn_url?, download_url? }
 *
 * What this adapter does:
 *   - Lifts `file_id` to identify a matrx-owned file (most common case).
 *   - Tries to extract `file_id` from `url` if Python didn't supply one
 *     (legacy fallback — eventually deletable).
 *   - Promotes additional fields from `metadata` if Python included them
 *     there as a transitional shim:
 *       visibility, thumbnail_url, parent_file_id, derivation_kind,
 *       file_name, width, height, size_bytes.
 *   - When no `file_id` is recoverable, falls back to an external block
 *     using whichever URL is most likely permanent.
 *
 * Delete when Python emits UnifiedImageBlock directly (Phase 2).
 */

import type { ImageOutputData } from "@/types/python-generated/stream-events";
import type {
  UnifiedImageBlock,
  MatrxImageBlock,
  ExternalImageBlock,
} from "../types";
import type { MediaVisibility } from "@/features/files/blocks/types";
import { extractFileIdFromUrl } from "../helpers/extract-file-id-from-url";
import { parseFilenameFromUrl } from "../helpers/parse-filename-from-url";
import { isSignedUrl } from "@/lib/media/signed-url";

/**
 * Read a string from a metadata bag, returning null when missing / wrong type.
 */
function metaString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!metadata) return null;
  const value = metadata[key];
  return typeof value === "string" ? value : null;
}

function metaNumber(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  if (!metadata) return null;
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metaVisibility(
  metadata: Record<string, unknown> | null | undefined,
): MediaVisibility {
  const value = metaString(metadata, "visibility");
  if (
    value === "public" ||
    value === "personal" ||
    value === "internal" ||
    value === "link"
  )
    return value;
  // `metadata` is an untyped passthrough of the cld_files row, so it carries
  // RAW `platform.visibility` labels (personal < internal < link < public), not
  // the block domain's vocabulary. Translate them the same way the other read
  // boundaries do (redux/converters.ts::toVisibility) — before this, `internal`
  // (the column DEFAULT and the most common value in files.files) fell through
  // to the `public` default below, which tells the UI the image has a permanent
  // CDN URL and suppresses signed-URL refresh: the image dies at expiry.
  if (value === "shared" || value === "private") return "personal";
  // Unknown is NEVER "public". The old "public" default told
  // useBlockMediaSource the block's URL was a permanent CDN URL and bound the
  // authenticated durable `/files/{id}/download?inline=1` endpoint straight to
  // an <img> — the third-party-cookie lane — for a `personal` row: "Image
  // unavailable" forever in any browser that blocks third-party cookies
  // (Arman's Chrome, 2026-09-16). "personal" is the row default in
  // files.files and the safe assumption: the client resolves by file_id and
  // upgrades to the permanent CDN URL itself once the row is hydrated. The
  // server now stamps `metadata.visibility` on every generated block, so this
  // branch is the exception, not the rule.
  return "personal";
}

export function fromImageOutputData(
  data: ImageOutputData,
  carriedMetadata?: Record<string, unknown> | null,
): UnifiedImageBlock {
  // `metadata` may live either on the top-level event envelope or inside the
  // payload itself depending on Python's emit point. Caller passes whichever
  // is most relevant; we read both as fallbacks.
  const metadata = carriedMetadata ?? null;

  // ── URL flavors ────────────────────────────────────────────────────────
  const cdnUrl = data.cdn_url ?? null;
  const downloadUrl = data.download_url ?? null;

  // `url` is the durable always-renderable URL per the platform contract. A
  // LEGACY row/event can still carry a signed URL here — classify it so we
  // never file an expiring URL into the permanent-CDN slot (that
  // misclassification is the bug that made owned images go dark forever).
  const fallbackUrl = data.url;
  const fallbackLooksSigned = isSignedUrl(fallbackUrl);
  const finalCdnUrl =
    cdnUrl ?? (fallbackLooksSigned ? null : (fallbackUrl ?? null));

  // ── Identity ───────────────────────────────────────────────────────────
  const explicitFileId = data.file_id ?? null;
  const inferredFileId =
    explicitFileId ??
    extractFileIdFromUrl(finalCdnUrl) ??
    extractFileIdFromUrl(fallbackUrl) ??
    null;

  // ── Common fields (every variant, regardless of origin) ────────────────
  const common = {
    kind: "image" as const,
    base64: null,
    mimeType: data.mime_type ?? null,
    // Filename priority:
    //   1. Explicit `file_name` in the event metadata (Python's intent).
    //   2. The filename baked into the signed URL's
    //      `response-content-disposition` query param — Python sets this
    //      to the AI-chosen name on every signed-URL mint, and it's the
    //      ground truth for "what should the user see on download".
    //   3. null — fall back to a generic `image.<ext>` at the callsite.
    fileName:
      metaString(metadata, "file_name") ??
      parseFilenameFromUrl(downloadUrl) ??
      parseFilenameFromUrl(finalCdnUrl) ??
      null,
    width: metaNumber(metadata, "width"),
    height: metaNumber(metadata, "height"),
    // Phase 0 wire rename: prefer `size_bytes`, accept legacy `file_size`
    // from in-flight services that haven't redeployed yet.
    sizeBytes:
      metaNumber(metadata, "size_bytes") ?? metaNumber(metadata, "file_size"),
    visionClass: metaString(metadata, "vision_class"),
    status: "complete" as const,
    progress: null,
    errorMessage: null,
    metadata: metadata ?? null,
  };

  // ── Variant selection ──────────────────────────────────────────────────
  // A fileId proves matrx identity; anything without one collapses to
  // external.
  if (inferredFileId) {
    const matrx: MatrxImageBlock = {
      ...common,
      origin: "matrx",
      fileId: inferredFileId,
      visibility: metaVisibility(metadata),
      cdnUrl: finalCdnUrl,
      downloadUrl,
      // Phase 1b: thumbnails removed from MatrxImageBlock — the canonical
      // source is `Asset.variants["thumbnail_url"].url` via GET /assets/{id}.
      // For top-level listings, `CloudFile.thumbnailUrl` (lifted from
      // `FileRecord.thumbnail_url`) is the FE-side cache of that resolved URL.
      parentFileId: metaString(metadata, "parent_file_id"),
      derivationKind: metaString(metadata, "derivation_kind"),
    };
    return matrx;
  }

  // Truly external — synthesize an externalUrl from whatever we have.
  // External blocks no longer carry the matrx-only URL flavors at the
  // type level (see features/files/blocks/types.ts) — those URLs are
  // dropped here when we can't prove a matrx identity.
  const externalUrl = fallbackUrl ?? finalCdnUrl ?? "";
  if (!externalUrl) {
    const broken: ExternalImageBlock = {
      ...common,
      origin: "external",
      externalUrl: "",
      sourceLabel: metaString(metadata, "source_label"),
    };
    return broken;
  }
  const external: ExternalImageBlock = {
    ...common,
    origin: "external",
    externalUrl,
    sourceLabel: metaString(metadata, "source_label"),
  };
  return external;
}
