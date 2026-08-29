"use client";

/**
 * CloudLibrarySheet — APP-SIDE (stays behind when the chrome is mirrored
 * into `@ai-matrx/capture`; the package only knows `onOpenLibrary`).
 *
 * The recents-thumb destination: where the iPhone opens the camera roll, we
 * open the user's CLOUD media in a full-screen tiled gallery — dark chrome
 * to match the camera, square tiles, newest first. Data comes from the ONE
 * cloud-files layer (`selectAllFilesArray` + `loadUserFileTree`), thumbnails
 * from the canonical `MediaThumbnail`, and every tile OPENS the real file
 * route (no dead ends).
 */

import React, { useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageOff, Loader2, Play, X } from "lucide-react";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  selectAllFilesArray,
  selectTreeStatus,
} from "@/features/files/redux/selectors";
import { loadUserFileTree } from "@/features/files/redux/thunks";
import { isImageMime, resolveMime } from "@/features/files/utils/file-types";
import { MediaThumbnail } from "@/features/files/components/core/MediaThumbnail/MediaThumbnail";
import type { CloudFileRecord } from "@/features/files/types";

export interface CloudLibrarySheetProps {
  open: boolean;
  onClose: () => void;
}

function isVideoMime(mime: string): boolean {
  return mime.startsWith("video/");
}

export function CloudLibrarySheet({ open, onClose }: CloudLibrarySheetProps) {
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

  const media = useMemo(() => {
    if (!open) return [] as CloudFileRecord[];
    return files
      .filter((file) => {
        const mime = resolveMime(file.mimeType, file.fileName);
        return isImageMime(mime) || isVideoMime(mime);
      })
      .sort(
        (a, b) =>
          new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() -
          new Date(a.updatedAt ?? a.createdAt ?? 0).getTime(),
      );
  }, [open, files]);

  if (!open) return null;

  const loading = treeStatus === "loading" || treeStatus === "idle";

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-black">
      <div className="flex shrink-0 items-center justify-between bg-black/80 px-4 pt-safe">
        <h2 className="py-4 text-[17px] font-semibold text-white">Library</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close library"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-safe">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-white/60" />
          </div>
        ) : media.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-white/60">
            <ImageOff className="h-8 w-8" />
            <p className="text-sm">No photos or videos in your cloud yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-0.5 sm:grid-cols-5 md:grid-cols-7">
            {media.map((file) => {
              const video = isVideoMime(resolveMime(file.mimeType, file.fileName));
              return (
                <button
                  key={file.id}
                  type="button"
                  onClick={() =>
                    startTransition(() => router.push(`/files/f/${file.id}`))
                  }
                  aria-label={`Open ${file.fileName}`}
                  className="relative aspect-square overflow-hidden bg-white/5 transition-opacity active:opacity-70"
                >
                  <MediaThumbnail
                    file={file}
                    iconSize={28}
                    className="h-full w-full object-cover"
                  />
                  {video && (
                    <Play
                      className="absolute bottom-1.5 left-1.5 h-4 w-4 text-white drop-shadow"
                      fill="currentColor"
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
        {isPending && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          </div>
        )}
      </div>
    </div>
  );
}
