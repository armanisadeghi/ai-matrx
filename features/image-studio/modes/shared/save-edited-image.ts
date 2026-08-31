"use client";

import { fileHandler } from "@/features/files/handler/handler";
import type { SaveResult } from "./types";

/**
 * Persist an edited image (Blob from canvas / Filerobot / marker.js export)
 * to cld_files via the universal file handler.
 *
 * Two modes:
 *   • `fileId` set → overwrite the existing file, creating a new version
 *     (looks up its `filePath` from Redux and reuses it; the Python backend
 *     treats matching-path uploads as version bumps).
 *   • `fileId` unset → fresh upload under `folderPath` (the "Save as
 *     duplicate" / first-save path).
 *
 * The handler guarantees `normalized.url` is populated whenever
 * `createShareLink: true` succeeds.
 */
export async function saveEditedImage(args: {
  blob: Blob;
  filename: string;
  folderPath: string;
  mime?: string;
  metadata?: Record<string, unknown>;
  /**
   * When set, save replaces the file at this id (creates a new version
   * pointing at the existing cld_files row). When omitted, a new file is
   * created under `folderPath`.
   */
  fileId?: string;
  /** Optional one-line summary attached to the new version row. */
  changeSummary?: string;
}): Promise<SaveResult> {
  const file = new File([args.blob], args.filename, {
    type: args.mime ?? args.blob.type ?? "image/png",
  });

  let filePath: string | undefined;
  if (args.fileId) {
    // Resolve by durable identity instead of reading Redux directly. A newly
    // generated image can be opened before the global file-tree hydration has
    // reached the slice; the handler hydrates that one id from the API when
    // needed. Falling back to folderPath here would silently create a sibling
    // while the UI claims it saved a new version.
    const existing = await fileHandler.resolve({
      kind: "file_id",
      fileId: args.fileId,
    });
    if (!existing.filePath) {
      throw new Error(
        `saveEditedImage: could not resolve the existing path for ${args.fileId}`,
      );
    }
    filePath = existing.filePath;
  }

  const normalized = await fileHandler.upload(
    { kind: "file", file },
    {
      ...(filePath ? { filePath } : { folderPath: args.folderPath }),
      visibility: "personal",
      metadata: args.metadata,
      changeSummary: args.changeSummary,
      createShareLink: true,
      shareLinkPermissionLevel: "viewer",
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
