// features/files/handler/resumableUploads.ts
//
// THE SANCTIONED READ-ONLY VIEW OF PENDING RESUMABLE UPLOADS.
//
// `features/files/upload/**` is internal (eslint `no-restricted-imports`): the
// ONE public door is `useFileUpload`. But a surface that accepts multi-gigabyte
// files has a second, legitimate need the hook does not cover — SHOWING that an
// interrupted TUS session is still on this device, so a person whose laptop
// slept is told their bytes are safe instead of watching a bar restart at zero.
// Without a door for that, every such surface reaches into the internals
// directly (which is how `features/media-capture`'s two diagnostics components
// came to carry that lint error). This is the door.
//
// Read-only on purpose: resuming still happens inside `tusUploadRaw` through
// its UrlStorage when the same file is offered again. Nothing here can start,
// stop or delete an upload.

import {
  listStoredTusUploads,
  type StoredTusUploadSummary,
} from "@/features/files/upload/tusUpload";
import { TUS_TRANSPORT_THRESHOLD_BYTES } from "@/features/files/upload/cloudUpload";

/** One interrupted upload still held on this device. */
export type ResumableUpload = StoredTusUploadSummary;

/**
 * Bytes at or above which an upload takes the resumable transport. A surface
 * uses it to tell the truth BEFORE the upload starts ("if this is interrupted
 * it will continue"), never to route — routing is `cloudUpload`'s alone.
 */
export const RESUMABLE_UPLOAD_THRESHOLD_BYTES = TUS_TRANSPORT_THRESHOLD_BYTES;

/**
 * Every stored TUS resume session on this device. Returns [] where IndexedDB
 * is unavailable and never throws — a diagnostics read must not break a page.
 */
export function listResumableUploads(): Promise<ResumableUpload[]> {
  return listStoredTusUploads();
}
