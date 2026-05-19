"use client";

import { fileHandler } from "@/features/files";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { selectFileById } from "@/features/files/redux/selectors";
import type { RootState } from "@/lib/redux/store";
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
    const store = getStoreSingleton();
    if (store) {
      const existing = selectFileById(
        store.getState() as RootState,
        args.fileId,
      );
      if (existing?.filePath) {
        filePath = existing.filePath;
      }
    }
  }

  const normalized = await fileHandler.upload(
    { kind: "file", file },
    {
      ...(filePath ? { filePath } : { folderPath: args.folderPath }),
      visibility: "private",
      metadata: args.metadata,
      changeSummary: args.changeSummary,
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
