"use client";

// features/spaces/page/media.ts — icon and cover images: uploads go through our file handler and are
// stored as `{ fileId }` (never a signed URL); drawing resolves the id to a URL each time.

import { fileHandler } from "@/features/files/handler/handler";
import { useFile } from "@/features/files/handler/hooks/useFile";
import { toast } from "@/lib/toast";

import type { SpaceMedia } from "../contract";

/** Upload one image; null (and a toast) when it fails. */
export async function uploadSpaceImage(file: File): Promise<{ fileId: string } | null> {
  try {
    const uploaded = await fileHandler.upload({ kind: "file", file });
    return { fileId: uploaded.fileId };
  } catch (err) {
    toast.error(err instanceof Error ? `Upload failed: ${err.message}` : "Upload failed");
    return null;
  }
}

/** The URL to draw a media value with: a link as is, an uploaded file through the file handler. */
export function useSpaceMediaUrl(media: SpaceMedia | null | undefined): string | null {
  const fileId = media && "fileId" in media ? media.fileId : null;
  const { file } = useFile(fileId ? { kind: "file_id", fileId } : null);
  if (media && "url" in media) return media.url;
  return file?.url ?? null;
}
