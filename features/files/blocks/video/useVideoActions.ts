/**
 * features/files/blocks/video/useVideoActions.ts
 *
 * Single source of truth for "what can you do with a video" — the action
 * callbacks and busy state driving the toolbar, dropdown, context menu,
 * and mobile drawer of `UnifiedVideoBlockRenderer`.
 *
 * Mirrors `image/useImageActions.ts`, restricted to the actions that make
 * sense for video:
 *   - download  — native share/save on mobile (navigator.share), else a
 *                 plain file download. Reuses the image save util, which is
 *                 MIME-agnostic (it fetches bytes → File → share/anchor).
 *   - copyLink  — internal viewer URL when we own the file, external URL
 *                 otherwise. Same logic as the image hook.
 *   - openNewTab
 *   - viewOriginal (when a parentFileId exists)
 *
 * Image-only actions (download-as <format>, resize-and-download, copyImage,
 * print) are intentionally OMITTED — they're raster-specific.
 *
 * Share is NOT a callback here — it's a popover surface; the renderer wraps
 * the Share button in the canonical `ImageSharePopover` (which is media-
 * kind-agnostic for matrx files), so there's exactly one share path.
 */

"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { saveImageFile } from "../image/utils/save-image-file";
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
    if (!currentSrc) return;
    window.open(currentSrc, "_blank", "noopener,noreferrer");
  }, [currentSrc]);

  const copyLink = useCallback(async () => {
    // Internal viewer URL when we own the file (permanent + auth-gated),
    // external URL otherwise.
    const viewerUrl =
      block.origin === "matrx" ? `/files/f/${block.fileId}` : null;
    const linkToCopy = viewerUrl
      ? `${window.location.origin}${viewerUrl}`
      : ((block.origin === "external" ? block.externalUrl : currentSrc) ?? "");
    if (!linkToCopy) {
      toast.error("No link to copy");
      return;
    }
    try {
      await navigator.clipboard.writeText(linkToCopy);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
    }
  }, [block, currentSrc]);

  // downloadUrl only exists on matrx-origin blocks. External blocks fall
  // through to the currently-rendered src.
  const matrxDownloadUrl = block.origin === "matrx" ? block.downloadUrl : null;

  const download = useCallback(async () => {
    if (isDownloading) return;
    const url = matrxDownloadUrl ?? currentSrc;
    if (!url) {
      toast.error("No download URL available");
      return;
    }
    setIsDownloading(true);
    try {
      await saveImageFile({
        url,
        filename: downloadName,
        mimeType: block.mimeType ?? null,
        title: block.fileName ?? downloadName,
      });
    } catch {
      toast.error("Could not save video");
    } finally {
      setIsDownloading(false);
    }
  }, [
    isDownloading,
    matrxDownloadUrl,
    currentSrc,
    downloadName,
    block.mimeType,
    block.fileName,
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
