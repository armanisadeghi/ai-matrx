/**
 * features/masterwork/components/detail/fileSourceSizeLabel.ts
 *
 * `common-docs/projects/acquisition-frontier/own-files/VERIFICATION.md` §12
 * (2026-09-18): "A zero-byte file's Resources card renders identically to a
 * real-content card — filename + bare 'Files' subtitle, no size, no
 * '(empty)' or equivalent label. A person cannot tell, from the screen,
 * that their blank test upload landed as zero bytes rather than silently
 * failing or misreading."
 *
 * Pure formatter so the card's honesty is unit-testable without a DOM or a
 * live Supabase read: given what `readFileSizesByIds`
 * (`features/files/filesDb.ts`) came back with for a source's file id,
 * produce the subtitle text the Resources card renders in place of the bare
 * "Files" label. `null`/`undefined` means the size hasn't loaded (or the row
 * genuinely has none) — the caller falls back to the existing plain label
 * rather than claiming a size we don't have.
 */

import { formatFileSize } from "@ai-matrx/kit/format";

/** Reused verbatim — the app's own vocabulary for "we looked, there is
 * nothing here" (`DumpOutcomes`/`RunStages` say the same about a source that
 * yielded no rules; this says it about the source itself, before any run). */
export const EMPTY_FILE_SIZE_LABEL = "Empty — 0 B, nothing to read";

export function fileSourceSizeLabel(
  sizeBytes: number | null | undefined,
): string | null {
  if (sizeBytes == null) return null;
  if (sizeBytes === 0) return EMPTY_FILE_SIZE_LABEL;
  return formatFileSize(sizeBytes);
}
