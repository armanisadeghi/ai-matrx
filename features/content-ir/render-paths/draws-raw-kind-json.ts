/**
 * THE ONE ANSWER to "would this frame draw a kind as the raw JSON card?" —
 * asked exactly the way BlockRenderer decides: the live-chat hop, the kind
 * route, then the pending gate (the first-key rule). Every guard that checks
 * frames calls THIS, so a guard can never be blind to a renderer change
 * (the old simulator flag looked only for a MISSING envelope and stayed green
 * while a one-line ```json flashcard_set showed raw for a whole stream,
 * 2026-09-30).
 */

import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { renderBlockToContentBlock } from "@/components/mardown-display/chat-markdown/render-block-to-content-block";
import {
  pendingStructuredEnvelope,
  settleBrokenKindRoute,
  withTerminalEnvelope,
} from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import { applyIrKindRoute } from "@/features/content-ir/react/kind-route";
import { hasKindKey } from "@/features/content-ir/surfaces/json-kind-signal";

/**
 * True when this frame would reach the reader as the raw JSON code card —
 * BlockRenderer's steps in its order: terminal envelope (settled frames), the
 * kind route, the broken-kind settle, then the pending gate. A new step in
 * BlockRenderer's decision belongs HERE too, or every frame guard goes blind.
 */
export function drawsRawJsonCard(block: RenderBlockPayload): boolean {
  if (!(block.content ?? "").trim()) return false;
  const settled = block.status !== "streaming";
  const routed = settleBrokenKindRoute(
    applyIrKindRoute(
      withTerminalEnvelope(renderBlockToContentBlock(block), !settled),
    ),
  );
  if (routed.type !== "code") return false;
  return pendingStructuredEnvelope(routed) === null;
}

/** The law's violation: a frame carrying a `__kind` key drawn as the raw card. */
export function drawsKindAsRawJson(block: RenderBlockPayload): boolean {
  return hasKindKey(block.content ?? "") && drawsRawJsonCard(block);
}
