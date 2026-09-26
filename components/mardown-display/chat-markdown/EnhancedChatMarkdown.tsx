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

import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from "react";
import { cn } from "@/styles/themes/utils";
import { splitContentIntoBlocksV2 } from "../markdown-classification/processors/utils/content-splitter-v2";
import { renderSettledFromRecord, settledOneShotBlocks } from "./settle-stream-blocks";
import { expandTextBlocksInList } from "../markdown-classification/processors/utils/expand-text-blocks";
import { RenderBlock } from "./block-registry/BlockRenderer";
import { reuseUnchangedBlocks } from "./stable-blocks";
import { useProgressiveMount } from "./progressive-mount";
import { renderBlockToContentBlock } from "./render-block-to-content-block";
import { DocumentNumberingProvider } from "@/components/markdown-core/syntax/elements/DocumentNumbering";
import { MarkdownSourceEditProvider } from "@/components/markdown-core/syntax/elements/MarkdownSourceEdit";

/** Task checkboxes toggle only when the message has a save path; otherwise they stay read-only marks. */
function MaybeSourceEdit({ source, save, children }: { source: string; save?: (next: string) => void; children: React.ReactNode }) {
  if (!save) return <>{children}</>;
  return (
    <MarkdownSourceEditProvider source={source} save={save}>
      {children}
    </MarkdownSourceEditProvider>
  );
}
import { InlineCopyButton } from "@/components/matrx/buttons/MarkdownCopyButton";
import { ShimmerText } from "@/components/loaders/ShimmerText";
import {
  RunJobWorkingLine,
  useIsRunJob,
} from "@/features/agents/components/run/RunJobWorkingLine";
import { GenerationJobCard } from "@/features/agents/components/run/GenerationJobCard";
import { selectRequestGenerationJob } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import FullScreenMarkdownEditor from "./FullScreenMarkdownEditor";
import { InlineStatusIndicator } from "./internal-handlers/InlineStatusIndicator";
import { InlineThinkingSlot } from "./internal-handlers/InlineThinkingSlot";
import {
  selectAccumulatedTextWithCitationMarkers,
  selectIsReasoningStreaming,
  selectUnifiedSlotRange,
  selectAllRenderBlocks,
  selectToolLifecycleMap,
  selectLiveCitationMarkersByBlockId,
  blockCarriesDataNotText,
  blockHasSomethingToRender,
  verbalizedDecisionJsonTextBlockIds,
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
import {
  EXPERT_WORKING_LABEL,
  useMachineFramesVisible,
} from "@/features/agents/components/shared/transcript-audience";
import { getToolDisplayMode } from "@/features/tool-call-visualization/registry/registry";
import { isCloudBrowserToolName } from "@/features/tool-call-visualization/renderers/cloud-browser/cloudBrowserRun";
import { collectCloudBrowserRun } from "@/features/tool-call-visualization/grouping/groupCloudBrowserRuns";
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
import { MarkdownStreamingProvider } from "@/components/markdown-core/streaming-context";
import { useBoundAgentOutputSchema } from "@/components/mardown-display/blocks/json/useBoundAgentOutputSchema";
import { MarkdownErrorBoundary } from "./internal-handlers/MarkdownErrorBoundary";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

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
  streamSlotStart?: number;
  streamSlotEnd?: number;
  /** Turn ID for DB-loaded turn rendering */
  turnId?: string;
  /** Conversation ID for DB-loaded turn rendering */
  conversationId?: string;
  content: string;
  taskId?: string;
  className?: string;
  isStreamActive?: boolean;
  /**
   * An in-body edit produced the full new text. `previousContent` is the text
   * the edit was applied to (this renderer's current content) — a persisting
   * host diffs the two and splices ONLY the changed span into its stored bytes,
   * because this content is display text (whitespace-normalized, reasoning
   * scrubbed), never the stored row (RC-B5).
   */
  onContentChange?: (newContent: string, previousContent: string) => void;
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

// Blocks that carry their payload on `data` rather than on `content` are
// recognised STRUCTURALLY (`blockCarriesDataNotText` /
// `blockHasSomethingToRender`), never by an allowlist of type names. Three
// such allowlists used to live here and in the selectors, and the kind that
// was in none of them — `decision_answers`, a turn with no text at all —
// rendered as an empty assistant turn over a paid run. See the predicate's
// docs in active-requests.selectors.ts.

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
  | UnifiedSlot
  | {
      kind: "tool_batch";
      callIds: string[];
      seq: number;
      batchKind: "default" | "cloud-browser";
      browserRunOrder?: number;
      browserBreakBefore?: boolean;
      browserBreakAfter?: boolean;
    };

function groupConsecutiveToolSlots(
  slots: UnifiedSlot[],
  // Result-is-purpose / stay-open tools (knowledge_search, document_search, …) are
  // the DELIVERABLE — they render their full card directly and are never
  // hidden behind a "N tool calls" line. Only "auto" tools batch.
  getBatchKind: (callId: string) => "default" | "cloud-browser" | null,
  isCloudBrowserBridge: (slot: UnifiedSlot) => boolean,
): GroupedSlot[] {
  const out: GroupedSlot[] = [];
  let browserRunOrder = 0;
  for (let i = 0; i < slots.length;) {
    const s = slots[i];
    const batchKind = s.kind === "tool" ? getBatchKind(s.callId) : null;
    if (s.kind === "tool" && batchKind === "cloud-browser") {
      const run = collectCloudBrowserRun(slots, i, (candidate) => {
        if (
          candidate.kind === "tool" &&
          getBatchKind(candidate.callId) === "cloud-browser"
        ) {
          return "browser";
        }
        return isCloudBrowserBridge(candidate) ? "bridge" : "break";
      });
      out.push({
        kind: "tool_batch",
        callIds: run.browserItems.map(
          (candidate) => (candidate as { kind: "tool"; callId: string }).callId,
        ),
        seq: s.seq,
        batchKind,
        browserRunOrder,
        browserBreakBefore: browserRunOrder > 0,
        browserBreakAfter: run.breakAfter,
      });
      out.push(...run.bridgeItems);
      browserRunOrder++;
      i = run.nextIndex;
      continue;
    }
    if (s.kind === "tool" && batchKind) {
      const callIds: string[] = [s.callId];
      let j = i + 1;
      while (j < slots.length) {
        const candidate = slots[j];
        if (
          !candidate ||
          candidate.kind !== "tool" ||
          getBatchKind(candidate.callId) !== batchKind
        ) {
          break;
        }
        callIds.push(candidate.callId);
        j++;
      }
      out.push(
        callIds.length >= TOOL_BATCH_MIN
          ? { kind: "tool_batch", callIds, seq: s.seq, batchKind }
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
  | {
      type: "db_tool_batch";
      segments: ContentSegmentDbTool[];
      key: string;
      batchKind: "default" | "cloud-browser";
      browserRunOrder?: number;
      browserBreakBefore?: boolean;
      browserBreakAfter?: boolean;
    };

function groupConsecutiveDbTools(
  segments: ContentSegment[],
  // Same rule as the live path: deliverable-card tools never batch.
  getBatchKind: (
    seg: ContentSegmentDbTool,
  ) => "default" | "cloud-browser" | null,
  isCloudBrowserBridge: (segment: ContentSegment) => boolean,
): GroupedSegment[] {
  const out: GroupedSegment[] = [];
  let browserRunOrder = 0;
  for (let i = 0; i < segments.length;) {
    const seg = segments[i];
    const batchKind = seg.type === "db_tool" ? getBatchKind(seg) : null;
    if (seg.type === "db_tool" && batchKind === "cloud-browser") {
      const run = collectCloudBrowserRun(segments, i, (candidate) => {
        if (
          candidate.type === "db_tool" &&
          getBatchKind(candidate) === "cloud-browser"
        ) {
          return "browser";
        }
        return isCloudBrowserBridge(candidate) ? "bridge" : "break";
      });
      out.push({
        type: "db_tool_batch",
        segments: run.browserItems as ContentSegmentDbTool[],
        key: `db-tool-batch-${seg.callId}`,
        batchKind,
        browserRunOrder,
        browserBreakBefore: browserRunOrder > 0,
        browserBreakAfter: run.breakAfter,
      });
      out.push(...run.bridgeItems);
      browserRunOrder++;
      i = run.nextIndex;
      continue;
    }
    if (seg.type === "db_tool" && batchKind) {
      const run: ContentSegmentDbTool[] = [seg];
      let j = i + 1;
      while (j < segments.length) {
        const candidate = segments[j];
        if (
          !candidate ||
          candidate.type !== "db_tool" ||
          getBatchKind(candidate) !== batchKind
        ) {
          break;
        }
        run.push(candidate);
        j++;
      }
      out.push(
        run.length >= TOOL_BATCH_MIN
          ? {
              type: "db_tool_batch",
              segments: run,
              key: `db-tool-batch-${run[0].callId}`,
              batchKind,
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
    item.kind === "tool_batch" && item.batchKind === "default"
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
    item.type === "db_tool_batch" && item.batchKind === "default"
      ? item.segments
      : [item],
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
  streamSlotStart,
  streamSlotEnd,
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
  // One schema resolution per rendered assistant message; all child blocks
  // receive the settled result and never issue their own cold-load reads.
  const outputSchema = useBoundAgentOutputSchema(conversationId);
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
  const isRunJob = useIsRunJob(requestId);
  // A VIDEO job renders as a card (model, clock, estimated cost) until the
  // stream's end lands the player; image/audio jobs keep the working line.
  const isVideoJob =
    useAppSelector(
      requestId ? selectRequestGenerationJob(requestId) : () => null,
    )?.kind === "video";

  const unifiedSlotsSelector = useMemo(
    () =>
      requestId
        ? selectUnifiedSlotRange(requestId, streamSlotStart, streamSlotEnd)
        : _selectEmptySlots,
    [requestId, streamSlotStart, streamSlotEnd],
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

  // A verbalized decision (any TEXT model asked `decision_questions`) streams
  // its raw structured-output JSON as ordinary text BEFORE the server can
  // finalize it into one `decision_answers` part. Persist time strips that
  // JSON out of the message (aidream `finalize_verbalized_decision`), so a
  // reload shows only the Answers card — but live, the JSON text block and
  // the `decision_answers` block both sat in `reduxRenderBlocks`, and the
  // answer appeared twice. Drop the JSON-only text block(s) live so the two
  // paths render identically. Native (`jev-*`) decisions never stream text
  // at all, so this set is empty for them.
  const hiddenDecisionJsonTextBlockIds = useMemo(
    () => verbalizedDecisionJsonTextBlockIds(reduxRenderBlocks),
    [reduxRenderBlocks],
  );

  /**
   * Render from the Redux render blocks whenever there ARE any — client-
   * produced (`client_…`, the StreamBlockAccumulator) or SERVER-produced
   * (`render_block` events, block mode + server-orchestrated pipeline runs).
   *
   * The old gate keyed on the `client_` PREFIX, which is a proxy for "the
   * frontend parsed these", not for "we have render blocks". A stream whose
   * blocks all come from the server therefore fell through to
   * `splitContentIntoBlocksV2(currentContent)` — re-deriving blocks from the
   * flat text and DISCARDING every block's `metadata`. That silently threw
   * away the server's `__ir` envelopes and its `__ir_partial` provisional
   * events, so server-side kind routing and progressive partial rendering
   * could never happen on this path. Re-splitting text we already have as
   * typed blocks is also strictly worse: it loses the block's type, its
   * serverData, and its arrival order.
   */
  const hasReduxRenderBlocks = !!(
    reduxRenderBlocks && reduxRenderBlocks.length > 0
  );

  /**
   * THE FINAL SCREEN IS THE RELOAD (RC-B3, owner: "the final screen of a
   * streamed answer equals a reload"). Once the stream has ended and the
   * committed record is in the store, this message renders exactly what a
   * reload renders: the record's own parts, each text part split one-shot —
   * never the live render blocks. Live blocks are the server's INCREMENTAL
   * reading of a text still arriving; a late orphan reasoning closer (the one
   * documented exception to "settled never changes") and the artifact
   * rewrite at persist time both make that reading differ from the stored
   * text, so a settled turn that kept rendering it differed from its own
   * reload (verify-RC-B3 F1/F2). Decision: `renderSettledFromRecord`.
   */
  const settledFromRecord = renderSettledFromRecord({
    isStreamActive: !!isStreamActive,
    messageId,
    recordSegmentCount: messageInterleavedContent.length,
  });
  const resolvedContent = settledFromRecord ? content : requestText || content;
  const currentContent = editedContent ?? resolvedContent;

  const hasRequestOrTaskId = requestId || taskId;
  const hasReceivedNonTextContent =
    (serverProcessedBlocks && serverProcessedBlocks.length > 0) ||
    hasReduxRenderBlocks;
  const isWaitingForContent =
    hasRequestOrTaskId && !resolvedContent.trim() && !hasReceivedNonTextContent;

  // A unified slot is "special" — i.e. needs the interleaved-unified
  // renderer rather than plain markdown — when it's a tool card, a phase
  // status, or a media render block (image_output / audio_output /
  // video_output). Without the media check, a pure-image stream (no text
  // run at all) falls through to the plain-content branch and renders
  // nothing, even though the slot is sitting right there.
  const hasUnifiedSpecial =
    !settledFromRecord &&
    (streamSlotStart !== undefined ||
    streamSlotEnd !== undefined ||
    unifiedSlots.some(
      (s) =>
        s.kind === "tool" ||
        s.kind === "status" ||
        s.kind === "error" ||
        s.kind === "thinking" ||
        (s.kind === "render_block" &&
          blockCarriesDataNotText(renderBlocksMap[s.blockId])),
    ));

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

  /**
   * 🚨 MACHINE FRAMES ARE FOR BUILDERS, NEVER FOR EXPERTS. The host declares
   * who is reading (features/agents/components/shared/transcript-audience.tsx);
   * a host that declares nothing is a builder surface and nothing below
   * changes for it. When this is false, a tool call renders as one quiet
   * "Working…" line while it is in flight and as NOTHING once it has landed —
   * the fact survives, the payload does not.
   */
  const machineFramesVisible = useMachineFramesVisible();

  // Fold runs of consecutive tool calls into one expandable batch line so a
  // back-to-back burst (e.g. ten record updates) isn't a wall of rows.
  // Deliverable-card tools ("stay-open" display mode — knowledge_search,
  // document_search, …) are excluded: their card IS the content and renders
  // directly. Only the rendering is regrouped; the `hasUnifiedSpecial` /
  // `hasDbInterleavedSpecial` branch checks still read the raw arrays.
  const groupedSlots = useMemo(
    () =>
      groupConsecutiveToolSlots(
        unifiedSlots,
        (callId) => {
          const toolName = toolLifecycleMap?.[callId]?.toolName ?? null;
          if (getToolDisplayMode(toolName) !== "auto") return null;
          return isCloudBrowserToolName(toolName) ? "cloud-browser" : "default";
        },
        (slot) => {
          if (slot.kind === "thinking" || slot.kind === "status") return true;
          if (slot.kind !== "render_block") return false;
          const block = renderBlocksMap[slot.blockId];
          if (!block) return true;
          return (
            block.type === "text" &&
            classifyTextForFold(block.content) === "shortText"
          );
        },
      ),
    [unifiedSlots, toolLifecycleMap, renderBlocksMap],
  );
  const groupedSegments = useMemo(
    () =>
      groupConsecutiveDbTools(
        messageInterleavedContent,
        (seg) => {
          const toolName = seg.record?.toolName ?? seg.stubName;
          if (getToolDisplayMode(toolName) !== "auto") return null;
          return isCloudBrowserToolName(toolName) ? "cloud-browser" : "default";
        },
        (segment) => {
          if (segment.type === "thinking" || segment.type === "status")
            return true;
          return (
            segment.type === "text" &&
            classifyTextForFold(segment.content) === "shortText"
          );
        },
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
    // An Expert's transcript has no machine frames left to fold, so the
    // "Worked for Ns" group would be a box that opens onto nothing — a dead
    // end, which is worse than the leak it replaced.
    if (!machineFramesVisible) return groupedSlots;
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
  }, [
    isSettled,
    groupedSlots,
    toolLifecycleMap,
    renderBlocksMap,
    machineFramesVisible,
  ]);

  const workGroupedSegments = useMemo((): Array<
    GroupedSegment | AgentWorkFold<GroupedSegment>
  > => {
    if (!isSettled) return groupedSegments;
    // Same rule as the live half: with no machine frames left there is
    // nothing to fold, and an empty "Worked for Ns" group is a dead end.
    if (!machineFramesVisible) return groupedSegments;
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
  }, [isSettled, groupedSegments, machineFramesVisible]);

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

    // THE FINAL PASS (RC-B3 ruling, 2026-09-26): once the stream completes,
    // the screen equals the one-shot reading — a late orphan reasoning closer
    // is the one case where the live accumulator's blocks differ from it.
    if (!settledFromRecord && hasReduxRenderBlocks && reduxRenderBlocks) {
      const settled = settledOneShotBlocks({
        isStreamActive: !!isStreamActive,
        blockIds: reduxRenderBlocks.map((rb) => rb.blockId),
        content: currentContent,
      });
      if (settled) {
        return { blocks: expandTextBlocksInList(settled), blockError: false };
      }
    }

    // Fast path: Redux already has client-generated render blocks from the
    // StreamBlockAccumulator. Convert to RenderBlock shape and skip the
    // expensive splitContentIntoBlocksV2 entirely.
    if (!settledFromRecord && hasReduxRenderBlocks && reduxRenderBlocks) {
      const clientBlocks: RenderBlock[] = reduxRenderBlocks
        .filter(
          (rb) =>
            blockHasSomethingToRender(rb) &&
            !hiddenDecisionJsonTextBlockIds.has(rb.blockId),
        )
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
    isStreamActive,
    isWaitingForContent,
    useServerBlocks,
    serverProcessedBlocks,
    hasReduxRenderBlocks,
    reduxRenderBlocks,
    hiddenDecisionJsonTextBlockIds,
    settledFromRecord,
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

  // THE UNCHANGED-BLOCK LAW (stable-blocks.ts): every re-split makes new
  // block objects; hand back the previous object for every block whose data
  // did not change, so only the block that changed renders again.
  const prevBlocksRef = useRef<RenderBlock[]>([]);
  // Per-slot memory for the interleaved paths (see stableSlotBlocks below).
  const slotBlocksRef = useRef(new Map<string, RenderBlock[]>());
  const stableBlocks = useMemo(
    () => reuseUnchangedBlocks(prevBlocksRef.current, processedBlocks),
    [processedBlocks],
  );
  useLayoutEffect(() => {
    prevBlocksRef.current = stableBlocks;
  }, [stableBlocks]);

  // A huge document mounts in slices, never in one frozen frame.
  const { shown: mountedBlockCount, sentinel: progressiveSentinel } =
    useProgressiveMount(stableBlocks.length);

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
  // Block callbacks read the LATEST content through this ref, so their
  // identity never changes with the content (THE UNCHANGED-BLOCK LAW: a new
  // callback per keystroke re-rendered every block).
  const latestRef = useRef({ currentContent, onContentChange, applyLocalEdits });
  useLayoutEffect(() => {
    latestRef.current = { currentContent, onContentChange, applyLocalEdits };
  });

  const blockContentChange = useCallback((next: string) => {
    const { onContentChange: change, currentContent: prev } = latestRef.current;
    change?.(next, prev);
  }, []);

  const replaceBlockContent = useCallback(
    (original: string, replacement: string) => {
      const { currentContent, onContentChange, applyLocalEdits } = latestRef.current;
      try {
        const idx = currentContent.indexOf(original);
        if (idx === -1) {
          console.warn(
            // access-errors: ok — console-only diagnostic about an in-memory substring comparison performed here (indexOf === -1), no record read involved
            "[MarkdownStream] replaceBlockContent: original substring not found in content.",
            { originalLen: original.length, contentLen: currentContent.length },
          );
          return;
        }
        const updatedContent =
          currentContent.slice(0, idx) +
          replacement +
          currentContent.slice(idx + original.length);
        onContentChange?.(updatedContent, currentContent);
        if (applyLocalEdits !== false) {
          setEditedContent(updatedContent);
        }
      } catch (error) {
        console.error("[MarkdownStream] Error in replaceBlockContent:", error);
      }
    },
    [],
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
        onContentChange?.(newContent, currentContent);
        if (applyLocalEdits !== false) {
          setEditedContent(newContent);
        }
        setIsEditorOpen(false);
      } catch (error) {
        console.error("[MarkdownStream] Error saving edit:", error);
      }
    },
    [onContentChange, applyLocalEdits, currentContent],
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

  // Memoize the render block function to prevent unnecessary re-renders.
  //
  // 🚨 `index` is ONLY a positional key here — it is meaningful as a "which
  // block is this" identity for the plain `processedBlocks` path and NOWHERE
  // else. The unified-slot path and the persisted-segment path both synthesize
  // indices (`i`, `i * 1000 + j`, `segIdx * 1000 + blockIdx`) that have no
  // relationship to `processedBlocks`, so comparing them against
  // `lastReasoningBlockIndex` marked an ARBITRARY thinking trace as the live
  // one: whichever slot's index happened to collide with the last reasoning
  // block of the unrelated array streamed its tail while the genuinely current
  // trace sat collapsed as "Thought process". Hence `isLastReasoning` defaults
  // to FALSE and only the plain `processedBlocks` callsite opts in — every
  // other path carries the authoritative signal on the block itself
  // (`isStreamingBlock`), so the animation follows the run, never an index
  // coincidence.
  const renderBlock = useCallback(
    (block: RenderBlock, index: number, isLastReasoning = false) => {
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
            onContentChange={onContentChange ? blockContentChange : undefined}
            conversationId={conversationId}
            messageId={messageId}
            requestId={requestId}
            taskId={taskId}
            isLastReasoningBlock={isLastReasoning}
            replaceBlockContent={replaceBlockContent}
            handleOpenEditor={handleOpenEditor}
            outputSchema={outputSchema}
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
            <ErrorAlchemyMenu />
          </div>
        );
      }
    },
    [
      blockKey,
      isStreamActive,
      onContentChange,
      blockContentChange,
      conversationId,
      messageId,
      requestId,
      taskId,
      replaceBlockContent,
      handleOpenEditor,
      outputSchema,
    ],
  );

  // `overflow-x-clip`, NOT `overflow-x-hidden`. Both stop wide content blowing
  // out the column, but `overflow-x: hidden` alongside a `visible` y-axis is
  // illegal CSS: the browser silently computes overflow-y to `auto`, making
  // this a scroll container. That trapped the code block's `position: sticky`
  // toolbar so it could never reach the real chat scroller (D153). `clip`
  // creates no scroll container, so the clipping is identical and sticky works.
  const containerStyles = cn(
    "pt-1 pb-0 px-0 space-y-4 font-sans text-md antialiased leading-relaxed tracking-wide overflow-x-clip min-w-0 break-words",
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
        <div className="mb-1 w-full min-w-0 text-left overflow-x-clip">
          <div className={containerStyles}>
            <div className="flex items-center justify-start py-1">
              {requestId && isVideoJob ? (
                <GenerationJobCard requestId={requestId} />
              ) : requestId && isRunJob ? (
                // A generation job names itself, its model and its clock —
                // "Processing…" for a minute reads as a hang.
                <RunJobWorkingLine requestId={requestId} />
              ) : (
                <ShimmerText
                  text={isReasoningActive ? "Reasoning…" : "Processing…"}
                  className="text-sm"
                />
              )}
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
  // THE UNCHANGED-BLOCK LAW on the interleaved paths (tool calls, persisted
  // segments): each slot/segment re-splits its text on every render, so its
  // blocks go through the same reuse, keyed by the slot, before they render.
  const stableSlotBlocks = (key: string, next: RenderBlock[]): RenderBlock[] => {
    const prev = slotBlocksRef.current.get(key) ?? [];
    const stable = reuseUnchangedBlocks(prev, next);
    slotBlocksRef.current.set(key, stable);
    return stable;
  };

  const renderGroupedSlot = (slot: GroupedSlot, i: number) => {
    if (!requestId) return null;
    if (slot.kind === "tool_batch") {
      // A batch is several machine frames folded into one — still machine.
      if (!machineFramesVisible) return null;
      return (
        <InlineToolBatch
          key={`tool-batch-${slot.seq}`}
          requestId={requestId}
          callIds={slot.callIds}
          conversationId={conversationId ?? ""}
          browserRunOrder={slot.browserRunOrder}
          browserBreakBefore={slot.browserBreakBefore}
          browserBreakAfter={slot.browserBreakAfter}
        />
      );
    }
    if (slot.kind === "render_block") {
      let rb = renderBlocksMap[slot.blockId];
      if (!rb) return null;
      // Media, data cards and typed kind payloads (decision_answers …)
      // carry their payload on `data`, not `content`. Drop a block only
      // when it has NEITHER — never because its text happens to be empty.
      if (!blockHasSomethingToRender(rb)) {
        return null;
      }
      // A verbalized decision's raw structured-output JSON text — the
      // source the `decision_answers` block on this same turn was parsed
      // from. Drop it live so the turn matches the reloaded/persisted
      // shape (one Answers card), not the JSON-plus-card double-render.
      if (hiddenDecisionJsonTextBlockIds.has(slot.blockId)) {
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
          return stableSlotBlocks(
            `slot:${slot.seq}`,
            sub.map(
              (b, j) =>
                ({
                  ...b,
                  isStreamingBlock: isStreamingRb && j === lastReasoningIdx,
                }) as RenderBlock,
            ),
          ).map((b, j) => renderBlock(b, i * 1000 + j));
        }
      }

      const [block] = stableSlotBlocks(`slotb:${slot.seq}`, [renderBlockToContentBlock(rb)]);
      return renderBlock(block as RenderBlock, i);
    }
    if (slot.kind === "tool") {
      if (!machineFramesVisible) {
        const entry = toolLifecycleMap?.[slot.callId];
        const settled =
          entry?.status === "completed" || entry?.status === "error";
        // Still working → say so. Finished → the assistant's own words are
        // the result; the frame that produced them is not the Expert's business.
        return settled ? null : (
          <InlineStatusIndicator
            key={`tool-${slot.seq}-${slot.callId}`}
            label={EXPERT_WORKING_LABEL}
          />
        );
      }
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
      // A generation job's status ("Initializing…", "Generating image…") is
      // replaced by the job's own line — what, which model, how long — so the
      // person watching a minute-long render sees a clock, not a loop.
      if (requestId && isVideoJob) {
        return (
          <GenerationJobCard
            key={`status-${slot.seq}`}
            requestId={requestId}
            className="my-2"
          />
        );
      }
      if (requestId && isRunJob) {
        return (
          <RunJobWorkingLine
            key={`status-${slot.seq}`}
            requestId={requestId}
            className="flex items-center py-2"
          />
        );
      }
      // A status label is written for whoever is watching the machine — the
      // providers emit "Using tool <name>" verbatim. An Expert gets the fact
      // without the machinery's vocabulary.
      return (
        <InlineStatusIndicator
          key={`status-${slot.seq}`}
          label={machineFramesVisible ? slot.label : EXPERT_WORKING_LABEL}
        />
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
      if (!machineFramesVisible) return null;
      return (
        <DbToolBatch
          key={segment.key}
          segments={segment.segments}
          conversationId={conversationId ?? ""}
          browserRunOrder={segment.browserRunOrder}
          browserBreakBefore={segment.browserBreakBefore}
          browserBreakAfter={segment.browserBreakAfter}
        />
      );
    }
    if (segment.type === "db_tool") {
      // A reloaded turn shows what was SAID, never the call that produced it.
      if (!machineFramesVisible) return null;
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
      // useBlockMediaSource, which resolve durable URLs
      // from the persisted fileId, so old messages
      // keep working indefinitely.
      const block: RenderBlock = {
        type: segment.blockType,
        content: segment.content ?? "",
        serverData: segment.data ?? undefined,
        metadata: segment.metadata,
      };
      return stableSlotBlocks(`segrb:${segIdx}`, expandTextBlocksInList([block])).map(
        (expandedBlock, blockIdx) => renderBlock(expandedBlock, segIdx * 1000 + blockIdx),
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
      return stableSlotBlocks(
        `segthink:${segIdx}`,
        thinkBlocks.map((block) => ({ ...block, type: "reasoning" }) as RenderBlock),
      ).map((block, blockIdx) => renderBlock(block, segIdx * 1000 + blockIdx));
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
      return stableSlotBlocks(`segtext:${segIdx}`, segBlocks as RenderBlock[]).map(
        (block, blockIdx) => renderBlock(block, segIdx * 1000 + blockIdx),
      );
    }
    return null;
  };

  try {
    return (
      // A live stream heals half-arrived markdown in every MarkdownCore leaf
      // below (links, images, emphasis) — finished messages are untouched.
      <MarkdownStreamingProvider value={!!isStreamActive}>
        {/* One figure/table/equation numbering for the whole answer, however it splits. */}
        <DocumentNumberingProvider source={currentContent}>
        {/* A message that can be saved lets its task checkboxes write back (splice API). */}
        <MaybeSourceEdit source={currentContent} save={isStreamActive ? undefined : onContentChange ? handleSaveEdit : undefined}>
        <div className="mb-1 w-full min-w-0 text-left overflow-x-clip" data-matrx-doc-root="">
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
                : stableBlocks.slice(0, mountedBlockCount).map((block, index) =>
                    renderBlock(
                      block,
                      index,
                      index === lastReasoningBlockIndex,
                    ),
                  )}
            {!hasUnifiedSpecial && !hasDbInterleavedSpecial && progressiveSentinel}
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
              <FullScreenMarkdownEditor imagePolicy="inherit"
                isOpen={isEditorOpen}
                initialContent={currentContent}
                onSave={handleSaveEdit}
                onCancel={handleCancelEdit}
                analysisData={analysisData}
                messageId={messageId}
                conversationId={conversationId}
                tabs={[
                  "write",
                  "matrx_split",
                  "markdown",
                  "wysiwyg",
                  "preview",
                ]}
                initialTab="matrx_split"
              />
            </MarkdownErrorBoundary>
          )}
        </div>
        </MaybeSourceEdit>
        </DocumentNumberingProvider>
      </MarkdownStreamingProvider>
    );
  } catch (error) {
    console.error("[MarkdownStream] Critical error in render:", error);
    return <PlainTextFallback content={currentContent} className={className} />;
  }
};
