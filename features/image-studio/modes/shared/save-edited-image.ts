"use client";

import { fileHandler } from "@/features/files";
import type { SaveResult } from "./types";

/**
 * Persist an edited image (Blob from canvas / Filerobot / marker.js export)
 * to cld_files via the universal file handler and return the new file id
 * + persistent share URL. The handler guarantees `normalized.url` is
 * populated whenever `createShareLink: true` succeeds, so this consumer
 * never needs to assemble a share URL itself.
 */
export async function saveEditedImage(args: {
  blob: Blob;
  filename: string;
  folderPath: string;
  mime?: string;
  metadata?: Record<string, unknown>;
}): Promise<SaveResult> {
  const file = new File([args.blob], args.filename, {
    type: args.mime ?? args.blob.type ?? "image/png",
  });
  const normalized = await fileHandler.upload(
    { kind: "file", file },
    {
      folderPath: args.folderPath,
      visibility: "private",
      metadata: args.metadata,
      createShareLink: true,
      shareLinkPermissionLevel: "read",
    },
  );
  if (!normalized.fileId || !normalized.shareToken || !normalized.url) {
    throw new Error(
      "saveEditedImage: upload returned no fileId/shareToken/url",
    );
  }
  return {
    fileId: normalized.fileId,
    shareUrl: normalized.url,
    filename: file.name,
  };
}
