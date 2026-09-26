/**
 * THE FINAL PASS: when a stream completes, the screen must equal the one-shot
 * reading of the finished text — the same blocks a reload renders.
 *
 * Why this exists (chair ruling, 2026-09-26 — common-docs
 * projects/rich-content-unification/REGISTER.md, RC-B3 rulings): while a
 * message streams, "a settled block never changes" holds with ONE documented
 * exception — an orphan `</thinking>` / `</think>` / `</reasoning>` closer
 * that arrives late. Models do emit closer-only reasoning (the opener lost
 * upstream); the one-shot splitter then folds everything before the closer
 * into a thinking region (`metadata.continuation`), which no streaming reader
 * can know in advance. The live StreamBlockAccumulator strips such a closer
 * (and reports it) instead, so its final blocks differ from a reload's.
 *
 * So after completion, when the one-shot reading contains an orphan rescue,
 * the renderer shows the one-shot blocks. Only client-produced accumulator
 * blocks (`client_…`) are replaced: their reload path IS the one-shot split of
 * the stored text; server-produced blocks carry server envelopes and stay.
 */
import {
  splitContentIntoBlocksV2,
  type SplitterBlock,
} from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";

/** Cheap pre-check before splitting: no reasoning closer, no possible rescue. */
const REASONING_CLOSER = /<\/(?:thinking|think|reasoning)\s*>/i;

export interface SettleStreamInput {
  /** The stream is still arriving (never settled). */
  isStreamActive: boolean;
  /** Ids of the accumulator's render blocks for this message. */
  blockIds: readonly string[];
  /** The finished text. */
  content: string;
}

/**
 * The one-shot blocks to show instead of the accumulator's, or null when the
 * accumulator's final blocks already are the one-shot reading.
 */
export function settledOneShotBlocks({
  isStreamActive,
  blockIds,
  content,
}: SettleStreamInput): SplitterBlock[] | null {
  if (isStreamActive || blockIds.length === 0) return null;
  if (!blockIds.every((id) => id.startsWith("client_"))) return null;
  if (!REASONING_CLOSER.test(content)) return null;
  const oneShot = splitContentIntoBlocksV2(content);
  return oneShot.some((block) => block.metadata?.continuation === true)
    ? oneShot
    : null;
}

export interface SettledFromRecordInput {
  /** The stream is still arriving. */
  isStreamActive: boolean;
  /** The committed message this turn renders, when there is one. */
  messageId: string | null | undefined;
  /** How many display segments the committed record holds (0 = not in the store yet). */
  recordSegmentCount: number;
}

/**
 * THE FINAL SCREEN IS THE RELOAD. A turn whose stream has ended and whose
 * committed record is in the store renders from that record — the same parts,
 * split the same one-shot way, that a reload renders — never from the live
 * render blocks (server- or client-built), which are an incremental reading
 * of a text still arriving (verify-RC-B3 F1/F2). A turn with no committed
 * record yet keeps its live blocks (and the orphan-rescue pass above).
 */
export function renderSettledFromRecord({
  isStreamActive,
  messageId,
  recordSegmentCount,
}: SettledFromRecordInput): boolean {
  return !isStreamActive && !!messageId && recordSegmentCount > 0;
}
