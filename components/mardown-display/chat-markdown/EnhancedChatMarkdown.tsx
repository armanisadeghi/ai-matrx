"use client";

// ─────────────────────────────────────────────────────────────────────────
// Part of the RICH DOCUMENT rendering engine (the "basement"). This is the
// block ORCHESTRATOR — it splits content into blocks and routes each to its
// renderer (code, tables, flashcards, tool calls, plans, …) via the block
// registry. The single most "this is not just markdown" file in the engine.
//
// FRONT DOOR: prefer `<RichDocument>` (features/rich-document/RichDocument.tsx),
// which wraps this engine and adds the action toolkit. See
// features/rich-document/FEATURE.md and the `rich-document-actions` skill.
// ─────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { cn } from "@/styles/themes/utils";
import { splitContentIntoBlocksV2 } from "../markdown-classification/processors/utils/content-splitter-v2";
import { expandTextBlocksInList } from "../markdown-classification/processors/utils/expand-text-blocks";
import { RenderBlock } from "./block-registry/BlockRenderer";
import { renderBlockToContentBlock } from "./render-block-to-content-block";
import { InlineCopyButton } from "@/components/matrx/buttons/MarkdownCopyButton";
import { ShimmerText } from "@/components/loaders/ShimmerText";
import FullScreenMarkdownEditor from "./FullScreenMarkdownEditor";
import { InlineStatusIndicator } from "./internal-handlers/InlineStatusIndicator";
import { InlineThinkingSlot } from "./internal-handlers/InlineThinkingSlot";
import {
  selectAccumulatedTextWithCitationMarkers,
  selectIsReasoningStreaming,
  selectUnifiedSlots,
  selectAllRenderBlocks,
  selectToolLifecycleMap,
  selectLiveCitationMarkersByBlockId,
  SPECIAL_RENDER_BLOCK_TYPES,
  type ContentSegment,
  type ContentSegmentDbTool,
  type UnifiedSlot,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import {
  insertCitationMarkers,
  type BlockCitationMarker,
} from "@/features/agents/redux/execution-system/messages/message-citations";
import {
  foldAgentWork,
  SHORT_TEXT_FOLD_MAX,
  type AgentWorkClass,
  type AgentWorkFold,
} from "@/features/tool-call-visualization/grouping/foldAgentWork";
import { AgentWorkGroup } from "@/features/tool-call-visualization/components/AgentWorkGroup";
import { getToolDisplayMode } from "@/features/tool-call-visualization/registry/registry";
import { selectMessageInterleavedContent } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  InlineToolCard,
  DbToolCard,
  InlineToolBatch,
  DbToolBatch,
} from "./internal-handlers/ToolHandlers";
import { InlineAssistantError } from "./internal-handlers/InlineAssistantError";
import { PlainTextFallback } from "./internal-handlers/PlainTextFallback";
import { SafeBlockRenderer } from "./internal-handlers/SafeBlockRenderer";
import { MarkdownErrorBoundary } from "./internal-handlers/MarkdownErrorBoundary";

/** Server-processed block from the content_block protocol. */
export interface ServerProcessedBlock {
  blockId: string;
  blockIndex: number;
  type: string;
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export interface ChatMarkdownDisplayProps {
  requestId?: string;
  /** Turn ID for DB-loaded turn rendering */
  turnId?: string;
  /** Conversation ID for DB-loaded turn rendering */
  conversationId?: string;
  content: string;
  taskId?: string;
  className?: string;
  isStreamActive?: boolean;
  onContentChange?: (newContent: string) => void;
  analysisData?: Record<string, unknown>;
  messageId?: string;
  allowFullScreenEditor?: boolean;
  hideCopyButton?: boolean;
  /** Pre-processed blocks from server (new content_block protocol). Bypasses client-side parsing. */
  serverProcessedBlocks?: ServerProcessedBlock[];
  /**
   * When false with onContentChange, edits call onContentChange(fullMarkdown) but the
   * rendered document does not switch to local `editedContent` (UI keeps `content` prop).
   */
  applyLocalEdits?: boolean;
}

// Render-block types that carry their payload on `data` rather than
// `content` — they must NOT be skipped when content is empty.
const MEDIA_RENDER_BLOCK_TYPES = new Set([
  "image_output",
  "audio_output",
  "video_output",
]);

// Data-event card blocks: same data-not-content shape as media, but kept in
// a separate set because MEDIA_RENDER_BLOCK_TYPES also feeds media-specific
// logic elsewhere. Their content is deliberately null so assembleMessageParts
// Pass 2 never persists them into committed message parts.
const DATA_CARD_RENDER_BLOCK_TYPES = new Set([
  "value_store_stored",
  "context_groomed",
]);

const _EMPTY_SEGMENTS: ContentSegment[] = [];
const _EMPTY_SLOTS: UnifiedSlot[] = [];
const _selectEmptyString = () => "";
const _selectFalse = () => false;
const _selectEmptySegments = () => _EMPTY_SEGMENTS;
const _selectEmptySlots = () => _EMPTY_SLOTS;
const _selectEmptyRenderBlocks = () =>
  undefined as RenderBlockPayload[] | undefined;
const _EMPTY_CITATION_MARKERS: Record<string, BlockCitationMarker[]> = {};
const _selectEmptyCitationMarkers = () => _EMPTY_CITATION_MARKERS;

// A run of this many or more consecutive tool calls (no text / thinking
// between them) folds into a single expandable "N tool calls" line — the
// agent fired several tools back-to-back without speaking, so the transcript
// shouldn't be a wall of rows. Runs shorter than this render as normal cards.
const TOOL_BATCH_MIN = 2;

/** A live unified slot, or a folded run of consecutive tool slots. */
type GroupedSlot =
  UnifiedSlot | { kind: "tool_batch"; callIds: string[]; seq: number };

function groupConsecutiveToolSlots(
  slots: UnifiedSlot[],
  // Result-is-purpose / stay-open tools (knowledge_search, document_search, …) are
  // the DELIVERABLE — they render their full card directly and are never
  // hidden behind a "N tool calls" line. Only "auto" tools batch.
  isBatchable: (callId: string) => boolean,
): GroupedSlot[] {
  const out: GroupedSlot[] = [];
  for (let i = 0; i < slots.length;) {
    const s = slots[i];
    if (s.kind === "tool" && isBatchable(s.callId)) {
      const callIds: string[] = [s.callId];
      let j = i + 1;
      while (
        j < slots.length &&
        slots[j].kind === "tool" &&
        isBatchable((slots[j] as { callId: string }).callId)
      ) {
        callIds.push((slots[j] as { callId: string }).callId);
        j++;
      }
      out.push(
        callIds.length >= TOOL_BATCH_MIN
          ? { kind: "tool_batch", callIds, seq: s.seq }
          : s,
      );
      i = j;
    } else {
      out.push(s);
      i++;
    }
  }
  return out;
}

/** A persisted content segment, or a folded run of consecutive db_tool segments. */
type GroupedSegment =
  | ContentSegment
  | { type: "db_tool_batch"; segments: ContentSegmentDbTool[]; key: string };

function groupConsecutiveDbTools(
  segments: ContentSegment[],
  // Same rule as the live path: deliverable-card tools never batch.
  isBatchable: (seg: ContentSegmentDbTool) => boolean,
): GroupedSegment[] {
  const out: GroupedSegment[] = [];
  for (let i = 0; i < segments.length;) {
    const seg = segments[i];
    if (seg.type === "db_tool" && isBatchable(seg)) {
      const run: ContentSegmentDbTool[] = [seg];
      let j = i + 1;
      while (
        j < segments.length &&
        segments[j].type === "db_tool" &&
        isBatchable(segments[j] as ContentSegmentDbTool)
      ) {
        run.push(segments[j] as ContentSegmentDbTool);
        j++;
      }
      out.push(
        run.length >= TOOL_BATCH_MIN
          ? {
              type: "db_tool_batch",
              segments: run,
              key: `db-tool-batch-${run[0].callId}`,
            }
          : seg,
      );
      i = j;
    } else {
      out.push(seg);
      i++;
    }
  }
  return out;
}

/**
 * Inside an EXPANDED agent-work group the list must be strictly LINEAR — one
 * row per thing that happened, in order, nothing requiring a second click to
 * reveal a third click. A "N tool calls" batch line is a summary-of-summaries
 * there, so folded batches are expanded back to their individual tool cards.
 * (Outside a group, batches keep folding as before.)
 */
function flattenWorkSlots(items: GroupedSlot[]): GroupedSlot[] {
  return items.flatMap((item) =>
    item.kind === "tool_batch"
      ? item.callIds.map((callId): GroupedSlot => ({
          kind: "tool",
          callId,
          seq: item.seq,
        }))
      : [item],
  );
}

function flattenWorkSegments(items: GroupedSegment[]): GroupedSegment[] {
  return items.flatMap((item) =>
    item.type === "db_tool_batch" ? item.segments : [item],
  );
}

/**
 * Epoch-ms span of a tool lifecycle entry / persisted tool record — feeds the
 * agent-work group's "Worked for Ns" duration. Null when timestamps are
 * missing or unparsable.
 */
function toolSpan(
  startedAt: string | null | undefined,
  completedAt: string | null | undefined,
): { start: number; end: number } | null {
  if (!startedAt || !completedAt) return null;
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }
  return { start, end };
}

function mergeSpans(
  spans: Array<{ start: number; end: number } | null>,
): { start: number; end: number } | null {
  let start = Infinity;
  let end = -Infinity;
  for (const s of spans) {
    if (!s) continue;
    if (s.start < start) start = s.start;
    if (s.end > end) end = s.end;
  }
  return end >= start ? { start, end } : null;
}

/** Is this text short enough to fold into an agent-work group as an aside? */
function classifyTextForFold(text: string | null | undefined): AgentWorkClass {
  const trimmed = text?.trim() ?? "";
  // Empty text renders nothing — never let an invisible item break a run.
  if (trimmed.length === 0) return "shortText";
  return trimmed.length <= SHORT_TEXT_FOLD_MAX ? "shortText" : "visible";
}

export const EnhancedChatMarkdownInternal: React.FC<
  ChatMarkdownDisplayProps
> = ({
  requestId,
  turnId,
  conversationId,
  content,
  taskId,
  className,
  isStreamActive,
  onContentChange,
  analysisData,
  messageId,
  allowFullScreenEditor = true,
  hideCopyButton = true,
  serverProcessedBlocks,
  applyLocalEdits = true,
}) => {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editedContent, setEditedContent] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  // Citation-aware accumulated text: identical to selectAccumulatedText when
  // the stream carries no citations; with live `citation` events it returns
  // the same markdown with inline `<matrxcite n="…" />` markers stamped at
  // each citation's arrival position (display-only — state and every persist
  // path stay marker-free). Feeds the PLAIN streaming branch; the unified
  // branch stamps the same markers per render block in renderGroupedSlot.
  const requestTextSelector = useMemo(
    () =>
      requestId
        ? selectAccumulatedTextWithCitationMarkers(requestId)
        : _selectEmptyString,
    [requestId],
  );
  const requestText = useAppSelector(requestTextSelector);

  const liveCitationMarkersSelector = useMemo(
    () =>
      requestId
        ? selectLiveCitationMarkersByBlockId(requestId)
        : _selectEmptyCitationMarkers,
    [requestId],
  );
  const liveCitationMarkersByBlockId = useAppSelector(
    liveCitationMarkersSelector,
  );

  // Whether the model is in its reasoning phase — true both for token-streaming
  // reasoning and for the server's explicit reasoning STATUS event (models with
  // no reasoning tokens). Drives the pre-token loader label so a thinking model
  // reads "Reasoning…" instead of the generic "Processing…".
  const isReasoningActive = useAppSelector(
    requestId ? selectIsReasoningStreaming(requestId) : _selectFalse,
  );

  const unifiedSlotsSelector = useMemo(
    () => (requestId ? selectUnifiedSlots(requestId) : _selectEmptySlots),
    [requestId],
  );
  const unifiedSlots = useAppSelector(unifiedSlotsSelector);

  const messageInterleavedContent = useAppSelector(
    messageId && conversationId
      ? selectMessageInterleavedContent(conversationId, messageId)
      : _selectEmptySegments,
  );

  const renderBlocksSelector = useMemo(
    () =>
      requestId ? selectAllRenderBlocks(requestId) : _selectEmptyRenderBlocks,
    [requestId],
  );
  const reduxRenderBlocks = useAppSelector(renderBlocksSelector);

  const renderBlocksMap = useMemo(() => {
    if (!reduxRenderBlocks) return {};
    const map: Record<string, RenderBlockPayload> = {};
    for (const b of reduxRenderBlocks) {
      map[b.blockId] = b;
    }
    return map;
  }, [reduxRenderBlocks]);

  const hasClientBlocks = !!(
    reduxRenderBlocks &&
    reduxRenderBlocks.length > 0 &&
    reduxRenderBlocks.some((b) => b.blockId.startsWith("client_"))
  );

  const resolvedContent = requestText || content;
  const currentContent = editedContent ?? resolvedContent;

  const hasRequestOrTaskId = requestId || taskId;
  const hasReceivedNonTextContent =
    (serverProcessedBlocks && serverProcessedBlocks.length > 0) ||
    hasClientBlocks;
  const isWaitingForContent =
    hasRequestOrTaskId && !resolvedContent.trim() && !hasReceivedNonTextContent;

  // A unified slot is "special" — i.e. needs the interleaved-unified
  // renderer rather than plain markdown — when it's a tool card, a phase
  // status, or a media render block (image_output / audio_output /
  // video_output). Without the media check, a pure-image stream (no text
  // run at all) falls through to the plain-content branch and renders
  // nothing, even though the slot is sitting right there.
  const hasUnifiedSpecial = unifiedSlots.some(
    (s) =>
      s.kind === "tool" ||
      s.kind === "status" ||
      s.kind === "error" ||
      s.kind === "thinking" ||
      (s.kind === "render_block" &&
        s.blockType !== undefined &&
        SPECIAL_RENDER_BLOCK_TYPES.has(s.blockType)),
  );

  const hasDbInterleavedSpecial = messageInterleavedContent.some(
    (s) => s.type === "db_tool" || s.type === "thinking",
  );

  // Tool names for batching + the settled-turn agent-work fold (live path):
  // the unified slots only carry callIds; display-mode checks need the name.
  const toolLifecycleMapSelector = useMemo(
    () => (requestId ? selectToolLifecycleMap(requestId) : () => undefined),
    [requestId],
  );
  const toolLifecycleMap = useAppSelector(toolLifecycleMapSelector);

  // Fold runs of consecutive tool calls into one expandable batch line so a
  // back-to-back burst (e.g. ten `tool_def` updates) isn't a wall of rows.
  // Deliverable-card tools ("stay-open" display mode — knowledge_search,
  // document_search, …) are excluded: their card IS the content and renders
  // directly. Only the rendering is regrouped; the `hasUnifiedSpecial` /
  // `hasDbInterleavedSpecial` branch checks still read the raw arrays.
  const groupedSlots = useMemo(
    () =>
      groupConsecutiveToolSlots(
        unifiedSlots,
        (callId) =>
          getToolDisplayMode(toolLifecycleMap?.[callId]?.toolName ?? null) ===
          "auto",
      ),
    [unifiedSlots, toolLifecycleMap],
  );
  const groupedSegments = useMemo(
    () =>
      groupConsecutiveDbTools(
        messageInterleavedContent,
        (seg) =>
          getToolDisplayMode(seg.record?.toolName ?? seg.stubName) === "auto",
      ),
    [messageInterleavedContent],
  );

  // ── Settled-turn fold: thinking / tool calls / short asides → one
  // "Worked for Ns" group. NEVER during a stream — live turns render every
  // item in real time; the fold is a post-hoc reorganization when content is
  // settled (stream ended, or loaded from the DB). ALL tool calls fold —
  // including the pretty deliverable cards (knowledge_search, document_search, …):
  // one click on the group reveals everything, with those full cards rendered
  // directly inside the linear expansion. Only real content (text, media,
  // errors) stays outside the group.
  const isSettled = !isStreamActive;

  const workGroupedSlots = useMemo((): Array<
    GroupedSlot | AgentWorkFold<GroupedSlot>
  > => {
    if (!isSettled) return groupedSlots;
    return foldAgentWork(groupedSlots, {
      classify: (slot) => {
        if (
          slot.kind === "thinking" ||
          slot.kind === "status" ||
          slot.kind === "tool" ||
          slot.kind === "tool_batch"
        ) {
          return "work";
        }
        if (slot.kind === "render_block") {
          const rb = renderBlocksMap[slot.blockId];
          if (!rb) return "shortText"; // renders nothing — don't break the run
          if (rb.type === "text") return classifyTextForFold(rb.content);
        }
        return "visible";
      },
      stepsOf: (slot) => (slot.kind === "tool_batch" ? slot.callIds.length : 1),
      spanOf: (slot) => {
        const entrySpan = (callId: string) => {
          const e = toolLifecycleMap?.[callId];
          return toolSpan(e?.startedAt, e?.completedAt);
        };
        if (slot.kind === "tool") return entrySpan(slot.callId);
        if (slot.kind === "tool_batch") {
          return mergeSpans(slot.callIds.map(entrySpan));
        }
        return null;
      },
    });
  }, [isSettled, groupedSlots, toolLifecycleMap, renderBlocksMap]);

  const workGroupedSegments = useMemo((): Array<
    GroupedSegment | AgentWorkFold<GroupedSegment>
  > => {
    if (!isSettled) return groupedSegments;
    const dbToolSpan = (seg: ContentSegmentDbTool) =>
      toolSpan(seg.record?.startedAt, seg.record?.completedAt);
    return foldAgentWork(groupedSegments, {
      classify: (seg) => {
        if (
          seg.type === "thinking" ||
          seg.type === "status" ||
          seg.type === "db_tool" ||
          seg.type === "db_tool_batch"
        ) {
          return "work";
        }
        if (seg.type === "text") return classifyTextForFold(seg.content);
        return "visible";
      },
      stepsOf: (seg) =>
        seg.type === "db_tool_batch" ? seg.segments.length : 1,
      spanOf: (seg) => {
        if (seg.type === "db_tool") return dbToolSpan(seg);
        if (seg.type === "db_tool_batch") {
          return mergeSpans(seg.segments.map(dbToolSpan));
        }
        return null;
      },
    });
  }, [isSettled, groupedSegments]);

  // NB: materialized artifacts are plain text now (vision R1) — both the
  // interleaved-segment path and the plain processedBlocks path split text via
  // splitContentIntoBlocksV2 and render `<artifact id>` by id, so no artifact-
  // specific path selection is needed (unlike the old structured artifact_ref).

  useEffect(() => {
    if (isStreamActive) {
      setEditedContent(null);
    }
  }, [isStreamActive]);

  useEffect(() => {
    if (applyLocalEdits === false) {
      setEditedContent(null);
    }
  }, [applyLocalEdits, resolvedContent]);

  // When server-processed blocks are available, use them directly (skip client-side parsing).
  // Otherwise, fall back to the client-side splitContentIntoBlocksV2 pipeline.
  const useServerBlocks =
    serverProcessedBlocks && serverProcessedBlocks.length > 0;

  // Memoize the content splitting to avoid unnecessary re-processing
  // Skip expensive processing if we're in loading state
  // NOTE: Do NOT call setState (like setHasError) inside useMemo — it's a React anti-pattern
  // that triggers re-renders during render, potentially causing infinite loops.
  const { blocks, blockError } = useMemo(() => {
    if (isWaitingForContent) return { blocks: [], blockError: false };

    // Fast path: Redux already has client-generated render blocks from the
    // StreamBlockAccumulator. Convert to RenderBlock shape and skip the
    // expensive splitContentIntoBlocksV2 entirely.
    if (hasClientBlocks && reduxRenderBlocks) {
      const clientBlocks: RenderBlock[] = reduxRenderBlocks
        .filter((rb) => rb.content?.trim())
        .map(renderBlockToContentBlock);
      return {
        blocks: expandTextBlocksInList(clientBlocks),
        blockError: false,
      };
    }

    // New protocol: server already processed the blocks — convert to RenderBlock shape.
    // When text content also exists, parse it through the normal pipeline first,
    // then append server-processed blocks (audio, images, etc.) so both render.
    if (useServerBlocks && serverProcessedBlocks) {
      const supplementaryBlocks: RenderBlock[] = serverProcessedBlocks.map(
        (sb) => ({
          type: sb.type,
          content: sb.content ?? "",
          serverData: (sb.data as Record<string, unknown>) ?? undefined,
          metadata: sb.metadata,
          language: (sb.data as Record<string, unknown>)?.language as
            string | undefined,
          src: (sb.data as Record<string, unknown>)?.src as string | undefined,
          alt: (sb.data as Record<string, unknown>)?.alt as string | undefined,
        }),
      );
      const expandedSupplementaryBlocks =
        expandTextBlocksInList(supplementaryBlocks);

      // If there's also text content, parse it normally and append supplementary blocks
      if (currentContent.trim()) {
        try {
          const textBlocks = splitContentIntoBlocksV2(currentContent);
          const parsed = Array.isArray(textBlocks) ? textBlocks : [];
          return {
            blocks: [
              ...expandTextBlocksInList(parsed),
              ...expandedSupplementaryBlocks,
            ],
            blockError: false,
          };
        } catch {
          return {
            blocks: [
              { type: "text" as const, content: currentContent },
              ...expandedSupplementaryBlocks,
            ],
            blockError: false,
          };
        }
      }

      return { blocks: expandedSupplementaryBlocks, blockError: false };
    }

    // Legacy: client-side parsing
    try {
      const result = splitContentIntoBlocksV2(currentContent);

      return {
        blocks: expandTextBlocksInList(Array.isArray(result) ? result : []),
        blockError: false,
      };
    } catch (error) {
      console.error(
        "[MarkdownStream] Error splitting content into blocks:",
        error,
      );
      // Return a single text block with the original content as fallback
      return {
        blocks: [{ type: "text" as const, content: currentContent }],
        blockError: true,
      };
    }
  }, [
    currentContent,
    isWaitingForContent,
    useServerBlocks,
    serverProcessedBlocks,
    hasClientBlocks,
    reduxRenderBlocks,
  ]);

  // Handle block processing errors outside of useMemo to avoid setState during render
  useEffect(() => {
    if (blockError) {
      setHasError(true);
    }
  }, [blockError]);

  // Post-process blocks: consolidate consecutive reasoning blocks when NOT streaming.
  // During streaming, each reasoning block renders individually (real-time feedback).
  // Once complete, consecutive reasoning blocks merge into a single unified display.
  // Reasoning blocks separated by other content (text, tool calls, etc.) stay separate.
  const processedBlocks = useMemo(() => {
    // During streaming, return blocks as-is for real-time display
    if (isStreamActive) return blocks;

    const result: RenderBlock[] = [];
    let i = 0;

    while (i < blocks.length) {
      if (blocks[i].type === "reasoning") {
        // Collect consecutive reasoning blocks
        const reasoningGroup: string[] = [];
        while (i < blocks.length && blocks[i].type === "reasoning") {
          reasoningGroup.push(blocks[i].content);
          i++;
        }

        if (reasoningGroup.length > 1) {
          // Multiple consecutive reasoning blocks — consolidate
          result.push({
            type: "consolidated_reasoning",
            content: reasoningGroup.join("\n---\n"), // Join for fallback
            metadata: { reasoningTexts: reasoningGroup },
          });
        } else {
          // Single reasoning block — keep as-is
          result.push({
            type: "reasoning",
            content: reasoningGroup[0],
          });
        }
      } else {
        result.push(blocks[i]);
        i++;
      }
    }

    return result;
  }, [blocks, isStreamActive]);

  // Find the index of the last reasoning block for animation purposes
  const lastReasoningBlockIndex = useMemo(() => {
    for (let i = processedBlocks.length - 1; i >= 0; i--) {
      if (processedBlocks[i].type === "reasoning") {
        return i;
      }
    }
    return -1;
  }, [processedBlocks]);

  // Note: Table parsing removed - StreamingTableRenderer handles it directly from block content

  /**
   * Generic content replacement handler — used by ALL block types that modify
   * the content string (code edits, table edits, broker updates, decision
   * resolutions, quiz results, etc.). Blocks call this with the original
   * substring and its replacement; the full content string is managed here.
   */
  const replaceBlockContent = useCallback(
    (original: string, replacement: string) => {
      try {
        const idx = currentContent.indexOf(original);
        if (idx === -1) {
          console.warn(
            "[MarkdownStream] replaceBlockContent: original substring not found in content.",
            { originalLen: original.length, contentLen: currentContent.length },
          );
          return;
        }
        const updatedContent =
          currentContent.slice(0, idx) +
          replacement +
          currentContent.slice(idx + original.length);
        onContentChange?.(updatedContent);
        if (applyLocalEdits !== false) {
          setEditedContent(updatedContent);
        }
      } catch (error) {
        console.error("[MarkdownStream] Error in replaceBlockContent:", error);
      }
    },
    [currentContent, onContentChange, applyLocalEdits],
  );

  const handleOpenEditor = useCallback(() => {
    try {
      if (isStreamActive) return;
      setIsEditorOpen(true);
    } catch (error) {
      console.error("[MarkdownStream] Error opening editor:", error);
    }
  }, [isStreamActive]);

  const handleCancelEdit = useCallback(() => {
    try {
      setIsEditorOpen(false);
    } catch (error) {
      console.error("[MarkdownStream] Error canceling edit:", error);
    }
  }, []);

  const handleSaveEdit = useCallback(
    (newContent: string) => {
      try {
        onContentChange?.(newContent);
        if (applyLocalEdits !== false) {
          setEditedContent(newContent);
        }
        setIsEditorOpen(false);
      } catch (error) {
        console.error("[MarkdownStream] Error saving edit:", error);
      }
    },
    [onContentChange, applyLocalEdits],
  );

  // Stable key: type + content fingerprint. Prevents React from reusing a
  // component instance when blocks shift (e.g. a decision block resolves and
  // the array collapses). Index is appended only as a tiebreaker for identical
  // blocks; the content prefix keeps identity stable across re-parses.
  //
  // Code blocks are a special case: their `content` mutates on every keystroke
  // when the user edits them in-place (via replaceBlockContent) AND on every
  // stream chunk. Including content in the key would remount the editor on
  // each change, destroying local state (isEditing, Monaco cursor/selection,
  // scroll, fullscreen). Keyed by `code-${index}` alone, in-place content
  // edits preserve component identity; if the block's position shifts, the
  // index changes and React still remounts correctly.
  const blockKey = useCallback((block: RenderBlock, index: number) => {
    if (block.type === "code") {
      return `code-${index}`;
    }
    return `${block.type}-${block.content.slice(0, 100)}-${index}`;
  }, []);

  // Memoize the render block function to prevent unnecessary re-renders
  const renderBlock = useCallback(
    (block: RenderBlock, index: number) => {
      try {
        if (!block || typeof block !== "object") {
          console.warn("[MarkdownStream] Invalid block at index:", index);
          return null;
        }

        return (
          <SafeBlockRenderer
            key={blockKey(block, index)}
            block={block}
            index={index}
            isStreamActive={isStreamActive}
            onContentChange={onContentChange}
            conversationId={conversationId}
            messageId={messageId}
            requestId={requestId}
            taskId={taskId}
            isLastReasoningBlock={index === lastReasoningBlockIndex}
            replaceBlockContent={replaceBlockContent}
            handleOpenEditor={handleOpenEditor}
          />
        );
      } catch (error) {
        console.error(
          "[MarkdownStream] Error in renderBlock at index:",
          index,
          error,
        );
        return (
          <div
            key={blockKey(block, index)}
            className="py-2 px-1 text-sm text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap break-words border-l-2 border-red-500 bg-red-50 dark:bg-red-950/20"
          >
            {block?.content || "[Render error]"}
          </div>
        );
      }
    },
    [
      blockKey,
      isStreamActive,
      onContentChange,
      messageId,
      taskId,
      lastReasoningBlockIndex,
      replaceBlockContent,
      handleOpenEditor,
    ],
  );

  const containerStyles = cn(
    "pt-1 pb-0 px-0 space-y-4 font-sans text-md antialiased leading-relaxed tracking-wide overflow-x-hidden min-w-0 break-words",
    "block w-full bg-inherit",
    className,
  );

  // If there was a critical error, show fallback
  if (hasError) {
    return (
      <PlainTextFallback
        requestId={requestId}
        content={currentContent}
        className={className}
      />
    );
  }

  // When requestId is present and unified slots have non-text content
  // (tools, status, OR a media render block — image_output / audio_output
  // / video_output), skip the generic loader and let the unified renderer
  // handle it — even before any text arrives. Without the media check, a
  // pure-image-only turn (no text run at all) shows the "Working on it…"
  // spinner forever because `hasReceivedNonTextContent` only sees text
  // render blocks via the `client_` prefix.
  const hasPreTextSegments =
    isWaitingForContent && requestId && hasUnifiedSpecial;

  if (isWaitingForContent && !hasPreTextSegments) {
    try {
      return (
        <div className="mb-1 w-full min-w-0 text-left overflow-x-hidden">
          <div className={containerStyles}>
            <div className="flex items-center justify-start py-1">
              <ShimmerText
                text={isReasoningActive ? "Reasoning…" : "Processing…"}
                className="text-sm"
              />
            </div>
          </div>
        </div>
      );
    } catch (error) {
      console.error("[MarkdownStream] Error rendering loading state:", error);
      return <PlainTextFallback content="Loading..." className={className} />;
    }
  }

  // Renders one live grouped slot (the pre-fold shape) — shared between the
  // top-level map and the expanded body of an AgentWorkGroup, so folded items
  // render EXACTLY as they would ungrouped (no wrappers, no drift).
  const renderGroupedSlot = (slot: GroupedSlot, i: number) => {
    if (!requestId) return null;
    if (slot.kind === "tool_batch") {
      return (
        <InlineToolBatch
          key={`tool-batch-${slot.seq}`}
          requestId={requestId}
          callIds={slot.callIds}
          conversationId={conversationId ?? ""}
        />
      );
    }
    if (slot.kind === "render_block") {
      let rb = renderBlocksMap[slot.blockId];
      if (!rb) return null;
      // Media blocks (image_output / audio_output / video_output)
      // carry their payload on `data`, not `content`. Don't drop
      // them just because content is empty.
      if (
        !MEDIA_RENDER_BLOCK_TYPES.has(rb.type) &&
        !DATA_CARD_RENDER_BLOCK_TYPES.has(rb.type) &&
        !rb.content?.trim()
      ) {
        return null;
      }

      // Live citations anchored to this text block: stamp the inline
      // `<matrxcite n="…" />` markers at their arrival offsets before the
      // content is split/rendered. Same core (`insertCitationMarkers`) and
      // same renderer chip as the persisted path — display-only, the
      // stored block content is never mutated.
      if (rb.type === "text" && rb.content) {
        const liveMarkers = liveCitationMarkersByBlockId[slot.blockId];
        if (liveMarkers && liveMarkers.length > 0) {
          rb = {
            ...rb,
            content: insertCitationMarkers(rb.content, liveMarkers),
          };
        }
      }

      // Text render_blocks may carry inline `<thinking>` /
      // `<reasoning>` tags (models that emit reasoning in
      // regular text instead of as `reasoning_chunk` events).
      // Split them through the same pipeline the DB path uses
      // (see the `text` segment branch below) so those tags
      // become `ThinkingTrace` blocks instead of leaking as
      // raw markdown. Mark the last reasoning sub-block as
      // streaming so its shimmer/tail animation fires while
      // the stream is still depositing tokens into it.
      if (rb.type === "text" && rb.content?.trim()) {
        const sub = (() => {
          try {
            return splitContentIntoBlocksV2(rb.content);
          } catch {
            return null;
          }
        })();
        if (sub && sub.length > 0) {
          let lastReasoningIdx = -1;
          for (let j = sub.length - 1; j >= 0; j--) {
            if (sub[j].type === "reasoning" || sub[j].type === "thinking") {
              lastReasoningIdx = j;
              break;
            }
          }
          const isStreamingRb = rb.status === "streaming";
          return sub.map((b, j) =>
            renderBlock(
              {
                ...b,
                isStreamingBlock: isStreamingRb && j === lastReasoningIdx,
              } as RenderBlock,
              i * 1000 + j,
            ),
          );
        }
      }

      const block = renderBlockToContentBlock(rb);
      return renderBlock(block, i);
    }
    if (slot.kind === "tool") {
      return (
        <InlineToolCard
          key={`tool-${slot.seq}-${slot.callId}`}
          requestId={requestId}
          callId={slot.callId}
          conversationId={conversationId ?? ""}
        />
      );
    }
    if (slot.kind === "status") {
      return (
        <InlineStatusIndicator key={`status-${slot.seq}`} label={slot.label} />
      );
    }
    if (slot.kind === "thinking") {
      // Live thinking, pinned to its chronological slot. Rendered
      // through the SAME `renderBlock({type:"reasoning"})` path
      // the persisted branch uses, so live and reloaded turns
      // produce an identical ThinkingTrace.
      return (
        <InlineThinkingSlot
          key={`thinking-${slot.seq}`}
          requestId={requestId}
          chunkStartIndex={slot.chunkStartIndex}
          chunkEndIndex={slot.chunkEndIndex}
          renderReasoning={(content, isStreaming) =>
            renderBlock(
              {
                type: "reasoning",
                content,
                isStreamingBlock: isStreaming,
              } as RenderBlock,
              i,
            )
          }
        />
      );
    }
    if (slot.kind === "error") {
      return (
        <InlineAssistantError key={`error-${slot.seq}`} requestId={requestId} />
      );
    }
    return null;
  };

  // Renders one persisted grouped segment — shared between the top-level map
  // and the expanded body of an AgentWorkGroup (same rationale as above).
  const renderGroupedSegment = (segment: GroupedSegment, segIdx: number) => {
    if (segment.type === "db_tool_batch") {
      return (
        <DbToolBatch
          key={segment.key}
          segments={segment.segments}
          conversationId={conversationId ?? ""}
        />
      );
    }
    if (segment.type === "db_tool") {
      return (
        <DbToolCard
          key={`db-tool-${segIdx}-${segment.callId}`}
          segment={segment}
          conversationId={conversationId ?? ""}
        />
      );
    }
    if (segment.type === "render_block") {
      // DB media parts (images / audio / video) routed
      // through the canonical BlockRenderer pipeline. Image
      // segments land on UnifiedImageBlockRenderer +
      // useUnifiedImageUrl, which re-mint expired signed
      // URLs from the persisted fileId, so old messages
      // keep working indefinitely.
      const block: RenderBlock = {
        type: segment.blockType,
        content: segment.content ?? "",
        serverData: segment.data ?? undefined,
        metadata: segment.metadata,
      };
      return expandTextBlocksInList([block]).map((expandedBlock, blockIdx) =>
        renderBlock(expandedBlock, segIdx * 1000 + blockIdx),
      );
    }
    if (segment.type === "thinking") {
      const thinkBlocks = (() => {
        try {
          return splitContentIntoBlocksV2(segment.content);
        } catch {
          return [
            {
              type: "reasoning" as const,
              content: segment.content,
              startLine: 0,
              endLine: 0,
            },
          ];
        }
      })();
      return thinkBlocks.map((block, blockIdx) =>
        renderBlock({ ...block, type: "reasoning" }, segIdx * 1000 + blockIdx),
      );
    }
    if (segment.type === "text") {
      const segBlocks = (() => {
        try {
          return splitContentIntoBlocksV2(segment.content);
        } catch {
          return [
            {
              type: "text" as const,
              content: segment.content,
              startLine: 0,
              endLine: 0,
            },
          ];
        }
      })();
      return segBlocks.map((block, blockIdx) =>
        renderBlock(block, segIdx * 1000 + blockIdx),
      );
    }
    return null;
  };

  try {
    return (
      <div className="mb-1 w-full min-w-0 text-left overflow-x-hidden">
        <div className={containerStyles}>
          {hasUnifiedSpecial && requestId
            ? workGroupedSlots.map((slot, i) =>
                slot.kind === "agent_work" ? (
                  <AgentWorkGroup
                    key={`agent-work-${slot.items[0]?.seq ?? i}`}
                    sessionKey={`agent-work:${requestId}:${slot.items[0]?.seq ?? i}`}
                    order={i}
                    durationMs={slot.durationMs}
                    stepCount={slot.stepCount}
                    conversationId={conversationId}
                  >
                    {flattenWorkSlots(slot.items).map((s, k) =>
                      renderGroupedSlot(s, i * 1000 + k),
                    )}
                  </AgentWorkGroup>
                ) : (
                  renderGroupedSlot(slot, i)
                ),
              )
            : hasDbInterleavedSpecial
              ? workGroupedSegments.map((segment, segIdx) =>
                  "kind" in segment && segment.kind === "agent_work" ? (
                    <AgentWorkGroup
                      key={`agent-work-${messageId ?? ""}-${segIdx}`}
                      sessionKey={`agent-work:${messageId ?? conversationId ?? ""}:${segIdx}`}
                      order={segIdx}
                      durationMs={segment.durationMs}
                      stepCount={segment.stepCount}
                      conversationId={conversationId}
                    >
                      {flattenWorkSegments(segment.items).map((s, k) =>
                        renderGroupedSegment(s, segIdx * 1000 + k),
                      )}
                    </AgentWorkGroup>
                  ) : (
                    renderGroupedSegment(segment, segIdx)
                  ),
                )
              : processedBlocks.map((block, index) =>
                  renderBlock(block, index),
                )}
        </div>

        {!hideCopyButton && (
          <MarkdownErrorBoundary
            fallback={null}
            onError={(error) =>
              console.error("[MarkdownStream] CopyButton error:", error)
            }
          >
            <InlineCopyButton
              markdownContent={currentContent}
              size="xs"
              position="center-right"
              isMarkdown={true}
              constrainToParent={true}
            />
          </MarkdownErrorBoundary>
        )}

        {allowFullScreenEditor && (
          <MarkdownErrorBoundary
            fallback={null}
            onError={(error) =>
              console.error("[MarkdownStream] FullScreenEditor error:", error)
            }
          >
            <FullScreenMarkdownEditor
              isOpen={isEditorOpen}
              initialContent={currentContent}
              onSave={handleSaveEdit}
              onCancel={handleCancelEdit}
              analysisData={analysisData}
              messageId={messageId}
              tabs={["write", "matrx_split", "markdown", "wysiwyg", "preview"]}
              initialTab="matrx_split"
            />
          </MarkdownErrorBoundary>
        )}
      </div>
    );
  } catch (error) {
    console.error("[MarkdownStream] Critical error in render:", error);
    return <PlainTextFallback content={currentContent} className={className} />;
  }
};
