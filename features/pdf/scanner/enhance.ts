/**
 * Enhance modes for scan items — thin composition over the platform
 * image-ops registry (the canonical `POST /images/edit` client in
 * features/image-studio/api/python.ts; catalog: GET /images/ops).
 *
 * Every mode produces a NON-DESTRUCTIVE derivative cld file (originals
 * never mutated); the scanner swaps the item's save-time file id to the
 * derivative. Ops load with exif_transpose and color ops preserve
 * dimensions, so existing quads remain valid on the derivative.
 */

import { applyEdit, type EditOutput } from "@/features/image-studio/api/python";

import type { ScanEnhanceMode } from "./types";

/** Matches the scanner's capture/build quality (JPEG q92). */
const OUTPUT: EditOutput = { format: "jpeg", quality: 92 };

/** Document-friendly B&W: grayscale, then a hard levels contrast push. */
const BW_LEVELS = { in_black: 100, in_white: 180 };

export interface EnhanceResult {
  fileId: string;
  /** Display URL for immediate feedback. May be signed — session-local only, never persist. */
  previewUrl: string | null;
}

export async function applyEnhance(
  sourceFileId: string,
  mode: ScanEnhanceMode,
): Promise<EnhanceResult> {
  if (mode === "auto") {
    const r = await applyEdit({
      source_id: sourceFileId,
      op: "auto_levels",
      output: OUTPUT,
    });
    return { fileId: r.file_id, previewUrl: r.primary_url };
  }
  const gray = await applyEdit({
    source_id: sourceFileId,
    op: "grayscale",
    output: OUTPUT,
  });
  if (mode === "grayscale") {
    return { fileId: gray.file_id, previewUrl: gray.primary_url };
  }
  const bw = await applyEdit({
    source_id: gray.file_id,
    op: "levels",
    params: BW_LEVELS,
    output: OUTPUT,
  });
  return { fileId: bw.file_id, previewUrl: bw.primary_url };
}

export const ENHANCE_LABELS: Record<ScanEnhanceMode, string> = {
  auto: "Auto",
  grayscale: "Grayscale",
  bw: "B&W",
};
