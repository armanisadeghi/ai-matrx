/**
 * features/files/hooks/useGuardedFileUpload.ts
 *
 * Multi-file upload with the duplicate-detection guard dialog. Routes
 * through the app-level `<UploadGuardHost/>` so every user-driven
 * upload gets the duplicate-detection pre-flight + resolution dialog.
 *
 * Distinct from `useFileUpload` in `features/file-handler/hooks/` —
 * that's the universal single-file primitive. Use this hook when:
 *   - The user picks multiple files at once
 *   - You want the duplicate-detection dialog UX
 *
 * Use the handler's `useFileUpload` for everything else (single-file
 * paste, drag-drop into a chat input, programmatic uploads).
 */

"use client";

import { useCallback } from "react";
import { requestUpload } from "@/features/files/upload/UploadGuardHost";
import type { UploadFilesArg } from "@/features/files/types";

export interface UseGuardedFileUploadResult {
  upload: (
    files: File[],
    options?: Omit<UploadFilesArg, "files">,
  ) => Promise<{
    uploaded: string[];
    /** Per-file failure with the real backend error, not just the filename. */
    failed: Array<{ name: string; error: string }>;
    /** True when the user dismissed the duplicate-upload dialog. */
    cancelled: boolean;
  }>;
}

export function useGuardedFileUpload(
  defaults: Partial<Omit<UploadFilesArg, "files">> = {},
): UseGuardedFileUploadResult {
  const upload = useCallback(
    async (
      files: File[],
      options: Omit<UploadFilesArg, "files"> = {} as Omit<UploadFilesArg, "files">,
    ) => {
      const arg: UploadFilesArg = {
        files,
        parentFolderId: options.parentFolderId ?? defaults.parentFolderId ?? null,
        visibility: options.visibility ?? defaults.visibility ?? "private",
        shareWith: options.shareWith ?? defaults.shareWith,
        shareLevel: options.shareLevel ?? defaults.shareLevel,
        changeSummary: options.changeSummary ?? defaults.changeSummary,
        metadata: options.metadata ?? defaults.metadata,
        concurrency: options.concurrency ?? defaults.concurrency,
      };
      return requestUpload(arg);
    },
    [defaults],
  );

  return { upload };
}
