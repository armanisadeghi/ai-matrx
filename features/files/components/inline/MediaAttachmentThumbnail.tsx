"use client";

import { motion } from "motion/react";
import { AlertCircle, Image as ImageIcon, Loader2, X } from "lucide-react";
import { InlineMediaRef } from "@ai-matrx/media/react";
import type { MediaRef } from "@/features/files/types";

const FILE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isOwnedFileReference(ref: MediaRef | string | null | undefined) {
  if (!ref) return false;
  if (typeof ref === "string") return FILE_ID_PATTERN.test(ref);
  return typeof ref.file_id === "string" && ref.file_id.length > 0;
}

export type MediaAttachmentStatus = "pending" | "ready" | "error";

export interface MediaAttachmentThumbnailProps {
  mediaRef?: MediaRef | string | null;
  status: MediaAttachmentStatus;
  title: string;
  onOpen: () => void;
  onRemove: () => void;
  openLabel?: string;
  removeLabel?: string;
  readyIcon?: React.ReactNode;
  errorMessage?: string;
}

/**
 * Canonical compact attachment tile for an interactive image reference.
 * Prefer a file ID in `mediaRef`; InlineMediaRef owns every URL decision.
 */
export function MediaAttachmentThumbnail({
  mediaRef,
  status,
  title,
  onOpen,
  onRemove,
  openLabel = `View image: ${title}`,
  removeLabel = `Remove ${title}`,
  readyIcon = <ImageIcon className="h-4 w-4 text-white drop-shadow" />,
  errorMessage,
}: MediaAttachmentThumbnailProps) {
  const isPending = status === "pending";
  const isError = status === "error";
  const useAuthenticatedBytes = isOwnedFileReference(mediaRef);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      title={isError ? errorMessage : undefined}
      className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border bg-muted"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={openLabel}
        className="flex h-full w-full items-center justify-center"
      >
        {mediaRef ? (
          <>
            <InlineMediaRef
              ref={mediaRef}
              size="fill"
              fit="cover"
              rounded="none"
              fallback="skeleton"
              errorFallback="icon"
              alt={title}
              // An owned file ID must render from the bearer-authenticated
              // blob cache. Depending on the file-session cookie here made
              // the local upload preview disappear at the ready handoff.
              crossOrigin={useAuthenticatedBytes ? "anonymous" : undefined}
              className="transition-[filter] group-hover:brightness-90"
            />
            {isPending ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <Loader2 className="h-5 w-5 animate-spin text-white drop-shadow" />
              </div>
            ) : isError ? (
              <div className="absolute inset-0 flex items-center justify-center bg-destructive/30">
                <AlertCircle className="h-5 w-5 text-white drop-shadow" />
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
                {readyIcon}
              </div>
            )}
          </>
        ) : isPending ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : isError ? (
          <AlertCircle className="h-4 w-4 text-destructive" />
        ) : (
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
        )}
      </button>

      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onRemove();
        }}
        aria-label={removeLabel}
        className="absolute right-0 top-0 z-10 rounded-bl-md bg-black/60 p-0.5 text-white opacity-0 transition-opacity hover:bg-destructive focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </motion.div>
  );
}
