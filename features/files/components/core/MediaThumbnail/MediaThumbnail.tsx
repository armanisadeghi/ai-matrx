/**
 * features/files/components/core/MediaThumbnail/MediaThumbnail.tsx
 *
 * The single component that renders thumbnails in any cloud-files surface
 * (FileGrid, FileTableRow, picker preview chips, etc.). Picks the strategy
 * dictated by the file-type registry and never hard-codes "is image"
 * checks — extending thumbnail support means adding a new
 * `ThumbnailStrategy` to `utils/file-types.ts`, not editing this file's
 * data.
 *
 * Strategy → render path:
 *
 *   "image"          → `<img src={signedUrl}>`
 *   "video-poster"   → muted `<video preload="metadata">`; the browser
 *                       displays the first frame as a still poster
 *   "pdf-firstpage"  → reserved; falls back to icon today (pdfjs is too
 *                       heavy to load in folder listings without backend
 *                       prerendering — see for_python/REQUESTS.md)
 *   "backend-thumb"  → reads `metadata.thumbnail_url`. Fallback to icon
 *                       when missing (the field doesn't exist server-side
 *                       yet — Python team request logged)
 *   "icon"           → category icon at the requested size
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useSignedUrl } from "@/features/files/hooks/useSignedUrl";
import { useFileAsset } from "@/features/files/hooks/useFileAsset";
import { getFilePreviewProfile } from "@/features/files/utils/file-types";
import { FileIcon } from "@/features/files/components/core/FileIcon/FileIcon";
import type { CloudFile } from "@/features/files/types";

export interface MediaThumbnailProps {
  file: Pick<
    CloudFile,
    "id" | "fileName" | "mimeType" | "fileSize" | "metadata" | "publicUrl"
  >;
  /** Pixel size for the icon fallback. Image/video fill their container. */
  iconSize?: number;
  /** Aspect ratio classes applied to the container, e.g. "aspect-[4/3]". */
  className?: string;
  /** Override the rounded corners of the container. */
  rounded?: string;
  /**
   * When true (default), images consult `/files/{id}/asset` so we can
   * render a small variant (thumbnail / tiny) when one exists — saves
   * bandwidth vs. always serving the full-resolution master. Set false
   * on surfaces where the asset round-trip isn't worth it (e.g. very
   * tall lists where the master is already cached by the browser).
   */
  preferAssetThumbnail?: boolean;
}

/**
 * Best-effort pick of a small variant from an Asset envelope for grid
 * thumbnails. Walks the conventional keys in order, then falls back to
 * `primary_url`. Returns null when nothing renderable exists — the
 * caller should fall back to its signed-URL path.
 */
function pickThumbnailUrl(
  asset: import("@/features/files/types").Asset | null,
): string | null {
  if (!asset) return null;
  const v = asset.variants;
  return (
    v.thumbnail_url?.url ??
    v.tiny_url?.url ??
    v.thumbnail?.url ??
    v.tiny?.url ??
    v.card_url?.url ??
    v.card?.url ??
    asset.primary_url ??
    v.original?.url ??
    null
  );
}

export function MediaThumbnail({
  file,
  iconSize = 48,
  className,
  rounded,
  preferAssetThumbnail = true,
}: MediaThumbnailProps) {
  const profile = getFilePreviewProfile(
    file.fileName,
    file.mimeType,
    file.fileSize,
  );

  const strategy = profile.thumbnailStrategy;

  // For strategies that need bytes (image / video), prefer the permanent
  // CDN URL when the server marked the file public — saves a round-trip
  // to /files/{id}/url AND the rendered URL is cacheable indefinitely
  // by Cloudflare. Fall back to a signed URL when publicUrl is null
  // (private/shared files, or rows from a direct DB read).
  const needsBytes = strategy === "image" || strategy === "video-poster";
  const cdnUrl = needsBytes ? (file.publicUrl ?? null) : null;

  // Asset-thumbnail upgrade: for IMAGE files specifically, ask the
  // `/files/{id}/asset` endpoint for a small variant (thumbnail_url /
  // tiny_url) when one exists. This turns the per-row download into a
  // ~400² render instead of the full master — typically 70%+ smaller.
  // Gated to images only (video posters benefit less and the signed
  // URL → <video preload="metadata"> path is already cheap) AND only
  // when we don't already have a public CDN URL (the master CDN URL
  // is cacheable indefinitely; no win from a separate variant lookup).
  const isImage = (file.mimeType ?? "").startsWith("image/");
  const useAssetThumb =
    preferAssetThumbnail && strategy === "image" && isImage && !cdnUrl;
  const { asset } = useFileAsset(useAssetThumb ? file.id : null, {
    signedUrlTtl: 3600,
  });
  const assetUrl = useAssetThumb ? pickThumbnailUrl(asset) : null;

  // Final fallback: legacy signed-URL hook. Used for non-image strategies
  // (video poster), or when the asset endpoint hasn't returned yet, or
  // when no asset variants exist for this file.
  const signedUrlEnabled = needsBytes && !cdnUrl && !assetUrl;
  const { url: signedUrl } = useSignedUrl(signedUrlEnabled ? file.id : null, {
    expiresIn: 3600,
  });
  const url = cdnUrl ?? assetUrl ?? signedUrl;

  // Backend-thumbnail strategy reads the metadata field directly. The Python
  // team's contract for this field is logged in for_python/REQUESTS.md — until it
  // ships, this branch is dormant for every file.
  const backendUrl =
    strategy === "backend-thumb"
      ? readMetadataString(file.metadata, "thumbnail_url")
      : null;

  // Icon fallback — rendered as the default and revealed when an
  // image/video fails to load (e.g. HEIC on Chrome, broken signed URL).
  const fallback = (
    <div className="flex h-full w-full items-center justify-center bg-muted/40">
      <FileIcon fileName={file.fileName} size={iconSize} />
    </div>
  );

  let body: React.ReactNode = fallback;

  if (strategy === "image" && url) {
    body = (
      <ImageThumb
        url={url}
        alt={file.fileName}
        fallback={fallback}
      />
    );
  } else if (strategy === "video-poster" && url) {
    body = <VideoPosterThumb url={url} fallback={fallback} />;
  } else if (strategy === "backend-thumb" && backendUrl) {
    body = (
      <ImageThumb url={backendUrl} alt={file.fileName} fallback={fallback} />
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-muted/40",
        rounded,
        className,
      )}
    >
      {body}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function ImageThumb({
  url,
  alt,
  fallback,
}: {
  url: string;
  alt: string;
  fallback: React.ReactNode;
}) {
  const [errored, setErrored] = useState(false);
  // Reset the error state if the URL changes (signed-URL refresh, file swap).
  const lastUrlRef = useRef(url);
  if (lastUrlRef.current !== url && errored) {
    lastUrlRef.current = url;
    setErrored(false);
  } else if (lastUrlRef.current !== url) {
    lastUrlRef.current = url;
  }

  if (errored) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className="h-full w-full object-cover"
      onError={() => setErrored(true)}
    />
  );
}

function VideoPosterThumb({
  url,
  fallback,
}: {
  url: string;
  fallback: React.ReactNode;
}) {
  const [errored, setErrored] = useState(false);
  const ref = useRef<HTMLVideoElement | null>(null);

  // Some browsers refuse to render a frame until they explicitly know how
  // to seek. Setting `currentTime = 0` after metadata loads ensures the
  // first frame is decoded and displayed.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const onMeta = () => {
      try {
        v.currentTime = 0;
      } catch {
        /* ignore — some streams don't support setting currentTime */
      }
    };
    v.addEventListener("loadedmetadata", onMeta);
    return () => v.removeEventListener("loadedmetadata", onMeta);
  }, []);

  if (errored) return <>{fallback}</>;
  return (
    <video
      ref={ref}
      src={url}
      className="h-full w-full object-cover pointer-events-none"
      preload="metadata"
      muted
      playsInline
      onError={() => setErrored(true)}
    />
  );
}

function readMetadataString(
  metadata: Record<string, unknown> | undefined | null,
  key: string,
): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const v = (metadata as Record<string, unknown>)[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export default MediaThumbnail;
