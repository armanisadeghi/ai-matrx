/**
 * features/media-capture/upload/capture-uploader.ts
 *
 * The ONE cloud boundary for captured media (plan §5 invariant 7): bytes go
 * through `fileHandler.upload` only — no capture-specific storage, no
 * `/api/camera/*` routes. Folder paths come from `CloudFolders.CAPTURES_*`
 * (never hand-rolled); visibility follows the folder-conventions rule
 * (Captures are private).
 *
 * `metadata.capture` is validated with `isCaptureMetadata` BEFORE any bytes
 * leave — a payload carrying a deviceId/groupId/label or a malformed variant
 * throws loudly here rather than persisting a contract violation.
 */

import {
  fileHandler,
  CloudFolders,
  resolveDefaultVisibility,
  type NormalizedFile,
} from "@/features/files";
import {
  isCaptureMetadata,
  type CaptureMetadata,
} from "@/features/media-capture/core/capture-types";
import { recordCaptureFailure } from "@/features/media-capture/runtime/mediaCaptureDiagnostics";

/** Canonical folder for each captured artifact kind. */
export function captureFolderFor(
  artifactKind: CaptureMetadata["artifact_kind"],
): string {
  switch (artifactKind) {
    case "photo":
      return CloudFolders.CAPTURES_PHOTOS;
    case "video":
      return CloudFolders.CAPTURES_VIDEOS;
    case "audio":
      return CloudFolders.CAPTURES_AUDIO;
  }
}

export interface UploadCaptureArgs {
  file: File;
  capture: CaptureMetadata;
  onProgress?: (loaded: number, total: number) => void;
}

/**
 * Upload one captured artifact. Returns the hydrated NormalizedFile — persist
 * `fileId`, never a URL (renders go through `<InlineMediaRef>`).
 */
export async function uploadCapture(
  args: UploadCaptureArgs,
): Promise<NormalizedFile> {
  if (!isCaptureMetadata(args.capture)) {
    // Loud by design: an invalid payload here means a builder or caller bug
    // (unknown keys, camelCase drift, or a hardware identifier leaked in).
    throw new Error(
      "[capture-uploader] metadata.capture failed isCaptureMetadata validation — " +
        "refusing to upload. Fix the builder/caller; never persist an invalid " +
        `capture payload. Got: ${JSON.stringify(args.capture)}`,
    );
  }

  const folderPath = captureFolderFor(args.capture.artifact_kind);
  try {
    const uploaded = await fileHandler.upload(
      { kind: "file", file: args.file },
      {
        folderPath,
        visibility: resolveDefaultVisibility(folderPath),
        fileName: args.file.name,
        metadata: { capture: args.capture },
        ...(args.onProgress ? { onProgress: args.onProgress } : {}),
      },
    );

    if (!uploaded.fileId) {
      throw new Error(
        "[capture-uploader] upload resolved without a fileId — the capture is " +
          "not durably addressable. Treat as an upload failure.",
      );
    }
    return uploaded;
  } catch (err) {
    // Terminal upload failure → diagnostics ring, WITH the retry payload so
    // /camera and the Media window can re-invoke this uploader. The error
    // still propagates — recording it never swallows it.
    recordCaptureFailure({
      scope: "upload",
      message:
        err instanceof Error
          ? err.message
          : `Upload of "${args.file.name}" failed.`,
      retry: { file: args.file, capture: args.capture },
    });
    throw err;
  }
}
