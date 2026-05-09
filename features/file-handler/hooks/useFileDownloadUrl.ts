/**
 * features/file-handler/hooks/useFileDownloadUrl.ts
 *
 * Convenience: get { url, filename } for an `<a href download>` element.
 */

"use client";

import { useFileAs } from "./useFileAs";
import type { FileSource } from "../types";

export interface FileDownload {
  url: string;
  filename: string;
}

export function useFileDownloadUrl(
  source: FileSource | null | undefined,
  suggestedName?: string,
): FileDownload | null {
  const { result } = useFileAs(source, {
    kind: "anchor_download",
    suggestedName,
  });
  return result;
}
