/**
 * assembleMessageParts
 *
 * Converts a completed ActiveRequest into CxContentBlock[] — the canonical
 * format stored in cx_message.content[] in the database.
 *
 * This is the inverse of normalizeContentBlocks (DB → RenderBlockPayload[]).
 * Call this once at the end of a stream, right before the final
 * `updateMessageRecord` lands for the assistant message, while the
 * ActiveRequest data is still in Redux.
 *
 * Ordering is driven by the timeline so reasoning → tool calls → text blocks
 * appear in the exact sequence the model produced them, not in insertion order.
 *
 * Block mapping:
 *   timeline "reasoning_start/end" → CxThinkingContent (from accumulatedReasoning slices)
 *   timeline "tool_event" started  → CxToolCallContent (from toolLifecycle)
 *   timeline "tool_event" completed → CxToolResultContent (from toolLifecycle)
 *   timeline "text_start/end"      → CxTextContent (from renderBlocks in that range)
 *   renderBlocks with type "media" / audio_output / image_output / video_output
 *                                  → CxMediaContent (if not covered by timeline)
 *
 * content-ir Phase 5 — reload without re-parse: every source render block
 * whose `metadata.__ir` carries a COMPLETE CanonicalBlockIR (FE-parsed or
 * server-built "py-block-detector" — engine-agnostic on purpose) gets that
 * envelope stamped onto the emitted text part as an `IrEnvelopeCache`
 * (`metadata.__ir = { v: 1, blocks: { [fingerprint]: envelope } }`). On
 * reload, the read boundaries seed the cache into the region-envelope memo
 * and the splitter reuses the envelope by reference instead of parsing.
 */

import type { ActiveRequest } from "@/features/agents/types/request.types";
import type {
  CxContentBlock,
  CxTextContent,
  CxThinkingContent,
  CxToolCallContent,
  CxToolResultContent,
  CxMediaContent,
} from "@/features/public-chat/types/cx-tables";
import type {
  TimelineEntry,
  TimelineTextEnd,
  TimelineReasoningEnd,
  TimelineToolEvent,
  TimelineRenderBlock,
} from "@/features/agents/types/request.types";
import { toCxMediaPart } from "@/features/files/blocks/image/adapters/to-cx-media-part";
import { isUnifiedImageBlock } from "@/features/files/blocks/image/guards";
import { SPECIAL_CODE_LANGUAGES } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { IR_ENVELOPE_KEY, type CanonicalBlockIR } from "@/features/content-ir/core/ir-types";
import type { NormalizedCitation } from "@/features/agents/redux/execution-system/messages/message-citations";
import { envelopeCacheFromEnvelopes } from "@/features/content-ir/core/envelope-cache";
import { readEnvelope } from "@/features/content-ir/redux/render-block-envelope";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isReasoningEnd(e: TimelineEntry): e is TimelineReasoningEnd {
  return e.kind === "reasoning_end";
}

function isTextEnd(e: TimelineEntry): e is TimelineTextEnd {
  return e.kind === "text_end";
}

function isToolEvent(e: TimelineEntry): e is TimelineToolEvent {
  return e.kind === "tool_event";
}

function isRenderBlock(e: TimelineEntry): e is TimelineRenderBlock {
  return e.kind === "render_block";
}

const MEDIA_BLOCK_TYPES = new Set([
  "media",
  "audio_output",
  "image_output",
  "video_output",
  "file_output",
]);

function renderBlockTypeToMediaKind(
  type: string,
): "image" | "audio" | "video" | "document" {
  if (type === "image_output") return "image";
  if (type === "audio_output") return "audio";
  if (type === "video_output") return "video";
  return "document";
}

/**
 * The reusable envelope a source render block contributes to the emitted
 * part's reload cache: a COMPLETE `metadata.__ir` CanonicalBlockIR —
 * engine-agnostic (FE kind parser and server "py-block-detector" envelopes
 * are treated identically). Streaming/error envelopes return null; they can
 * never be reused on reload.
 */
function completeEnvelopeOf(block: {
  metadata?: Record<string, unknown> | null;
}): CanonicalBlockIR | null {
  const envelope = readEnvelope(block.metadata ?? undefined);
  return envelope && envelope.root.status === "complete" ? envelope : null;
}

/**
 * Wraps a non-text render block's content back into the markdown shape it
 * was streamed in, so the committed `CxTextContent.text` parses into the
 * same typed block on reload.
 *
 * Only used on the fallback path — when `text_end.rawText` is missing (pure
 * `render_block`-event streams, or reasoning-only runs). The preferred path
 * uses the raw chunk text stored on the timeline entry and never enters
 * here.
 */
export function reconstructBlockMarkdown(block: {
  type: string;
  content: string | null;
  data?: Record<string, unknown> | null;
}): string {
  const content = block.content ?? "";
  const data = block.data ?? {};

  switch (block.type) {
    case "text":
      return content;
    case "code": {
      const language = typeof data.language === "string" ? data.language : "";
      return `\`\`\`${language}\n${content}\n\`\`\``;
    }
    // Mermaid is a code-fence-promoted type — it MUST reconstruct as a fence
    // (not an XML wrapper) so the reload parser re-detects it as mermaid.
    case "mermaid":
      return `\`\`\`mermaid\n${content}\n\`\`\``;
    // SVG is likewise a fence-promoted type — reconstruct as a ```svg fence.
    case "svg":
      return `\`\`\`svg\n${content}\n\`\`\``;
    // Chart (JSON spec) is fence-promoted too — reconstruct as a ```chart fence.
    case "chart":
      return `\`\`\`chart\n${content}\n\`\`\``;
    // Map / stats / diff are JSON-spec fence-promoted types — same rule.
    case "map":
      return `\`\`\`map\n${content}\n\`\`\``;
    case "stats":
      return `\`\`\`stats\n${content}\n\`\`\``;
    case "diff":
      return `\`\`\`diff\n${content}\n\`\`\``;
    // Item presentation is a JSON-fence block keyed by `item_presentation` —
    // reconstruct as a ```json fence so the reload splitter re-detects it.
    case "item_presentation":
      return `\`\`\`json\n${content}\n\`\`\``;
    // A schema proposal ({ name, schema, strict? }) is a JSON-fence block —
    // reconstruct as a ```json fence so the reload splitter re-detects it.
    case "schema_proposal":
      return `\`\`\`json\n${content}\n\`\`\``;
    // A Matrx Envelope is carried in a first-class ```matrx fence — reconstruct
    // that exact fence so the reload splitter re-detects it (and so the
    // persisted fence stays verbatim per MATRX_REFERENCES.md). The
    // SPECIAL_CODE_LANGUAGES default branch below would also handle this, but
    // an explicit case documents the contract.
    case "matrx":
      return `\`\`\`matrx\n${content}\n\`\`\``;
    case "reasoning":
    case "thinking":
      return `<thinking>\n${content}\n</thinking>`;
    case "artifact":
    case "decision": {
      const attrs = Object.entries(data)
        .filter(([k, v]) => k !== "content" && typeof v !== "object")
        .map(([k, v]) => ` ${k}="${String(v).replace(/"/g, "&quot;")}"`)
        .join("");
      return `<${block.type}${attrs}>\n${content}\n</${block.type}>`;
    }
    // XML-tagged blocks (task, flashcards, timeline, etc.) — wrap with the
    // matching tag so the reload parser re-detects the structured block.
    case "task":
    case "database":
    case "private":
    case "plan":
    case "event":
    case "tool":
    case "questionnaire":
    case "flashcards":
    case "cooking_recipe":
    case "timeline":
    case "progress_tracker":
    case "troubleshooting":
    case "resources":
    case "research":
    case "info":
      return `<${block.type}>\n${content}\n</${block.type}>`;
    default:
      // Fence-promoted special languages (```tasks, ```transcript,
      // ```structured_info, …) that aren't explicitly cased above MUST
      // reconstruct as their language fence — otherwise persistence drops
      // the fence and the reload splitter can never re-detect the block
      // (e.g. a ```tasks list silently degrades to raw checkbox markdown
      // in the chat-from-DB path while direct render routes still work).
      if (SPECIAL_CODE_LANGUAGES.includes(block.type)) {
        return `\`\`\`${block.type}\n${content}\n\`\`\``;
      }
      // Unknown types fall back to content — may lose structure but text
      // survives. Server-side render_block streams with novel types
      // should either extend this switch or move to chunk streaming.
      return content;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Assembles the canonical CxContentBlock[] from a completed ActiveRequest.
 *
 * Returns an empty array for requests with no meaningful content (errors,
 * aborts, or streams that produced nothing).
 */
export function assembleMessageParts(request: ActiveRequest): CxContentBlock[] {
  const blocks: CxContentBlock[] = [];

  // Track which renderBlock indices have been consumed by timeline text runs
  // so the fallback pass at the end doesn't double-emit them.
  const consumedRenderBlockIndices = new Set<number>();

  // Track tool callIds already emitted (tool_result events reference them)
  const emittedToolCallIds = new Set<string>();

  // ── Pass 1: Walk the timeline, merging adjacent text runs ───────────────
  //
  // The bug this pass fixes: every `phase`, `info`, `heartbeat`, `warning`,
  // `record_reserved`, etc. event auto-closes the current text run in the
  // slice's `appendTimeline` reducer. A single flowing paragraph (or a
  // table with 30 rows) that the model emitted as one run gets shredded
  // into N `text_end` entries, one per passive interruption. If we emit
  // one `CxTextContent` per `text_end`, the DB-load renderer parses each
  // fragment through `splitContentIntoBlocksV2` in isolation — and a
  // table row split between two fragments becomes two broken tables.
  //
  // Fix: accumulate raw text across consecutive text runs and flush it as
  // a single `CxTextContent` only when we hit a STRUCTURAL break —
  // reasoning (thinking), tool call, or the end of the timeline. Media
  // blocks within the text region are emitted inline at flush time, in
  // the order they arrived.
  //
  // This mirrors how the server stores content: one big text block per
  // contiguous region, never fragmented by status events.

  let pendingText = "";
  const pendingMedia: CxMediaContent[] = [];
  // Complete content-ir envelopes carried by this text run's source render
  // blocks. Stamped on the flushed part as its IrEnvelopeCache so a reload
  // reuses them instead of re-parsing (content-ir Phase 5).
  let pendingEnvelopes: CanonicalBlockIR[] = [];

  // Live citations grouped by their anchor render block (the client text
  // block streaming when each `citation` event arrived — see
  // LiveCitationEntry). A text run that consumes an anchor block collects
  // its citations into `pendingCitations`, and the flushed CxTextContent
  // carries them as its `citations` array — CLEAN canonical objects, never
  // marker tags, mirroring what the server persists on its own text parts.
  // Anchorless / unconsumed entries are appended to the LAST text part
  // after the walk so no citation is ever dropped from the committed turn.
  const citationsByAnchorBlockId = new Map<string, NormalizedCitation[]>();
  const unanchoredCitations: NormalizedCitation[] = [];
  for (const entry of request.liveCitations) {
    if (entry.anchorBlockId === null) {
      unanchoredCitations.push(entry.citation);
      continue;
    }
    const list = citationsByAnchorBlockId.get(entry.anchorBlockId) ?? [];
    list.push(entry.citation);
    citationsByAnchorBlockId.set(entry.anchorBlockId, list);
  }
  let pendingCitations: NormalizedCitation[] = [];

  const collectCitationsForBlockId = (blockId: string) => {
    const list = citationsByAnchorBlockId.get(blockId);
    if (list) {
      pendingCitations.push(...list);
      citationsByAnchorBlockId.delete(blockId);
    }
  };

  const flushPendingText = () => {
    if (pendingText.length > 0) {
      const cache = envelopeCacheFromEnvelopes(pendingEnvelopes);
      blocks.push({
        type: "text",
        text: pendingText,
        ...(pendingCitations.length > 0
          ? { citations: pendingCitations }
          : {}),
        ...(cache ? { metadata: { [IR_ENVELOPE_KEY]: cache } } : {}),
      } as CxTextContent);
      pendingText = "";
      pendingCitations = [];
    } else if (pendingCitations.length > 0) {
      // Collected citations but the run produced no text (empty-run edge) —
      // reroute to the trailing fallback instead of dropping them.
      unanchoredCitations.push(...pendingCitations);
      pendingCitations = [];
    }
    if (pendingMedia.length > 0) {
      for (const m of pendingMedia) blocks.push(m);
      pendingMedia.length = 0;
    }
    pendingEnvelopes = [];
  };

  for (const entry of request.timeline) {
    // ── Reasoning run ended → flush text, then emit CxThinkingContent ─────
    if (isReasoningEnd(entry)) {
      flushPendingText();
      const reasoningChunks = request.reasoningChunks.slice(
        entry.chunkStartIndex,
        entry.chunkEndIndex,
      );
      const text = reasoningChunks.join("");
      if (text.length > 0) {
        blocks.push({ type: "thinking", text } as CxThinkingContent);
      }
      continue;
    }

    // ── Text run ended → ACCUMULATE (do not flush yet) ──────────────────
    // The raw chunk text is appended to `pendingText` verbatim. Media
    // blocks found in this run's renderBlock range get queued for
    // emission at flush time. Flushing happens when we reach the next
    // structural event (reasoning/tool) or the end of the timeline.
    if (isTextEnd(entry)) {
      for (let i = entry.blockStartIndex; i < entry.blockEndIndex; i++) {
        consumedRenderBlockIndices.add(i);
      }

      const rawText = entry.rawText;
      if (rawText && rawText.length > 0) {
        pendingText += rawText;

        const rangeIds = request.renderBlockOrder.slice(
          entry.blockStartIndex,
          entry.blockEndIndex,
        );
        for (const blockId of rangeIds) {
          // Citations anchored to this run's blocks ride the flushed part.
          collectCitationsForBlockId(blockId);
          const block = request.renderBlocks[blockId];
          if (!block) continue;
          if (MEDIA_BLOCK_TYPES.has(block.type)) {
            const mediaBlock = renderBlockToMediaBlock(block);
            if (mediaBlock) pendingMedia.push(mediaBlock);
          }
          // The run's raw text embeds this block's region source verbatim, so
          // its complete envelope is reusable on reload — collect it for the
          // part cache stamped at flush time.
          const envelope = completeEnvelopeOf(block);
          if (envelope) pendingEnvelopes.push(envelope);
        }
        continue;
      }

      // Fallback for entries missing `rawText` (render_block-event streams
      // with no chunks): reconstruct markdown from the typed render
      // blocks. Reconstructed fragments are appended to pendingText
      // verbatim with `\n\n` separators between non-adjacent blocks.
      const rangeIds = request.renderBlockOrder.slice(
        entry.blockStartIndex,
        entry.blockEndIndex,
      );
      for (const blockId of rangeIds) {
        collectCitationsForBlockId(blockId);
        const block = request.renderBlocks[blockId];
        if (!block) continue;
        if (MEDIA_BLOCK_TYPES.has(block.type)) {
          const mediaBlock = renderBlockToMediaBlock(block);
          if (mediaBlock) pendingMedia.push(mediaBlock);
        } else {
          const reconstructed = reconstructBlockMarkdown({
            type: block.type,
            content: block.content ?? null,
            data: block.data ?? null,
          });
          if (reconstructed.length > 0) {
            if (pendingText.length > 0) pendingText += "\n\n";
            pendingText += reconstructed;
            // Reconstructed markdown carries the block's region source, so
            // its complete envelope (FE- or server-built) is reusable on
            // reload — collect it for the flush-time part cache.
            const envelope = completeEnvelopeOf(block);
            if (envelope) pendingEnvelopes.push(envelope);
          }
        }
      }
      continue;
    }

    // ── Tool event → flush text, emit tool blocks ──────────────────────
    // ── Server render_block → flush text, emit the block at its position ────
    // content-ir Phase 5 / py-block-detector: the server streams answer content
    // as render_block events, each recorded as a `render_block` timeline entry
    // (never covered by a text_end range). WITHOUT emitting them here, Pass 2
    // sweeps every server block to the END of the message — AFTER all tool_calls
    // — so a persisted / reloaded "block → tool → block" turn renders the tools
    // out of chronological position. Emit at the timeline spot and mark the
    // block consumed so Pass 2 skips it. Mirrors the `render_block` branch in
    // selectUnifiedSlots (the live path).
    if (isRenderBlock(entry)) {
      const blockId = entry.data.blockId;
      if (blockId === undefined) continue;
      const idx = request.renderBlockOrder.indexOf(blockId);
      if (idx < 0 || consumedRenderBlockIndices.has(idx)) continue;
      consumedRenderBlockIndices.add(idx);
      const block = request.renderBlocks[blockId];
      if (!block) continue;

      if (MEDIA_BLOCK_TYPES.has(block.type)) {
        // Media belongs in the current text run's flow (queued, flushed in
        // arrival order alongside surrounding text).
        const mediaBlock = renderBlockToMediaBlock(block);
        if (mediaBlock) pendingMedia.push(mediaBlock);
      } else if (typeof block.content === "string" && block.content.length > 0) {
        // Flush any preceding text so this typed block keeps its exact spot,
        // then emit it as its own part (same reconstruction Pass 2 uses).
        flushPendingText();
        const reconstructed = reconstructBlockMarkdown({
          type: block.type,
          content: block.content,
          data: block.data ?? null,
        });
        if (reconstructed.length > 0) {
          const envelope = completeEnvelopeOf(block);
          const cache = envelope ? envelopeCacheFromEnvelopes([envelope]) : null;
          blocks.push({
            type: "text",
            text: reconstructed,
            ...(cache ? { metadata: { [IR_ENVELOPE_KEY]: cache } } : {}),
          } as CxTextContent);
        }
      }
      continue;
    }

    if (isToolEvent(entry)) {
      const lifecycle = request.toolLifecycle[entry.data.call_id];
      if (!lifecycle) continue;

      if (
        entry.data.event === "tool_started" &&
        !emittedToolCallIds.has(entry.data.call_id)
      ) {
        flushPendingText();
        emittedToolCallIds.add(entry.data.call_id);
        // Write the new `call_id` field; the legacy `id` is kept on the
        // type as optional only for pre-migration persisted rows.
        blocks.push({
          type: "tool_call",
          call_id: lifecycle.callId,
          name: lifecycle.toolName,
          arguments: lifecycle.arguments,
        } as CxToolCallContent);
      }

      if (
        entry.data.event === "tool_completed" &&
        lifecycle.status === "completed" &&
        lifecycle.result !== undefined &&
        lifecycle.result !== null
      ) {
        flushPendingText();
        blocks.push({
          type: "tool_result",
          call_id: lifecycle.callId,
          name: lifecycle.toolName,
          content: lifecycle.result,
          is_error: false,
        } as CxToolResultContent);
      }

      if (entry.data.event === "tool_error") {
        flushPendingText();
        blocks.push({
          type: "tool_result",
          call_id: lifecycle.callId,
          name: lifecycle.toolName,
          content: lifecycle.errorMessage ?? "Tool error",
          is_error: true,
        } as CxToolResultContent);
      }
      continue;
    }

    // Passive events (phase, info, heartbeat, warning, record_reserved,
    // record_update, completion, init, broker, data, error, end, unknown)
    // do NOT flush pendingText. They carry no user-visible content for the
    // committed message; the text run must remain contiguous across them.
  }

  // Final flush — any trailing text + media go at the end of the message.
  flushPendingText();

  // ── Pass 2: Emit any renderBlocks not covered by timeline text runs ──────
  // This catches blocks from streams that had no text_start/end timeline entries
  // (e.g., pure data-event streams, or streams processed with older event formats).
  for (let i = 0; i < request.renderBlockOrder.length; i++) {
    if (consumedRenderBlockIndices.has(i)) continue;

    const blockId = request.renderBlockOrder[i];
    const block = request.renderBlocks[blockId];
    if (!block) continue;

    if (MEDIA_BLOCK_TYPES.has(block.type)) {
      const mediaBlock = renderBlockToMediaBlock(block);
      if (mediaBlock) blocks.push(mediaBlock);
    } else if (typeof block.content === "string" && block.content.length > 0) {
      // DATA CONTRACT: the reconstructed markdown is pushed verbatim. We
      // only skip a completely empty reconstruction; no trim, no collapse.
      const reconstructed = reconstructBlockMarkdown({
        type: block.type,
        content: block.content,
        data: block.data ?? null,
      });
      if (reconstructed.length > 0) {
        // Server render_block-only streams land here — stamp the block's
        // complete envelope (any engine) as this part's reload cache.
        const envelope = completeEnvelopeOf(block);
        const cache = envelope ? envelopeCacheFromEnvelopes([envelope]) : null;
        blocks.push({
          type: "text",
          text: reconstructed,
          ...(cache ? { metadata: { [IR_ENVELOPE_KEY]: cache } } : {}),
        } as CxTextContent);
      }
    }
  }

  // ── Citation fallback: never drop a captured citation ────────────────────
  // Anything still unattached (anchorless entries, or anchors whose block
  // never surfaced through a text run) lands on the LAST text part. The
  // server-persisted row remains the source of truth for exact per-block
  // placement; this client-side mirror guarantees the sources are present.
  const leftoverCitations = [
    ...unanchoredCitations,
    ...Array.from(citationsByAnchorBlockId.values()).flat(),
  ];
  if (leftoverCitations.length > 0) {
    for (let i = blocks.length - 1; i >= 0; i--) {
      const block = blocks[i];
      if (block.type === "text") {
        const textBlock: CxTextContent = block;
        textBlock.citations = [
          ...(textBlock.citations ?? []),
          ...leftoverCitations,
        ];
        break;
      }
    }
  }

  return blocks;
}

function renderBlockToMediaBlock(block: {
  type: string;
  data?: Record<string, unknown> | null;
}): CxMediaContent | null {
  const data = block.data ?? {};

  // Image blocks: process-stream.ts converts every image data event to a
  // UnifiedImageBlock before upserting, so `data` is the canonical shape.
  // Use the guard to prove the shape — a legacy entry that predates the
  // adapter migration falls through to the shallow mapping below, which
  // preserves at least the URL so we don't lose data on persistence.
  if (block.type === "image_output" && isUnifiedImageBlock(data)) {
    // Route through `toCxMediaPart` — packs every canonical field into
    // metadata so `fromCxMediaPart` can re-lift them losslessly on reload.
    return toCxMediaPart(data);
  }

  // Audio / video / generic media: legacy shallow mapping. Will get the
  // same canonical-shape treatment in a follow-up pass (one block type
  // at a time, mirroring the image template).
  const url =
    typeof data.url === "string"
      ? data.url
      : typeof data.file_url === "string"
        ? data.file_url
        : undefined;
  const mimeType =
    typeof data.mime_type === "string" ? data.mime_type : undefined;

  if (!url && !mimeType) return null;

  return {
    type: "media",
    kind: renderBlockTypeToMediaKind(block.type),
    url,
    mime_type: mimeType,
    metadata: Object.fromEntries(
      Object.entries(data).filter(([k]) => k !== "url" && k !== "mime_type"),
    ),
  };
}
