/**
 * features/files/blocks/image/utils/render-image-variant.ts
 *
 * Render a server-side variant of a matrx-owned image and return its
 * URL. Goes through the canonical `/assets/*` pipeline so the variant
 * PERSISTS on the asset envelope — the next request for the same
 * `(file_id, key)` is a cache hit (idempotent server-side).
 *
 * Flow:
 *   1. `GET /files/{file_id}/asset` — promotes any cld_files row into an
 *      Asset envelope. Idempotent. Cheap when already an asset.
 *   2. `POST /assets/{file_id}/variants` with one custom_variant spec
 *      describing the target dimensions / format / quality. Server
 *      returns the updated Asset envelope including the new variant URL.
 *
 * Why a single util instead of two callsites: the variant_key contract
 * is local to this file (the key derived from the spec must round-trip
 * for caching to work). Keeping it in one place stops the rest of the
 * codebase from re-inventing the naming scheme.
 *
 * The variant is downloadable via its `download_url` (which the server
 * sets `Content-Disposition: attachment` on) — that means the browser
 * will pick the right filename automatically when we navigate to it.
 */

import { addAssetVariants, getAssetForFile } from "@/features/files/api/assets";
import type { Asset } from "@/features/files/types";

export type ImageVariantFormat = "jpeg" | "png" | "webp" | "avif";

export interface ImageVariantSpec {
  /**
   * Target width in pixels. The server preserves aspect ratio when only
   * width OR height is specified; pass both to force exact dimensions
   * (uses `fit: "cover"` server-side).
   */
  width?: number;
  height?: number;
  format?: ImageVariantFormat;
  /** 1-100. Default 90 for JPEG/WebP, ignored for PNG. */
  quality?: number;
}

export interface RenderedVariant {
  /** Variant key used on the asset envelope. Stable for a given spec. */
  key: string;
  /** The full Asset envelope after the render. */
  asset: Asset;
  /**
   * Best URL for downloading the variant — prefers `download_url`
   * (Content-Disposition: attachment), falls back to `signed_url`,
   * then `cdn_url`, then `url`.
   */
  downloadUrl: string;
  /** Renderable URL — prefers `cdn_url` then `signed_url` then `url`. */
  displayUrl: string;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
}

/**
 * Render (or retrieve from cache) a single image variant. The variant
 * persists on the asset, so calling this twice with the same spec is
 * cheap.
 *
 * Throws on transport / auth / 404 errors — callers should wrap in a
 * try/catch and present a toast.
 */
export async function renderImageVariant(
  fileId: string,
  spec: ImageVariantSpec,
): Promise<RenderedVariant> {
  const key = variantKeyFor(spec);

  // 1. Ensure the file is an asset. Server returns the existing envelope
  //    when it already is — cheap fast path.
  await getAssetForFile(fileId);

  // 2. Request the variant (idempotent on (file_id, key)).
  const { data: asset } = await addAssetVariants(fileId, {
    custom_variants: [
      {
        key,
        // Server picks a sensible suffix on its own based on format/width;
        // we override only when the caller cares.
        ...(spec.width !== undefined && { width: spec.width }),
        ...(spec.height !== undefined && { height: spec.height }),
        ...(spec.quality !== undefined && { quality: spec.quality }),
        ...(spec.format !== undefined && { format: spec.format }),
      },
    ],
  });

  const variant = asset.variants[key];
  if (!variant) {
    throw new Error(
      `render-image-variant: server did not return variant "${key}" after render`,
    );
  }

  const displayUrl = variant.cdn_url ?? variant.signed_url ?? variant.url;
  const downloadUrl =
    variant.download_url ?? variant.signed_url ?? variant.cdn_url ?? displayUrl;

  if (!downloadUrl) {
    throw new Error(`render-image-variant: variant "${key}" has no usable URL`);
  }
  if (!displayUrl) {
    // download_url can be present while cdn_url/signed_url/url are all
    // absent — that would silently hand callers an empty <img src>. Fail
    // loud instead of masking it (matches the downloadUrl check above).
    throw new Error(
      `render-image-variant: variant "${key}" has a download URL but no display URL`,
    );
  }

  return {
    key,
    asset,
    downloadUrl,
    displayUrl,
    mimeType: variant.mime_type,
    width: variant.width,
    height: variant.height,
    // Phase 0 rename — see docs/PYTHON_UPDATES.md §3. Old API
    // payloads may still carry `file_size`; we read it as a fallback.
    sizeBytes: variant.size_bytes ?? variant.file_size ?? null,
  };
}

/**
 * Derive a deterministic variant key from a spec. Same spec → same key,
 * so repeat requests hit the server-side cache for that asset.
 *
 *   { width: 1024, format: "jpeg", quality: 90 } → "matrx_w1024_jpeg_q90"
 *   { format: "webp" }                          → "matrx_webp"
 *   { width: 512 }                              → "matrx_w512"
 *
 * Prefix `matrx_` to namespace these from preset-shipped variants
 * (avoids accidental key collisions with preset variants).
 */
export function variantKeyFor(spec: ImageVariantSpec): string {
  const parts: string[] = ["matrx"];
  if (spec.width !== undefined) parts.push(`w${spec.width}`);
  if (spec.height !== undefined) parts.push(`h${spec.height}`);
  if (spec.format !== undefined) parts.push(spec.format);
  if (spec.quality !== undefined) parts.push(`q${spec.quality}`);
  return parts.join("_");
}

/**
 * Suggest a download filename for a rendered variant. Strips the
 * original extension and replaces it with one matching the target
 * format, falling back to "image" when no name was set.
 */
export function suggestVariantFilename(
  originalName: string | null,
  spec: ImageVariantSpec,
): string {
  const ext = extensionFor(spec.format);
  const base = stripExtension(originalName) ?? "image";
  const sizeSuffix = spec.width ?? spec.height;
  return sizeSuffix !== undefined
    ? `${base}-${sizeSuffix}.${ext}`
    : `${base}.${ext}`;
}

function extensionFor(format: ImageVariantFormat | undefined): string {
  switch (format) {
    case "jpeg":
      return "jpg";
    case "png":
      return "png";
    case "webp":
      return "webp";
    case "avif":
      return "avif";
    default:
      return "png";
  }
}

function stripExtension(name: string | null): string | null {
  if (!name) return null;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return name;
  return name.slice(0, dot);
}
