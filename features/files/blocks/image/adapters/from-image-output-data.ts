/**
 * features/files/blocks/image/adapters/from-image-output-data.ts
 *
 * Convert a Python `image_output` data event into a UnifiedImageBlock.
 *
 * Today's Python wire shape (ImageOutputData):
 *   { type: "image_output", url, mime_type, file_id?, cdn_url?, signed_url?,
 *     download_url? }
 *
 * What this adapter does:
 *   - Lifts `file_id` to identify a matrx-owned file (most common case).
 *   - Tries to extract `file_id` from `url` if Python didn't supply one
 *     (legacy fallback — eventually deletable).
 *   - Computes `signedUrlExpiresAt` from the X-Amz-Date / X-Amz-Expires
 *     query params on `signed_url` (or `url` if it looks signed).
 *   - Promotes additional fields from `metadata` if Python included them
 *     there as a transitional shim:
 *       visibility, thumbnail_url, parent_file_id, derivation_kind,
 *       file_name, width, height, size_bytes, signed_url_expires_at.
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
import { extractFileIdFromUrl } from "../helpers/extract-file-id-from-url";
import { parseFilenameFromUrl } from "../helpers/parse-filename-from-url";
import { parseSignedUrlExpiry } from "../helpers/parse-signed-url-expiry";
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
): "public" | "personal" | "shared" {
  const value = metaString(metadata, "visibility");
  if (value === "public" || value === "personal" || value === "shared")
    return value;
  // Default assumption: AI-generated images are stored with `visibility: "public"`
  // in cld_files (see the example row in UNIFIED_IMAGE_BLOCK.md). When Python
  // doesn't tell us, public is the safer fallback because it never tries to
  // refresh a signed URL that doesn't exist.
  return "public";
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
  const signedUrl = data.signed_url ?? null;
  const downloadUrl = data.download_url ?? null;

  // Today Python sets `url` to one of: cdn url (public files), signed url
  // (private), or a vanity URL. If neither cdn_url nor signed_url is set,
  // we use `url` as the best-effort source URL.
  const fallbackUrl = data.url;

  // If `fallbackUrl` carries ANY signature markers (SigV2 `AWSAccessKeyId`/
  // `Signature`/`Expires` OR SigV4 `X-Amz-*`), it is an EXPIRING signed URL —
  // never a permanent CDN URL. Misclassifying a signed URL as CDN here is the
  // bug that made owned images go dark forever: it skips the re-mint path. Use
  // the canonical detector so every dialect is recognized.
  const fallbackLooksSigned = isSignedUrl(fallbackUrl);

  const finalSignedUrl =
    signedUrl ?? (fallbackLooksSigned ? fallbackUrl : null);
  const finalCdnUrl =
    cdnUrl ?? (fallbackLooksSigned ? null : (fallbackUrl ?? null));

  // ── Expiry ─────────────────────────────────────────────────────────────
  const explicitExpiry = metaNumber(metadata, "signed_url_expires_at");
  const derivedExpiry = finalSignedUrl
    ? parseSignedUrlExpiry(finalSignedUrl)
    : null;
  const signedUrlExpiresAt = explicitExpiry ?? derivedExpiry;

  // ── Identity ───────────────────────────────────────────────────────────
  const explicitFileId = data.file_id ?? null;
  const inferredFileId =
    explicitFileId ??
    extractFileIdFromUrl(finalCdnUrl) ??
    extractFileIdFromUrl(finalSignedUrl) ??
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
      parseFilenameFromUrl(finalSignedUrl) ??
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
      signedUrl: finalSignedUrl,
      downloadUrl,
      signedUrlExpiresAt,
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
  const externalUrl = fallbackUrl ?? finalCdnUrl ?? finalSignedUrl ?? "";
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
