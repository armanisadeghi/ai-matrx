/**
 * features/files/components/core/MediaThumbnail/MediaThumbnail.tsx
 *
 * The single component that renders thumbnails in any cloud-files surface
 * (FileGrid, FileTableRow, picker preview chips, etc.). Picks the best
 * available source in a fixed priority order; strategy from the
 * file-type registry is now mostly informational (Phase 1b made
 * backend thumbnails universal across every MIME).
 *
 * Source priority (post Phase 1b universal thumbnails):
 *
 *   1. `file.thumbnailUrl` (from `FileRecord.thumbnail_url`)
 *      — Universal. Server-resolved from `Asset.variants["thumbnail_url"]`.
 *        Available for **every** uploaded file: images (resized JPEG),
 *        PDFs (page 1 @ 400² JPEG), videos (10%-mark frame), audio
 *        (waveform PNG), archives/text/unknown (mime-family icon PNG).
 *
 *   2. `Asset.variants["thumbnail_url"].url` via `useFileAsset(fileId)`
 *      — Used when `file.thumbnailUrl` is null (rows from direct DB
 *        read path; not yet processed; older uploads).
 *
 *   3. Strategy-specific live render — `<img>` for images using the
 *      master CDN URL, `<video preload="metadata">` for video posters.
 *      Useful when the backend variant is still rendering (~5s after
 *      upload) and we already have the master URL.
 *
 *   4. Category icon — final fallback (broken images, render failures).
 */

"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useFileSrc } from "@/features/files/handler/hooks/useFileSrc";
import { useRemintableSrc } from "@/features/files/handler/hooks/useRemintableSrc";
import { useFileAsset } from "@/features/files/hooks/useFileAsset";
import { getFilePreviewProfile } from "@/features/files/utils/file-types";
import { FileIcon } from "@/features/files/components/core/FileIcon/FileIcon";
import type { CloudFile } from "@/features/files/types";

export interface MediaThumbnailProps {
  file: Pick<
    CloudFile,
    | "id"
    | "fileName"
    | "mimeType"
    | "fileSize"
    | "metadata"
    | "publicUrl"
    | "thumbnailUrl"
  >;
  /** Pixel size for the icon fallback. Image/video fill their container. */
  iconSize?: number;
  /** Aspect ratio classes applied to the container, e.g. "aspect-[4/3]". */
  className?: string;
  /** Override the rounded corners of the container. */
  rounded?: string;
  /**
   * When true (default), the component will consult `/files/{id}/asset`
   * for a `thumbnail_url` variant if `file.thumbnailUrl` isn't already
   * populated. Set false on surfaces where the asset round-trip isn't
   * worth it (e.g. very tall lists, or where every record always has
   * `thumbnailUrl` set).
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

  // ── Source 1 — `FileRecord.thumbnail_url` lifted onto `CloudFile`. ──
  // Phase 1b: universal — every file kind gets a backend-rendered
  // thumbnail. We prefer this unconditionally when it's set: the
  // server already picked the right strategy (waveform for audio,
  // page 1 for PDF, frame for video, resized JPEG for images, mime
  // icon for unknown) and the URL is CDN-cacheable.
  const backendThumb = file.thumbnailUrl ?? null;

  // ── Source 2 — Asset variants fetch (per-file). ─────────────────────
  // Used when source 1 is null (rows from direct DB read path; tree-spine
  // partials; very fresh uploads where the variant pipeline is still
  // rendering). Gated by `preferAssetThumbnail` to allow surfaces to
  // skip the round-trip.
  const useAssetThumb = preferAssetThumbnail && !backendThumb;
  const { asset } = useFileAsset(useAssetThumb ? file.id : null, {
    signedUrlTtl: 3600,
  });
  const assetUrl = useAssetThumb ? pickThumbnailUrl(asset) : null;

  // ── Source 3 — Strategy-specific live render. ───────────────────────
  // When we still don't have a usable thumbnail (sources 1 + 2 both
  // failed), render the master directly for kinds where it's free:
  //   image           → use the master CDN URL or a signed URL
  //   video-poster    → `<video preload="metadata">` shows frame 1
  // This handles the very first few seconds after upload before the
  // backend renders the variant.
  const needsBytes = strategy === "image" || strategy === "video-poster";
  const cdnUrl = needsBytes ? (file.publicUrl ?? null) : null;
  const signedUrlEnabled = needsBytes && !backendThumb && !assetUrl && !cdnUrl;
  const signedUrl = useFileSrc(
    signedUrlEnabled ? { kind: "file_id", fileId: file.id } : null,
  );

  // Best available URL for this file, in priority order.
  const url = backendThumb ?? assetUrl ?? cdnUrl ?? signedUrl;

  // ── Source 4 — Icon fallback. ────────────────────────────────────────
  const fallback = (
    <div className="flex h-full w-full items-center justify-center bg-muted/40">
      <FileIcon fileName={file.fileName} size={iconSize} />
    </div>
  );

  let body: React.ReactNode = fallback;

  if (url) {
    if (strategy === "video-poster" && !backendThumb && !assetUrl) {
      // Live render path (source 3): when the only URL we have is the
      // master video URL, render via <video> so we get a real frame.
      // Backend-rendered video thumbnails (source 1/2) are JPEG frames
      // already and should go through the <img> path.
      body = <VideoPosterThumb url={url} fallback={fallback} />;
    } else {
      // Backend thumbnails (any kind) + image master + non-video kinds
      // all render via <img>. The backend ensures the URL points at
      // image bytes (PNG/JPEG) regardless of the source MIME.
      body = <ImageThumb url={url} alt={file.fileName} fallback={fallback} />;
    }
  }

  return (
    <div
      className={cn("relative overflow-hidden bg-muted/40", rounded, className)}
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
  // Media durability: a thumbnail served by a signed (expiring) URL re-mints
  // from its file_id on load failure instead of falling straight to the icon —
  // a user's own file never just "expires". The hook also resets on URL change
  // (signed-URL refresh / file swap), so no manual error/last-url bookkeeping.
  // Durable/foreign URLs pass through untouched.
  const { src, onError, failed } = useRemintableSrc(url);

  if (failed) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="h-full w-full object-cover"
      onError={onError}
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
  // Same self-heal contract as ImageThumb — re-mint an expired owned video URL
  // before showing the icon fallback.
  const { src, onError, failed } = useRemintableSrc(url);
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

  if (failed) return <>{fallback}</>;
  return (
    <video
      ref={ref}
      src={src}
      className="h-full w-full object-cover pointer-events-none"
      preload="metadata"
      muted
      playsInline
      onError={onError}
    />
  );
}

export default MediaThumbnail;
