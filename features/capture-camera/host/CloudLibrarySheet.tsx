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

import React, { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageOff, Loader2, Play, Upload, X } from "lucide-react";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  selectAllFilesArray,
  selectTreeStatus,
} from "@/features/files/redux/selectors";
import { loadUserFileTree } from "@/features/files/redux/thunks";
import { isImageMime, resolveMime } from "@/features/files/utils/file-types";
import { MediaThumbnail } from "@ai-matrx/media/react";
import type { CloudFileRecord } from "@/features/files/types";

export interface CloudLibrarySheetProps {
  open: boolean;
  onClose: () => void;
  /**
   * Pick files from the device. Supplied by v3 hosts, where this drawer is the
   * ONLY door to existing media (Arman, 2026-08-30: "we don't need both upload
   * and cloud because we can modify the drawer that has the cloud images to
   * just show an option for uploading").
   *
   * Two controls that both mean "media I already have" is a choice the user
   * should never have been asked to make: whether a file happens to be in the
   * cloud yet is our bookkeeping, not their mental model. Omitted by v2 hosts,
   * which still carry a separate UPLOAD lane in the mode row.
   */
  onUpload?: () => void;
}

function isVideoMime(mime: string): boolean {
  return mime.startsWith("video/");
}

/** Tiles rendered per page — a whole cloud tree at once meant thousands of
 *  mounted thumbnails and as many fetches. */
const PAGE_SIZE = 60;

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
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Reopening starts back at the first page (fresh scroll position too).
  useEffect(() => {
    if (open) setVisibleCount(PAGE_SIZE);
  }, [open]);

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
        <h2 className="py-4 text-[17px] font-semibold text-white">Your media</h2>
        <div className="flex items-center gap-2">
          {onUpload ? (
            <button
              type="button"
              onClick={() => {
                // Close first: the picker is a system sheet, and leaving the
                // library mounted behind it means the user lands back in a
                // gallery that has not yet heard about their new file.
                onClose();
                onUpload();
              }}
              className="flex h-10 touch-manipulation items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-white/20"
            >
              <Upload className="h-4 w-4" />
              Upload
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close library"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
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
            {/* An empty gallery whose only affordance is "close" is a dead end
                — the one thing a user can do from here is add something. */}
            {onUpload ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onUpload();
                }}
                className="flex h-11 touch-manipulation items-center gap-2 rounded-full bg-white/10 px-5 text-sm font-medium text-white transition-colors hover:bg-white/20"
              >
                <Upload className="h-4 w-4" />
                Upload from this device
              </button>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-0.5 sm:grid-cols-5 md:grid-cols-7">
            {media.slice(0, visibleCount).map((file) => {
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
                    mediaRef={{ file_id: file.id, mime_type: file.mimeType ?? undefined }}
                    fileName={file.fileName}
                    mimeType={file.mimeType}
                    thumbnailUrl={file.thumbnailUrl}
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
        {!loading && media.length > visibleCount && (
          <div className="flex justify-center py-4">
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              className="h-11 touch-manipulation rounded-full bg-white/10 px-6 text-sm font-medium text-white"
            >
              Show more ({media.length - visibleCount} left)
            </button>
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
