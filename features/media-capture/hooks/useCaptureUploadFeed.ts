"use client";

/**
 * features/media-capture/hooks/useCaptureUploadFeed.ts
 *
 * The tiny client host that keeps the framework-free
 * `mediaCaptureDiagnostics` registry fed with capture upload/transport state
 * from the cloudFiles Redux slice (the registry must not import the store).
 * Mount it on every surface that DISPLAYS diagnostics (Camera control tab,
 * /camera library, /camera/admin diagnostics) — feeding is idempotent and
 * shallow-equal-guarded, so multiple mounts are free.
 *
 * "Capture uploads" = tracked uploads whose destination folder is under
 * `Captures/` (resolved against the loaded cloud-files tree). Before the tree
 * loads, nothing is fed — honest absence, never a guess.
 */

import { useEffect, useMemo } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  CloudFolders,
  selectAllFoldersArray,
  selectVisibleUploads,
} from "@/features/files";
import {
  feedUploadState,
  type CaptureUploadFeedEntry,
} from "@/features/media-capture/runtime/mediaCaptureDiagnostics";

export function useCaptureUploadFeed(): CaptureUploadFeedEntry[] {
  const folders = useAppSelector(selectAllFoldersArray);
  const uploads = useAppSelector(selectVisibleUploads);

  const captureFolderIds = useMemo(() => {
    const ids = new Set<string>();
    for (const f of folders) {
      if (
        f.folderPath === CloudFolders.CAPTURES ||
        f.folderPath.startsWith(`${CloudFolders.CAPTURES}/`)
      ) {
        ids.add(f.id);
      }
    }
    return ids;
  }, [folders]);

  const entries = useMemo<CaptureUploadFeedEntry[]>(
    () =>
      uploads
        .filter(
          (u) =>
            u.parentFolderId !== null && captureFolderIds.has(u.parentFolderId),
        )
        .map((u) => ({
          requestId: u.requestId,
          fileName: u.fileName,
          fileSize: u.fileSize,
          status: u.status,
          bytesUploaded: u.bytesUploaded,
          error: u.error,
          fileId: u.fileId,
        })),
    [uploads, captureFolderIds],
  );

  useEffect(() => {
    feedUploadState(entries);
  }, [entries]);

  return entries;
}
