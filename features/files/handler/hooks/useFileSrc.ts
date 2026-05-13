/**
 * features/files/handler/hooks/useFileSrc.ts
 *
 * Convenience: get a URL string suitable for `<img src>`, `<video src>`,
 * `<audio src>`. The handler picks the right URL automatically — public
 * CDN if available, share link if not, signed URL with auto-refresh
 * otherwise. Components never need to know which lane the file took.
 */

"use client";

import { useFileAs } from "./useFileAs";
import type { FileSource } from "../types";

export function useFileSrc(source: FileSource | null | undefined): string | null {
  const { result } = useFileAs(source, { kind: "html_src" });
  return result;
}
