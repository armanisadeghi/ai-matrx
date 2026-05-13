/**
 * features/files/handler/hooks/useFileMediaBlock.ts
 *
 * Convenience: get an AI-API-ready media block (`ImageBlock`, `AudioBlock`,
 * `VideoBlock`, `DocumentBlock`, `YouTubeVideoBlock`) for a source. This
 * is what conversation/agent input components feed into the request
 * assembler.
 */

"use client";

import { useFileAs } from "./useFileAs";
import type { FileSource, MediaBlock } from "../types";

export function useFileMediaBlock(
  source: FileSource | null | undefined,
): MediaBlock | null {
  const { result } = useFileAs(source, { kind: "media_block" });
  return result;
}
