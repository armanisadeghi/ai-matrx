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

import { useEffect, useRef } from "react";

export interface DownloadableBlob {
  blob: Blob;
  filename: string;
}

export function useDownloadBlob(): (item: DownloadableBlob) => void {
  const urlsRef = useRef<string[]>([]);

  useEffect(() => {
    const urls = urlsRef.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.length = 0;
    };
  }, []);

  return ({ blob, filename }: DownloadableBlob) => {
    const url = URL.createObjectURL(blob);
    urlsRef.current.push(url);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Give the browser a beat to start the download before revoking.
    setTimeout(() => {
      URL.revokeObjectURL(url);
      urlsRef.current = urlsRef.current.filter((u) => u !== url);
    }, 10_000);
  };
}
