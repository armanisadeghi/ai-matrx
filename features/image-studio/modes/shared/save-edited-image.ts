"use client";

import { fileHandler } from "@/features/file-handler/handler";
import { pythonShareUrl } from "@/features/file-handler/utils/python-base";
import type { SaveResult } from "./types";

/**
 * Persist an edited image (Blob from canvas / Filerobot / marker.js export)
 * to cld_files via the universal file handler and return the new file id
 * + persistent share URL.
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
  if (!normalized.fileId || !normalized.shareToken) {
    throw new Error("saveEditedImage: upload returned no fileId/shareToken");
  }
  const shareUrl = normalized.url ?? pythonShareUrl(normalized.shareToken);
  return {
    fileId: normalized.fileId,
    shareUrl,
    filename: file.name,
  };
}
