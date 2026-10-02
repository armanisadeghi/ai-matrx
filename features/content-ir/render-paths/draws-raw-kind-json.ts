/**
 * THE ONE ANSWER to "would this frame draw a kind as raw JSON?" — asked by
 * calling the decision BlockRenderer itself makes (`decideBlockRender`), so a
 * guard can never be blind to a renderer change (the old simulator flag looked
 * only for a MISSING envelope and stayed green while a one-line ```json
 * flashcard_set showed raw for a whole stream, 2026-09-30).
 *
 * After the decision, the dispatch registry draws the block by its routed
 * type; the judge follows it (V5):
 *  - `code` with a JSON-family language (unlabelled included) → the raw JSON
 *    code card;
 *  - `code` with any other language → its language renderer (```markdown →
 *    MarkdownPreviewBlock, which renders markdown) or quoted source (```ts —
 *    the owner's ruling, 2026-09-30) — never a raw kind;
 *  - `text` → prose: raw when it still holds a kind region the pipeline should
 *    have lifted (`markdownCarriesKind`, the rule the leaf gate and the
 *    splitter share).
 */

import type { RenderBlockPayload } from "@ai-matrx/agents/generated/stream-events";
import { renderBlockToContentBlock } from "@/components/mardown-display/chat-markdown/render-block-to-content-block";
import { decideBlockRender } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import {
  hasKindKey,
  isJsonFenceLanguage,
  markdownCarriesKind,
} from "@/features/content-ir/surfaces/json-kind-signal";

export interface FrameJudgeOptions {
  /**
   * The MESSAGE's stream state, exactly as BlockRenderer receives it. Defaults
   * to the block's own status — pass it when the block settled while its
   * message is still streaming (the renderer gives that block no terminal
   * envelope).
   */
  isStreamActive?: boolean;
}

function decide(block: RenderBlockPayload, options: FrameJudgeOptions) {
  const isStreamActive = options.isStreamActive ?? block.status === "streaming";
  return decideBlockRender(renderBlockToContentBlock(block), { isStreamActive });
}

/**
 * True when this frame would reach the reader as the raw JSON code card
 * (kind or not): no loading gate, routed `code`, JSON-family language.
 */
export function drawsRawJsonCard(
  block: RenderBlockPayload,
  options: FrameJudgeOptions = {},
): boolean {
  if (!(block.content ?? "").trim()) return false;
  const { block: routed, gate } = decide(block, options);
  if (gate) return false;
  return routed.type === "code" && isJsonFenceLanguage(routed.language);
}

/** The law's violation: a frame that draws a kind as raw JSON — the code card or prose. */
export function drawsKindAsRawJson(
  block: RenderBlockPayload,
  options: FrameJudgeOptions = {},
): boolean {
  const content = block.content ?? "";
  if (!hasKindKey(content)) return false;
  const { block: routed, gate } = decide(block, options);
  if (gate) return false;
  if (routed.type === "text") return markdownCarriesKind(routed.content ?? "");
  return routed.type === "code" && isJsonFenceLanguage(routed.language);
}
