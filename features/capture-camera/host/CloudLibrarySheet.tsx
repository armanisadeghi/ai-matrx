"use client";

/**
 * CloudLibrarySheet — APP-SIDE data wiring for the PACKAGE sheet
 * (collapsed 2026-08-30 in the C22/C23 retrofit: the 206-line tiled-gallery
 * chrome moved into `@ai-matrx/capture/react`; capture 0.5.0).
 *
 * WHAT THIS FILE IS ALLOWED TO BE (C22): injection of values and identity
 * only — no chrome, no layout, no quirk branches. Kept here, each justified:
 *
 * - DATA: the ONE cloud-files layer (`selectAllFilesArray` +
 *   `loadUserFileTree`) mapped to `CaptureCloudLibraryItem[]`.
 * - THUMBNAILS: the canonical `MediaThumbnail` (authenticated resolution).
 * - NAVIGATION: every tile OPENS the real file route (`/files/f/[id]`) via
 *   the app router — no dead ends.
 *
 * The external props are unchanged, so consumers (intake v2/v3) did not move.
 */

import React, { useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  selectAllFilesArray,
  selectTreeStatus,
} from "@/features/files/redux/selectors";
import { loadUserFileTree } from "@/features/files/redux/thunks";
import { isImageMime, resolveMime } from "@/features/files/utils/file-types";
import { MediaThumbnail } from "@ai-matrx/media/react";
import type { CaptureCloudLibraryItem } from "@ai-matrx/capture";
import { CloudLibrarySheet as PackageCloudLibrarySheet } from "@ai-matrx/capture/react";

export interface CloudLibrarySheetProps {
  open: boolean;
  onClose: () => void;
  /** Pick files from the device — v3 hosts, where the library is the ONLY
   *  door to existing media (the package sheet documents the rule). */
  onUpload?: () => void;
}

function isVideoMime(mime: string): boolean {
  return mime.startsWith("video/");
}

export function CloudLibrarySheet({
  open,
  onClose,
  onUpload,
}: CloudLibrarySheetProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const files = useAppSelector(selectAllFilesArray);
  const treeStatus = useAppSelector(selectTreeStatus);
  const userId = useAppSelector(selectUserId);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open && treeStatus === "idle" && userId) {
      void dispatch(loadUserFileTree({ userId }));
    }
  }, [open, treeStatus, userId, dispatch]);

  const items = useMemo<CaptureCloudLibraryItem[]>(() => {
    if (!open) return [];
    return files
      .filter((file) => {
        const mime = resolveMime(file.mimeType, file.fileName);
        return isImageMime(mime) || isVideoMime(mime);
      })
      .sort(
        (a, b) =>
          new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() -
          new Date(a.updatedAt ?? a.createdAt ?? 0).getTime(),
      )
      .map((file) => ({
        id: file.id,
        fileName: file.fileName,
        kind: isVideoMime(resolveMime(file.mimeType, file.fileName))
          ? ("video" as const)
          : ("image" as const),
        thumbnail: (
          <MediaThumbnail
            mediaRef={{
              file_id: file.id,
              mime_type: file.mimeType ?? undefined,
            }}
            fileName={file.fileName}
            mimeType={file.mimeType}
            iconSize={28}
            className="h-full w-full object-cover"
          />
        ),
      }));
  }, [open, files]);

  return (
    <PackageCloudLibrarySheet
      open={open}
      onClose={onClose}
      items={items}
      loading={treeStatus === "loading" || treeStatus === "idle"}
      busy={isPending}
      onOpenItem={(id) => startTransition(() => router.push(`/files/f/${id}`))}
      onUpload={onUpload}
    />
  );
}
