/**
 * features/files/blocks/video/useVideoActions.ts
 *
 * Single source of truth for "what can you do with a video" — the action
 * callbacks and busy state driving the toolbar, dropdown, context menu,
 * and mobile drawer of `UnifiedVideoBlockRenderer`.
 *
 * Mirrors `image/useImageActions.ts`, restricted to the actions that make
 * sense for video:
 *   - download  — canonical file-handler byte download for Matrx media, or
 *                 the external URL lane for third-party video.
 *   - copyLink  — internal viewer URL when we own the file, external URL
 *                 otherwise. Same logic as the image hook.
 *   - openNewTab
 *   - viewOriginal (when a parentFileId exists)
 *
 * Image-only actions (download-as <format>, resize-and-download, copyImage,
 * print) are intentionally OMITTED — they're raster-specific.
 *
 * Share is NOT a callback here — it's a popover surface; the renderer wraps
 * the Share button in the canonical `BlockSharePopover` (the package share
 * body, media-kind-agnostic for matrx files), so there's exactly one share path.
 */

"use client";

import { useCallback, useState } from "react";
import { toast } from "@/lib/toast";
import { shareableMediaUrl } from "@/lib/media/durability";
import {
  downloadMediaSource,
  mediaRefToDownloadSource,
} from "../../media-client/download";
import type { VideoBlock } from "../types";

export interface VideoActionsApi {
  openNewTab(): void;
  copyLink(): Promise<void>;
  download(): Promise<void>;
  viewOriginal(): void;

  isDownloading: boolean;
  parentFileId: string | null;
  downloadName: string;
}

export interface UseVideoActionsArgs {
  block: VideoBlock;
  /** Currently resolved src — the URL the <video> is using. */
  currentSrc: string | null;
  /** Resolved file id (use `block.fileId` when in doubt). */
  fileId: string | null;
}

export function useVideoActions({
  block,
  currentSrc,
  fileId,
}: UseVideoActionsArgs): VideoActionsApi {
  const isMatrx = block.origin === "matrx";

  const [isDownloading, setIsDownloading] = useState(false);

  const parentFileId = isMatrx ? block.parentFileId : null;

  const ext =
    block.mimeType?.split("/")[1] ??
    (block.fileName ? /\.([^.]+)$/.exec(block.fileName)?.[1] : null) ??
    (currentSrc ? currentSrc.split(".").pop()?.split("?")[0] : null) ??
    "mp4";

  const downloadName = block.fileName ?? `video.${ext}`;

  const openNewTab = useCallback(() => {
    const target =
      block.origin === "matrx"
        ? `/files/f/${block.fileId}`
        : shareableMediaUrl(block.externalUrl ?? currentSrc);
    if (!target) {
      toast.error("No safe link is available for this video");
      return;
    }
    window.open(target, "_blank", "noopener,noreferrer");
  }, [block, currentSrc]);

  const copyLink = useCallback(async () => {
    // Internal viewer URL when we own the file (permanent + auth-gated),
    // external URL otherwise.
    const viewerUrl =
      block.origin === "matrx" ? `/files/f/${block.fileId}` : null;
    const linkToCopy = viewerUrl
      ? `${window.location.origin}${viewerUrl}`
      : shareableMediaUrl(
          block.origin === "external" ? block.externalUrl : currentSrc,
        );
    if (!linkToCopy) {
      toast.error("This private playback URL cannot be shared");
      return;
    }
    try {
      await navigator.clipboard.writeText(linkToCopy);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
    }
  }, [block, currentSrc]);

  // A CDN render URL can play without CORS permission to fetch its bytes.
  // Keep the owned file identity so the canonical handler makes the
  // authenticated byte request; external blocks retain their playback URL.
  const matrxFileId = isMatrx ? fileId ?? block.fileId : null;

  const download = useCallback(async () => {
    if (isDownloading) return;
    const ref = matrxFileId ? { file_id: matrxFileId } : currentSrc;
    if (!ref) {
      toast.error("No download URL available");
      return;
    }
    const source = mediaRefToDownloadSource(ref);
    if (!source) {
      toast.error("No download URL available");
      return;
    }
    setIsDownloading(true);
    try {
      await downloadMediaSource(source, downloadName);
    } catch {
      toast.error("Could not save video");
    } finally {
      setIsDownloading(false);
    }
  }, [
    isDownloading,
    matrxFileId,
    currentSrc,
    downloadName,
  ]);

  const viewOriginal = useCallback(() => {
    if (!parentFileId) return;
    window.open(`/files/f/${parentFileId}`, "_blank", "noopener,noreferrer");
  }, [parentFileId]);

  return {
    openNewTab,
    copyLink,
    download,
    viewOriginal,
    isDownloading,
    parentFileId,
    downloadName,
  };
}
