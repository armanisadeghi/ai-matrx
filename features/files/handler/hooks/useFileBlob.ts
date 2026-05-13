/**
 * features/files/handler/hooks/useFileBlob.ts
 *
 * Convenience: get a Blob suitable for in-JS work — PDF.js, hashing,
 * thumbnail generation, drag-drop wrapping. The handler routes through
 * the same-origin proxy when needed (signed S3 URLs are CORS-blocked
 * for `fetch()`).
 */

"use client";

import { useFileAs } from "./useFileAs";
import type { FileSource } from "../types";

export function useFileBlob(source: FileSource | null | undefined): Blob | null {
  const { result } = useFileAs(source, { kind: "blob" });
  return result;
}
