/**
 * features/files/components/core/FileAcquisition/DropzoneAcquisitionActions.tsx
 *
 * The app-shaped acquisition sources (local folder, Google Drive, existing
 * files) wired for `@ai-matrx/media/react`'s `FileUploadDropzone` `actions`
 * slot. The package deliberately does not own these (C8) — the original
 * dropzone rendered `FileAcquisitionActions` inline; after the C20 swap the
 * host passes this component through the slot instead. Uploads route through
 * the injected MediaClient (`useMediaUpload`), i.e. the same handler
 * pipeline + dedup pre-flight as every other upload.
 */

"use client";

import { useMediaUpload } from "@ai-matrx/media/core";
import { FileAcquisitionActions } from "./FileAcquisitionActions";

export interface DropzoneAcquisitionActionsProps {
  /** Upload options forwarded to the MediaClient (folder, visibility…). */
  uploadOptions?: {
    visibility?: string;
    parentFolderId?: string | null;
    metadata?: Record<string, unknown>;
  };
  accept?: string;
  onError?: (message: string) => void;
  onChooseExisting?: () => void;
  enableLocalFolder?: boolean;
  enableGoogleDrive?: boolean;
}

export function DropzoneAcquisitionActions({
  uploadOptions,
  accept,
  onError,
  onChooseExisting,
  enableLocalFolder = true,
  enableGoogleDrive = true,
}: DropzoneAcquisitionActionsProps) {
  const { uploadMany } = useMediaUpload();
  return (
    <FileAcquisitionActions
      presentation="inline"
      onFiles={async (files) => {
        try {
          const { failed } = await uploadMany(files, uploadOptions);
          if (failed.length && onError) {
            onError(failed.map((f) => `${f.name}: ${f.error}`).join("; "));
          }
        } catch (err) {
          onError?.(err instanceof Error ? err.message : String(err));
        }
      }}
      onError={onError}
      accept={accept}
      enableLocalFolder={enableLocalFolder}
      enableExistingFiles={Boolean(onChooseExisting)}
      onChooseExisting={onChooseExisting}
      enableGoogleDrive={enableGoogleDrive}
    />
  );
}
