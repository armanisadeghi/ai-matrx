"use client";

/**
 * useDownloadBlob — THE blob-download primitive for PDF surfaces.
 *
 * Replaces three drifted copies of the createObjectURL → <a>.click() →
 * revoke dance (ManipulationPanel, DocumentOpsPanel, MaskDialog). Keeps
 * the strongest variant's guarantees (PdfBinaryResult's): object URLs are
 * tracked and revoked on unmount too, so a cancelled/never-clicked
 * download can't leak a multi-MB blob for the life of the session.
 */

import { downloadFile } from "@ai-matrx/kit/download";

export interface DownloadableBlob {
  blob: Blob;
  filename: string;
}

export function useDownloadBlob(): (item: DownloadableBlob) => void {
  return ({ blob, filename }: DownloadableBlob) => downloadFile(filename, blob, blob.type);
}
