"use client";

// features/spaces/page/media.ts — icon and cover images: uploads go through our file handler and are
// stored as `{ fileId }` (never a signed URL); drawing resolves the id to a URL each time.

import { createContext, createElement, useContext, type ReactNode } from "react";

import { fileHandler } from "@/features/files/handler/handler";
import { useFile } from "@/features/files/handler/hooks/useFile";
import { toast } from "@/lib/toast";

import type { SpaceMedia } from "../contract";
import { GALLERY_PREFIX, galleryImage } from "./gallery";

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

/**
 * On a page published to the web the reader has no session, so an uploaded file cannot be resolved through the
 * file handler. `content.space_public_view` answers the CDN address of each public file the page names
 * (file id -> address); inside a public page this context holds that map and wins over the handler.
 */
const PublishedMediaContext = createContext<Readonly<Record<string, string>> | null>(null);

export function PublishedMediaProvider({ media, children }: { media: Readonly<Record<string, string>>; children: ReactNode }) {
  return createElement(PublishedMediaContext.Provider, { value: media }, children);
}

/** The URL to draw a media value with: a link as is, a bundled gallery picture by its key, an uploaded
 *  file through the file handler. A gallery gradient has no URL (the cover draws it as CSS). */
export function useSpaceMediaUrl(media: SpaceMedia | null | undefined): string | null {
  const fileId = media && "fileId" in media ? media.fileId : null;
  const published = useContext(PublishedMediaContext);
  // A public page never asks the file handler (it needs a session): the door's address, or nothing.
  const { file } = useFile(fileId && !published ? { kind: "file_id", fileId } : null);
  if (media && "url" in media) return media.url.startsWith(GALLERY_PREFIX) ? galleryImage(media.url) : media.url;
  if (published) return fileId ? (published[fileId] ?? null) : null;
  return file?.url ?? null;
}
