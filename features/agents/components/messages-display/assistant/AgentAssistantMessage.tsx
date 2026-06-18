"use client";

/**
 * AgentAssistantMessage
 *
 * Renders an assistant turn. Reads ONLY identifiers from props
 * (`requestId`, `messageId`, `conversationId`) and subscribes to its own data.
 * **No content shaping happens here.**
 *
 * The canonical rendering pipeline is:
 *
 *   AgentAssistantMessage  → <MarkdownStream messageId+conversationId
 *                                            requestId? isStreamActive?>
 *                          → MarkdownStreamImpl
 *                          → StreamAwareChatMarkdown
 *                          → EnhancedChatMarkdown
 *                              ├─ when streaming (requestId set):
 *                              │     unifiedSlots → <InlineToolCard> + text
 *                              └─ when persisted (no requestId, messageId set):
 *                                    selectMessageInterleavedContent
 *                                    → <DbToolCard> + text
 *
 * Tool calls render exactly once. Previous versions of this file walked
 * `record.content` here and rendered `PersistedToolCallCard` per tool_call —
 * that duplicated the work `EnhancedChatMarkdown` already does, producing
 * 2–3 copies of every card. Removed.
 *
 * Streaming turn:    requestId is set, isStreamActive=true.
 * Committed turn:    messageId set, isStreamActive=false (no requestId).
 * DB-loaded turn:    messageId set, isStreamActive=false (no requestId).
 */

import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import MarkdownStream from "@/components/MarkdownStream";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useDebugContext } from "@/hooks/useDebugContext";
import {
  selectErrorIsFatal,
  selectRequestError,
  selectRenderBlockCount,
  selectHasInlineError,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { selectBufferStream } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectStreamPhase } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import {
  selectMessageById,
  extractFlatText,
  extractContentBlocks,
  isFailedRecord,
  extractRecordError,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { normalizeContentBlocks } from "@/features/agents/redux/execution-system/utils/normalize-content-blocks";
import { AssistantError } from "../../run/AssistantError";
import { BreathingOrb } from "./BreathingOrb";
import { AssistantActionBar } from "./AssistantActionBar";
import { retryConversationTurn } from "@/features/agents/redux/execution-system/message-crud/retry-turn.thunk";
import { commitInlineContentEdit } from "@/features/agents/redux/execution-system/message-crud/commit-inline-edit.thunk";
import { toast } from "sonner";
import { useDomCapturePrint } from "@/features/conversation/hooks/useDomCapturePrint";
import { MessageFilesStrip } from "@/features/code/views/history/MessageFilesStrip";
import {
  isWarRoomTileAgentSurface,
  traceWarRoomRenderPath,
} from "@/features/war-room/utils/renderPathTrace";

const ASSISTANT_MSG_DEBUG = "[ASSISTANT MESSAGE DEBUG]";

interface AgentAssistantMessageProps {
  conversationId: string;
  requestId?: string;
  /** Server-assigned `cx_message.id` — present for committed and DB-loaded turns. */
  messageId?: string;
  isStreamActive?: boolean;
  /**
   * Optional surface key for routing fork / retry outcomes via the
   * surfaces registry. Threaded down to AssistantActionBar.
   */
  surfaceKey?: string;
  compact?: boolean;
  /**
   * Suppress the per-message AssistantActionBar. Used by AssistantTurnGroup
   * to consolidate N sibling assistant messages (multi-iteration agentic
   * turns) into one trailing action bar at the end of the group. When set,
   * the print/full-DOM capture target also lifts to the group container.
   */
  hideActionBar?: boolean;
  /**
   * Show the Retry control when this turn failed. Set by the transcript only
   * for the conversation's LAST (recoverable) failed turn — historical failed
   * attempts that were already followed by a retry render the error with no
   * button. Retry is non-destructive (the failed turn stays in history).
   */
  canRetry?: boolean;
}

export function AgentAssistantMessage({
  conversationId,
  requestId,
  messageId,
  isStreamActive = false,
  surfaceKey,
  hideActionBar = false,
  canRetry = false,
}: AgentAssistantMessageProps) {
  useDebugContext("AgentAssistantMessage");

  useEffect(() => {
    if (!isWarRoomTileAgentSurface(surfaceKey)) return;
    traceWarRoomRenderPath(
      15,
      "AgentAssistantMessage.tsx",
      "assistant message render",
      {
        conversationId,
        messageId: messageId ?? null,
        requestId: requestId ?? null,
        isStreamActive,
      },
    );
  }, [surfaceKey, conversationId, messageId, requestId, isStreamActive]);

  const dispatch = useAppDispatch();
  const [retrying, setRetrying] = useState(false);

  const { captureRef, isCapturing, captureAsPDF } = useDomCapturePrint();
  const handleFullPrint = useCallback(() => {
    captureAsPDF({
      filename: `agent-${conversationId}-${messageId ?? requestId ?? ""}`,
    });
  }, [captureAsPDF, conversationId, messageId, requestId]);

  const isFatalError = useAppSelector(
    requestId ? selectErrorIsFatal(requestId) : () => undefined,
  );

  // Buffer stream — when enabled + still streaming, render a loader
  // instead of the live token text so the response paints in one frame
  // on completion. Default false; existing surfaces are unaffected.
  const bufferStream = useAppSelector(selectBufferStream(conversationId));

  // The full backend/client error (e.g. "Failed to fetch") for this request,
  // and the unified stream phase that drives the live indicator below.
  const streamError = useAppSelector(
    requestId ? selectRequestError(requestId) : () => undefined,
  );
  const phase = useAppSelector(selectStreamPhase(conversationId));

  const record = useAppSelector(
    messageId ? selectMessageById(conversationId, messageId) : () => undefined,
  );

  // Plain-text projection for action bar (copy / print / share).
  const flatText = extractFlatText(record);

  // Non-text blocks (images, audio, data events) that need direct rendering.
  // These bypass the markdown pipeline and go to BlockRenderer via the
  // serverProcessedBlocks path in EnhancedChatMarkdown.
  //
  // Excluded: "text" (handled by flatText), "thinking" / "reasoning" (handled
  // by the interleaved selector), "tool_call" / "tool_result" (handled by
  // DbToolCard). Any remaining block type — media, image_output, search_results,
  // etc. — is normalised into the canonical RenderBlockPayload shape.
  //
  // useMemo is intentional here: normalizeContentBlocks generates UUIDs for
  // blockIds, so we must stabilise the output to avoid new IDs on every render.
  const serverProcessedBlocks = useMemo(() => {
    const EXCLUDED = new Set([
      "text",
      "thinking",
      "reasoning",
      "tool_call",
      "tool_result",
    ]);
    const mediaBlocks = extractContentBlocks(record).filter(
      (b) => !EXCLUDED.has(b.type ?? ""),
    );
    if (mediaBlocks.length === 0) return undefined;
    return normalizeContentBlocks(mediaBlocks);
  }, [record]);

  // Inline edits inside the body (inline-decision resolve, code-block save,
  // table edits, broker updates, inline-replace flows) emit the full
  // updated message text via `onContentChange`. Forward to the thunk that:
  //   1. patches `activeRequests.editedText` so the renderer reflects the
  //      change in the current frame (otherwise the lifetime rule means
  //      display stays bound to the original server-derived render blocks);
  //   2. optimistically updates `messages.byId.content`;
  //   3. debounces a `cx_message_edit` RPC so the DB write happens once per
  //      logical edit session — `content_history` gets ONE archive entry
  //      per session, not per keystroke (Monaco fires onChange per stroke).
  //
  // Gated on a committed `messageId` because pre-commit there's nothing to
  // persist to. The inline-decision Apply button is disabled while
  // `isStreamActive` is true, which is the only window without a messageId,
  // so in practice this branch is always taken when an edit fires.
  const handleInlineContentChange = useCallback(
    (newContent: string) => {
      if (!messageId) return;
      dispatch(
        commitInlineContentEdit({
          conversationId,
          messageId,
          requestId,
          newText: newContent,
        }),
      );
    },
    [dispatch, conversationId, messageId, requestId],
  );

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    try {
      await dispatch(retryConversationTurn({ conversationId })).unwrap();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err && "message" in err
            ? String((err as { message?: string }).message)
            : "Retry failed";
      toast.error(message);
    } finally {
      setRetrying(false);
    }
  }, [dispatch, conversationId]);

  // A turn is failed when the live request errored (in-session) OR the
  // persisted record is `status='failed'` / `metadata.failed` (reloaded from
  // the DB, or stamped mid-stream via record_update). Both render the same
  // error treatment so a live failure and a reloaded one look identical. The
  // failed turn stays in history; retry (when offered) re-runs it without
  // deleting anything. See CONVERSATION_FAILURE_AND_RETRY_FE_GUIDE.md.
  const failed = isFatalError || isFailedRecord(record);

  // Did anything actually stream/persist for this turn? Drives the failed
  // layout: a turn that already produced content renders that content WITH
  // the error appended BELOW it — an error must NEVER wipe what the user
  // already received (heartbeat timeouts routinely kill streams that are
  // 90% delivered, and the server usually finishes the turn anyway). Only
  // a turn that died before producing anything renders error-only.
  const streamedBlockCount = useAppSelector(
    requestId ? selectRenderBlockCount(requestId) : () => 0,
  );

  // A MID-TURN error is already rendered inline at its chronological position
  // by EnhancedChatMarkdown (the `error` unified slot). When that happens we
  // must NOT also render the trailing copy below the content — that's the very
  // "error floats to the bottom and slides down" bug. A FATAL error (no
  // content after it) produces no inline slot, so this is false and the
  // trailing render (with Retry) is kept exactly as before.
  const hasInlineErrorSelector = useMemo(
    () => (requestId ? selectHasInlineError(requestId) : () => false),
    [requestId],
  );
  const hasInlineError = useAppSelector(hasInlineErrorSelector);
  const hasBody =
    flatText.length > 0 ||
    (serverProcessedBlocks?.length ?? 0) > 0 ||
    streamedBlockCount > 0;

  const showBufferLoader = bufferStream && isStreamActive && !failed;
  const showMarkdownStream = !showBufferLoader;
  const showTrailingOrb =
    isStreamActive &&
    !failed &&
    (phase === "text_streaming" || phase === "interstitial");
  const showTrailingFailedError = !hasInlineError && failed;
  const showFilesStrip = !!messageId;
  const showPerMessageActionBar =
    !hideActionBar && !isStreamActive && !failed && !!messageId;
  const renderBranch =
    failed && !hasBody
      ? "error-only"
      : showBufferLoader
        ? "buffer-loader"
        : "markdown-body";

  const prevRenderSnapshotRef = useRef<string | null>(null);
  useEffect(() => {
    const snapshot = {
      renderBranch,
      failed,
      hasBody,
      isStreamActive,
      phase,
      bufferStream,
      hasInlineError,
      flatTextLength: flatText.length,
      serverProcessedBlockCount: serverProcessedBlocks?.length ?? 0,
      streamedBlockCount,
      showBufferLoader,
      showMarkdownStream,
      showTrailingOrb,
      showTrailingFailedError,
      showFilesStrip,
      showPerMessageActionBar,
      hideActionBar,
      canRetry,
    };
    const key = JSON.stringify(snapshot);
    if (prevRenderSnapshotRef.current === key) return;

    console.log(`${ASSISTANT_MSG_DEBUG} AgentAssistantMessage`, {
      conversationId,
      messageId: messageId ?? null,
      requestId: requestId ?? null,
      ...snapshot,
      rendering: {
        errorOnly: renderBranch === "error-only",
        bufferLoaderOrb: showBufferLoader,
        markdownStream: showMarkdownStream
          ? {
              path: requestId
                ? "requestId-driven (streaming source)"
                : "messageId-driven (persisted)",
              isStreamActiveProp: isStreamActive && !failed,
            }
          : null,
        trailingStreamingOrb: showTrailingOrb,
        trailingFailedError: showTrailingFailedError,
        messageFilesStrip: showFilesStrip,
        actionBar: showPerMessageActionBar
          ? "per-message AssistantActionBar"
          : hideActionBar
            ? "hidden (AssistantTurnGroup owns bar)"
            : isStreamActive
              ? "hidden (still streaming)"
              : failed
                ? "hidden (failed turn)"
                : !messageId
                  ? "hidden (no messageId yet)"
                  : "hidden",
      },
      why: {
        errorOnly:
          failed && !hasBody ? "failed with no streamed/persisted body" : null,
        bufferLoader: showBufferLoader
          ? "bufferStream enabled while active stream"
          : null,
        trailingOrb: showTrailingOrb ? `phase=${phase}` : null,
        suppressTrailingError: hasInlineError
          ? "inline error already rendered in markdown"
          : null,
      },
    });
    prevRenderSnapshotRef.current = key;
  }, [
    conversationId,
    messageId,
    requestId,
    renderBranch,
    failed,
    hasBody,
    isStreamActive,
    phase,
    bufferStream,
    hasInlineError,
    flatText.length,
    serverProcessedBlocks?.length,
    streamedBlockCount,
    showBufferLoader,
    showMarkdownStream,
    showTrailingOrb,
    showTrailingFailedError,
    showFilesStrip,
    showPerMessageActionBar,
    hideActionBar,
    canRetry,
  ]);

  useEffect(() => {
    if (!isWarRoomTileAgentSurface(surfaceKey)) return;
    if (!hasBody && !failed) return;
    traceWarRoomRenderPath(
      16,
      "AgentAssistantMessage.tsx",
      "assistant message body visible",
      {
        conversationId,
        messageId: messageId ?? null,
        requestId: requestId ?? null,
        isStreamActive,
        hasBody,
        failed,
      },
    );
  }, [
    surfaceKey,
    conversationId,
    messageId,
    requestId,
    isStreamActive,
    hasBody,
    failed,
  ]);

  const failedError = failed
    ? (() => {
        const recordError = extractRecordError(record);
        const friendly =
          streamError?.user_message ??
          streamError?.message ??
          recordError ??
          "The response failed.";
        const technical = streamError?.message;
        const detail =
          technical && technical !== friendly ? technical : undefined;
        const code =
          streamError?.code ??
          (streamError?.details &&
          typeof streamError.details === "object" &&
          "status_code" in streamError.details
            ? (streamError.details as { status_code?: string | number })
                .status_code
            : undefined);
        return (
          <AssistantError
            message={friendly}
            detail={detail}
            errorType={streamError?.error_type}
            code={code}
            onRetry={canRetry ? handleRetry : undefined}
            retrying={retrying}
          />
        );
      })()
    : null;

  if (failed && !hasBody) {
    return (
      <div className="mt-1" data-message-id={messageId ?? undefined}>
        {failedError}
      </div>
    );
  }

  // ONE render path. EnhancedChatMarkdown picks the streaming or persisted
  // sub-path based on whether `requestId` is provided.
  //
  // Lifetime rule: once an assistant turn was streamed in this session, we
  // KEEP rendering it from the streaming source (`activeRequests.byRequestId
  // [reqId]`) for as long as the conversation instance is mounted — even
  // after the stream completes. The end-of-stream commit on
  // `messages.byId.content` is for hydration on the NEXT page load and for
  // edit/fork/retry/copy/share/print to consume; it is intentionally NOT
  // used by the renderer mid-session, because swapping data sources causes
  // a visible re-render flash across the whole response column.
  //
  // For DB-hydrated history (no `_streamRequestId` on the record),
  // `requestId` arrives undefined → EnhancedChatMarkdown falls through to
  // the persisted (DbToolCard) branch as before.
  //
  // The historical duplication concern (both branches firing) is moot at
  // EnhancedChatMarkdown.tsx:504, where the branching is mutually exclusive
  // — `requestId` wins over `messageInterleavedContent`.
  const effectiveRequestId = requestId;

  // When this message is rendered inside an AssistantTurnGroup the parent
  // owns the DOM-capture target (so "Print" covers the whole logical turn,
  // not just the last iteration). In that case we skip our own captureRef
  // and let the parent's ref wrap the full group.
  const containerRef = hideActionBar ? undefined : captureRef;

  return (
    <div
      ref={containerRef}
      data-message-id={messageId ?? undefined}
      // `group/assistant-msg` is the hover anchor for AssistantActionBar's
      // compact-density "show on hover" behaviour. Hovering anywhere on the
      // assistant turn reveals the bar; non-compact mode keeps it visible.
      className="group/assistant-msg rounded transition-shadow"
    >
      {bufferStream && isStreamActive && !failed ? (
        <div className="flex items-center justify-center py-12">
          <BreathingOrb size={32} />
        </div>
      ) : (
        <>
          <MarkdownStream
            requestId={effectiveRequestId}
            turnId={messageId}
            conversationId={conversationId}
            messageId={messageId ?? undefined}
            content={flatText}
            isStreamActive={isStreamActive && !failed}
            hideCopyButton={true}
            allowFullScreenEditor={false}
            serverProcessedBlocks={serverProcessedBlocks}
            onContentChange={handleInlineContentChange}
          />
          {/* While content is streaming, the breathing orb trails just below
              it, moving down as the message grows, then unmounts at completion
              (its slot becomes the action bar). The pre-token / "waiting for
              the server" beat is owned by the markdown engine's ShimmerText
              ("Processing…"), so the orb deliberately stays out of the
              connecting / pre_token window — no two indicators at once. */}
          {isStreamActive &&
            !failed &&
            (phase === "text_streaming" || phase === "interstitial") && (
              <BreathingOrb className="mt-1.5" size={24} />
            )}
        </>
      )}
      {/* Failed turn WITH content: the error renders BELOW everything that
          already streamed — never instead of it. EXCEPT when the error was
          mid-turn (`hasInlineError`): then EnhancedChatMarkdown already placed
          it at its chronological spot inline, so the trailing copy is
          suppressed to avoid a duplicate that floats to the bottom. */}
      {!hasInlineError && failedError}
      {messageId && (
        <MessageFilesStrip
          conversationId={conversationId}
          messageId={messageId}
        />
      )}
      {!hideActionBar && !isStreamActive && !failed && messageId && (
        <AssistantActionBar
          messageId={messageId}
          conversationId={conversationId}
          onFullPrint={handleFullPrint}
          isCapturing={isCapturing}
          surfaceKey={surfaceKey}
        />
      )}
    </div>
  );
}
