"use client";

import { ImageOff } from "lucide-react";
import { MediaThumbnail } from "@ai-matrx/media/react";
import type { CloudFileRecord } from "@/features/files/types";

type ThumbnailFile = Pick<
  CloudFileRecord,
  "id" | "fileName" | "mimeType" | "fileSize"
>;

export interface CloudImageThumbnailProps {
  file: ThumbnailFile;
  iconSize: number;
  className?: string;
}

/**
 * A zero-byte row is valid file metadata, but it has no renderable media.
 * Keep that state terminal and visible instead of asking the media resolver to
 * create an object URL that an image element can only reject.
 */
export function isCloudImagePreviewable(file: ThumbnailFile): boolean {
  return file.fileSize !== 0;
}

export function CloudImageThumbnail({
  file,
  iconSize,
  className,
}: CloudImageThumbnailProps) {
  if (!isCloudImagePreviewable(file)) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center bg-muted/40 text-muted-foreground ${className ?? ""}`}
        role="img"
        aria-label={`${file.fileName} is empty and cannot be previewed`}
      >
        <ImageOff aria-hidden="true" style={{ width: iconSize, height: iconSize }} />
      </div>
    );
  }

  return (
    <MediaThumbnail
      mediaRef={{
        file_id: file.id,
        mime_type: file.mimeType ?? undefined,
      }}
      fileName={file.fileName}
      mimeType={file.mimeType}
      iconSize={iconSize}
      className={className}
    />
  );
}
