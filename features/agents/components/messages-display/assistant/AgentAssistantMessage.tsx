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

import {
  startTransition,
  useCallback,
  useMemo,
  useState,
  useEffect,
  useRef,
} from "react";
import MarkdownStream from "@/components/MarkdownStream";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { PrefillNote } from "@/features/agents/message-flags/PrefillNote";
import { useDebugContext } from "@/hooks/useDebugContext";
import {
  selectErrorIsFatal,
  selectRequestError,
  selectRenderBlockCount,
  selectAnswerBlockCount,
  selectHasInlineError,
  selectProviderRetry,
  selectLiveCitationSources,
  selectVisibleWarnings,
  selectRequestAwaitingPerson,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { selectBufferStream } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectStreamPhase } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import {
  selectMessageById,
  extractFlatText,
  extractContentBlocks,
  isFailedRecord,
  extractRecordError,
  selectIsLatestAssistantMessage,
  persistedBodyBlocks,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import {
  isAttachmentMessagePart,
  isInlineAssistantMedia,
} from "@/features/agents/components/context-items/normalize";
import { MessageAttachmentStrip } from "../MessageAttachmentStrip";
import {
  buildMessageCitationIndex,
  type MessageCitationSource,
} from "@/features/agents/redux/execution-system/messages/message-citations";
import { MessageCitationsProvider } from "@/components/mardown-display/chat-markdown/citations/MessageCitationsContext";
import { MessageSourcesRow } from "../citations/MessageSourcesRow";
import { AssistantError } from "../../run/AssistantError";
import { friendlyStreamError } from "../../run/friendlyStreamError";
import { AssistantWarning } from "../../run/AssistantWarning";
import { BreathingOrb } from "./BreathingOrb";
import {
  AssistantMessageContextMenu,
  AssistantMessageFooter,
} from "./AssistantMessageFooter";
import { AssistantNoAnswer } from "./AssistantNoAnswer";
import { selectInstanceStatus } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import {
  countPersonVisibleParts,
  isAnswerlessTurn,
  rowAsksThePerson,
} from "./answerless-turn";
import { retryConversationTurn } from "@/features/agents/redux/execution-system/message-crud/retry-turn.thunk";
import { commitInlineContentEdit } from "@/features/agents/redux/execution-system/message-crud/commit-inline-edit.thunk";
import { InPlaceAnswerEditor } from "./InPlaceAnswerEditor";
import { toast } from "@/lib/toast";
import { useDomCapturePrint } from "@/features/conversation/hooks/useDomCapturePrint";
import { MessageFilesStrip } from "@/features/code/views/history/MessageFilesStrip";
import { ProviderRetryCard } from "./ProviderRetryCard";
import {
  sendProviderRetryControl,
  type ProviderRetryControlAction,
} from "@/features/agents/redux/execution-system/thunks/provider-retry-control.thunk";
import {
  isWarRoomThreadAgentSurface,
  traceWarRoomRenderPath,
} from "@/features/war-room/utils/renderPathTrace";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

const _NO_LIVE_SOURCES: MessageCitationSource[] = [];
const _selectNoLiveSources = () => _NO_LIVE_SOURCES;

interface AgentAssistantMessageProps {
  conversationId: string;
  requestId?: string;
  /** Server-assigned `cx_message.id` — present for committed and DB-loaded turns. */
  messageId?: string;
  isStreamActive?: boolean;
  streamSlotStart?: number;
  streamSlotEnd?: number;
  /**
   * Optional surface key for routing fork / retry outcomes via the
   * surfaces registry. Threaded down to AssistantMessageFooter.
   */
  surfaceKey?: string;
  compact?: boolean;
  /**
   * Suppress the per-message AssistantMessageFooter. Used by AssistantTurnGroup
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
  /** Chat cold-load only: show a short text skeleton before DB markdown mounts. */
  deferColdMarkdown?: boolean;
  /**
   * False for the intermediate iterations of a multi-step agentic turn. Only
   * the LAST member of a turn carries the answer, so only it may say "this run
   * produced no answer" — see `answerless-turn.ts`. Defaults to true, which is
   * correct for every single-message surface.
   */
  isTurnAnswer?: boolean;
}

export function AgentAssistantMessage({
  conversationId,
  requestId,
  messageId,
  isStreamActive = false,
  streamSlotStart,
  streamSlotEnd,
  surfaceKey,
  hideActionBar = false,
  canRetry = false,
  deferColdMarkdown = false,
  isTurnAnswer = true,
}: AgentAssistantMessageProps) {
  useDebugContext("AgentAssistantMessage");

  useEffect(() => {
    if (!isWarRoomThreadAgentSurface(surfaceKey)) return;
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
  const shouldDeferColdMarkdown =
    deferColdMarkdown && !requestId && !!messageId && !isStreamActive;
  const [coldMarkdownSettledMessageId, setColdMarkdownSettledMessageId] =
    useState<string | null>(null);
  const coldMarkdownReady =
    !shouldDeferColdMarkdown || coldMarkdownSettledMessageId === messageId;
  const [providerRetryBusyAction, setProviderRetryBusyAction] =
    useState<ProviderRetryControlAction | null>(null);

  useEffect(() => {
    if (!shouldDeferColdMarkdown || !messageId) return undefined;
    const timer = window.setTimeout(() => {
      startTransition(() => setColdMarkdownSettledMessageId(messageId));
    }, 140);
    return () => window.clearTimeout(timer);
  }, [shouldDeferColdMarkdown, messageId]);

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
  const visibleWarningsSelector = useMemo(
    () => (requestId ? selectVisibleWarnings(requestId) : () => undefined),
    [requestId],
  );
  const visibleWarnings = useAppSelector(visibleWarningsSelector);
  const providerRetry = useAppSelector(
    requestId ? selectProviderRetry(requestId) : () => null,
  );
  const phase = useAppSelector(selectStreamPhase(conversationId));
  const agentIdForDoor = useAppSelector(
    (s) => s.conversations.byConversationId[conversationId]?.agentId ?? null,
  );

  const record = useAppSelector(
    messageId ? selectMessageById(conversationId, messageId) : () => undefined,
  );

  // The pencil (registry `edit`) turned this answer's spot into the editor.
  const editingInPlace = !!record?._editingInPlace && !isStreamActive;

  // Request-wide notices and source lists belong to its final segment. They
  // must not keep growing above a steering message after this segment closes.
  const isClosedStreamSegment =
    (streamSlotEnd ?? record?._streamSlotEnd) !== undefined;

  // Plain-text projection for action bar (copy / print / share) — always
  // marker-free.
  const flatText = extractFlatText(record);

  // Settle-time citations: deduped numbered source list + per-block inline
  // marker positions, built from the persisted text parts' `citations`
  // arrays (canonical NormalizedCitation contract — see
  // features/agents/redux/execution-system/messages/message-citations.ts).
  // When the message carries citations, the RENDERED text gets inline
  // `<matrxcite n="…" />` markers (numbered superscript chips); the plain
  // `flatText` above stays untouched for copy/TTS/share.
  const citationIndex = useMemo(
    () => buildMessageCitationIndex(extractContentBlocks(record)),
    [record],
  );
  const hasCitations = citationIndex.sources.length > 0;
  // The RENDERED text keeps reasoning written inside text parts: the renderer
  // draws it (never the copy/TTS text) — stripping it here destroyed content
  // the screen was meant to show (RC-B3r R2).
  const renderedText = useMemo(
    () => extractFlatText(record, { withCitationMarkers: hasCitations, keepInlineThinking: true }),
    [record, hasCitations],
  );

  // An ASSISTANT turn's generated media is CONTENT, not an attachment: an
  // image, an audio clip, or a video the model produced renders inline with
  // its player / lightbox / action bar (UnifiedImageBlockRenderer,
  // AudioOutputBlockRenderer, UnifiedVideoBlockRenderer). Only the remaining
  // attachment kinds (documents, YouTube refs, resource parts) belong on the
  // chip strip. Routing generated media to the strip turned a produced
  // podcast into an "Unknown file" pill with no way to play it.
  const attachmentParts = extractContentBlocks(record).filter(
    (b) => isAttachmentMessagePart(b) && !isInlineAssistantMedia(b),
  );

  // Live-stream citations: while this turn renders from the streaming source
  // (requestId set — the whole session, per the lifetime rule), sources come
  // from the request's accumulated `citation` events via the SAME dedupe/
  // numbering core. The persisted index wins when it has data (reloaded
  // turns); otherwise the live index feeds the inline chips + sources row —
  // both are index-shape-agnostic.
  const liveSourcesSelector = useMemo(
    () =>
      requestId ? selectLiveCitationSources(requestId) : _selectNoLiveSources,
    [requestId],
  );
  const liveCitationSources = useAppSelector(liveSourcesSelector);
  const displaySources = hasCitations
    ? citationIndex.sources
    : liveCitationSources;

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
    const blocks = persistedBodyBlocks(record, {
      isSelfRendered: (part) => EXCLUDED.has(part.type ?? ""),
      keepAttachmentInline: isInlineAssistantMedia,
    });
    return blocks.length === 0 ? undefined : blocks;
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
    (newContent: string, previousContent: string) => {
      if (!messageId) return;
      dispatch(
        commitInlineContentEdit({
          conversationId,
          messageId,
          requestId,
          newText: newContent,
          previousText: previousContent,
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

  const handleProviderRetryControl = useCallback(
    async (action: ProviderRetryControlAction) => {
      if (!requestId) return;
      setProviderRetryBusyAction(action);
      try {
        await dispatch(
          sendProviderRetryControl({ requestId, action }),
        ).unwrap();
        toast.success(
          action === "retry_now" ? "Retry requested" : "Cancel requested",
        );
      } catch (err) {
        const message =
          typeof err === "string"
            ? err
            : err instanceof Error
              ? err.message
              : "Provider control failed";
        toast.error(message);
      } finally {
        setProviderRetryBusyAction(null);
      }
    },
    [dispatch, requestId],
  );

  // A turn is failed when the live request errored (in-session) OR the
  // persisted record is `status='failed'` / `metadata.failed` (reloaded from
  // the DB, or stamped mid-stream via record_update). Both render the same
  // error treatment so a live failure and a reloaded one look identical. The
  // failed turn stays in history; retry (when offered) re-runs it without
  // deleting anything. See CONVERSATION_FAILURE_AND_RETRY_FE_GUIDE.md.
  const failed =
    (!isClosedStreamSegment && isFatalError) || isFailedRecord(record);

  // Did anything actually stream/persist for this turn? Drives the failed
  // layout: a turn that already produced content renders that content WITH
  // the error appended BELOW it — an error must NEVER wipe what the user
  // already received (heartbeat timeouts routinely kill streams that are
  // 90% delivered, and the server usually finishes the turn anyway). Only
  // a turn that died before producing anything renders error-only.
  const streamedBlockCount = useAppSelector(
    requestId ? selectRenderBlockCount(requestId) : () => 0,
  );

  // What this turn actually STREAMED onto the screen as an answer (thinking
  // and tool work excluded). While the turn renders from its stream source —
  // the whole session, per the lifetime rule above — this is what the person
  // is reading, and `renderedText` (the persisted row) may still be empty.
  // Walk 18, defect C: asking only the row printed "This run finished without
  // writing an answer" under a 170-word question. See `answerless-turn.ts`.
  const streamedAnswerBlockCount = useAppSelector(
    requestId ? selectAnswerBlockCount(requestId) : () => 0,
  );

  // Is this the conversation's newest assistant turn? Retry re-runs the LAST
  // turn, so the "Run it again" remedy is only honest here — a control on an
  // older turn would re-run something else. (Law 4: the remedy a person is
  // told to use must exist, and must do what the sentence says.)
  const isLatestAssistantMessage = useAppSelector(
    messageId
      ? selectIsLatestAssistantMessage(conversationId, messageId)
      : () => false,
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
    attachmentParts.length > 0 ||
    (serverProcessedBlocks?.length ?? 0) > 0 ||
    streamedBlockCount > 0;

  // A run that finished and produced NOTHING says so, in words, with a remedy —
  // never an empty bubble wearing a like/copy/speak bar (see answerless-turn.ts).
  const instanceStatus = useAppSelector(selectInstanceStatus(conversationId));
  // A turn parked on the person (an open ask) is WAITING, not finished — the
  // ask's card is its status. Live: the stream said so. Reloaded: the row ends
  // on the asking tool call.
  const requestAwaitingPerson = useAppSelector(
    requestId ? selectRequestAwaitingPerson(requestId) : () => false,
  );
  const answerless = isAnswerlessTurn({
    isTurnAnswer,
    isStreamActive,
    awaitingPerson:
      instanceStatus === "paused" ||
      requestAwaitingPerson ||
      rowAsksThePerson(extractContentBlocks(record)),
    failed,
    coldMarkdownReady,
    messageId,
    renderedText,
    attachmentCount: attachmentParts.length,
    mediaBlockCount: serverProcessedBlocks?.length ?? 0,
    typedPartCount: countPersonVisibleParts(extractContentBlocks(record)),
    streamedAnswerBlockCount,
  });

  const showProviderRetry =
    !isClosedStreamSegment &&
    providerRetry !== null &&
    (isStreamActive || providerRetry.state !== "recovered");

  useEffect(() => {
    if (!isWarRoomThreadAgentSurface(surfaceKey)) return;
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
        const code =
          streamError?.code ??
          (streamError?.details &&
          typeof streamError.details === "object" &&
          "status_code" in streamError.details
            ? (streamError.details as { status_code?: string | number })
                .status_code
            : undefined);
        // 🚨 NEVER THE RAW EXCEPTION IN THE THREAD (cold walk 5, finding 7).
        // This used to fall straight through to `streamError.message`, so a
        // 409 carrying no `user_message` printed "A conversation with
        // id='40dd2c57-…' already exists … Pass is_new=false to continue it"
        // inside a live Vision Interview, between the reply and the composer.
        // The bubble now shows a declared sentence with its remedy and the raw
        // text keeps its place under Details. See `friendlyStreamError.ts`.
        const spoken = friendlyStreamError({
          userMessage: streamError?.user_message ?? null,
          message: streamError?.message ?? null,
          errorType: streamError?.error_type ?? null,
          code: typeof code === "string" ? code : null,
          recordError,
        });
        const friendly = spoken.message;
        const detail = spoken.detail ?? undefined;
        return (
          <AssistantError
            message={friendly}
            detail={detail}
            errorType={streamError?.error_type}
            code={code}
            door={readErrorDoor(streamError?.details)}
            details={streamError?.details}
            agentId={agentIdForDoor}
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
        <ErrorAlchemyMenu error={failedError} />
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

  const body = (
    <div
      ref={containerRef}
      data-message-id={messageId ?? undefined}
      // `group/assistant-msg` is the hover anchor for AssistantMessageFooter's
      // compact-density "show on hover" behaviour. Hovering anywhere on the
      // assistant turn reveals the bar; non-compact mode keeps it visible.
      className="group/assistant-msg rounded transition-shadow"
    >
      {!coldMarkdownReady ? (
        <AssistantMarkdownSkeleton />
      ) : bufferStream && isStreamActive && !failed ? (
        <>
          {showProviderRetry && providerRetry && (
            <ProviderRetryCard
              retry={providerRetry}
              busyAction={providerRetryBusyAction}
              onCancel={() => handleProviderRetryControl("cancel")}
              onRetryNow={() => handleProviderRetryControl("retry_now")}
            />
          )}
          <div className="flex items-center justify-center py-12">
            <BreathingOrb size={48} />
          </div>
        </>
      ) : (
        <>
          {showProviderRetry && providerRetry && (
            <ProviderRetryCard
              retry={providerRetry}
              busyAction={providerRetryBusyAction}
              onCancel={() => handleProviderRetryControl("cancel")}
              onRetryNow={() => handleProviderRetryControl("retry_now")}
            />
          )}
          <MessageAttachmentStrip
            conversationId={conversationId}
            parts={attachmentParts}
            className="mb-2"
          />
          {editingInPlace && messageId ? (
            <InPlaceAnswerEditor
              conversationId={conversationId}
              messageId={messageId}
              startExpanded={record?._editingInPlace === "expanded"}
            />
          ) : (
          <div data-message-content>
            <MarkdownStream imagePolicy="ai"
              requestId={effectiveRequestId}
              streamSlotStart={streamSlotStart ?? record?._streamSlotStart}
              streamSlotEnd={streamSlotEnd ?? record?._streamSlotEnd}
              turnId={messageId}
              conversationId={conversationId}
              messageId={messageId ?? undefined}
              content={renderedText}
              isStreamActive={isStreamActive && !failed}
              hideCopyButton={true}
              allowFullScreenEditor={false}
              serverProcessedBlocks={serverProcessedBlocks}
              onContentChange={handleInlineContentChange}
              // The render follows the STORE, never a renderer-local draft:
              // an in-body edit shows through the optimistic Redux update,
              // and a refused save puts the stored row back on screen
              // (commitInlineContentEdit) — a local copy would keep showing
              // text that was never saved.
              applyLocalEdits={false}
            />
          </div>
          )}
          {/* Per-message citation sources footer — numbered chips matching
              the inline markers above; renders only when sources exist.
              During a live stream it appears as soon as the first citation
              event lands and grows as sources accumulate. */}
          {!isClosedStreamSegment && displaySources.length > 0 && (
            <MessageSourcesRow sources={displaySources} className="mt-2" />
          )}
          {!isStreamActive && <PrefillNote metadata={record?.metadata} />}
          {/* While content is streaming, the breathing orb trails just below
              it, moving down as the message grows, then unmounts at completion
              (its slot becomes the action bar). The pre-token / "waiting for
              the server" beat is owned by the markdown engine's ShimmerText
              ("Processing…"), so the orb deliberately stays out of the
              connecting / pre_token window — no two indicators at once. */}
          {isStreamActive &&
            !failed &&
            (phase === "text_streaming" || phase === "interstitial") && (
              <BreathingOrb className="mt-1.5" size={48} />
            )}
        </>
      )}
      {/* Failed turn WITH content: the error renders BELOW everything that
          already streamed — never instead of it. EXCEPT when the error was
          mid-turn (`hasInlineError`): then EnhancedChatMarkdown already placed
          it at its chronological spot inline, so the trailing copy is
          suppressed to avoid a duplicate that floats to the bottom. */}
      {!isClosedStreamSegment &&
        visibleWarnings?.map((warning, index) => (
          <AssistantWarning
            key={`${warning.code}-${index}`}
            warning={warning}
          />
        ))}
      {answerless && (
        <AssistantNoAnswer
          // The remedy is "run it again", so the control has to be there. It
          // rides on the newest assistant turn (what `retryConversationTurn`
          // actually re-runs); on an older turn the notice states the fact
          // without offering a button that would re-run the wrong turn.
          onRetry={
            canRetry || isLatestAssistantMessage ? handleRetry : undefined
          }
          retrying={retrying}
        />
      )}
      {!hasInlineError && failedError}
      {messageId && (
        <MessageFilesStrip
          conversationId={conversationId}
          messageId={messageId}
        />
      )}
      {!hideActionBar && !isStreamActive && !failed && messageId && !editingInPlace && (
        <AssistantMessageFooter
          messageId={messageId}
          conversationId={conversationId}
          onFullPrint={handleFullPrint}
          isCapturing={isCapturing}
          surfaceKey={surfaceKey}
        />
      )}
    </div>
  );

  return (
    // Citation sources ride context down to the inline `<matrxcite>` marker
    // chips rendered deep inside the markdown tree (CitationMarkerInline).
    // `displaySources` covers both halves: persisted index for settled /
    // reloaded turns, live request-derived index while streaming.
    <MessageCitationsProvider sources={displaySources}>
    {messageId ? (
      // Right-click = the ONE action registry, the same actions as the ⋯
      // menu (RC-B6). Innermost menu wins over the conversation-level one.
      <AssistantMessageContextMenu
        messageId={messageId}
        conversationId={conversationId}
        onFullPrint={handleFullPrint}
        isCapturing={isCapturing}
        surfaceKey={surfaceKey}
        suppressed={isStreamActive}
      >
        {body}
      </AssistantMessageContextMenu>
    ) : (
      body
    )}
    </MessageCitationsProvider>
  );
}

/** A failure's own door, carried on `error.details.door` by the client. */
function readErrorDoor(
  details: unknown,
): { label: string; href: string } | null {
  if (!details || typeof details !== "object") return null;
  const door = (details as { door?: unknown }).door;
  if (!door || typeof door !== "object") return null;
  const { label, href } = door as { label?: unknown; href?: unknown };
  return typeof label === "string" && typeof href === "string" && href.startsWith("/")
    ? { label, href }
    : null;
}

function AssistantMarkdownSkeleton() {
  return (
    <div className="space-y-2 py-1" aria-hidden>
      <div className="h-3.5 w-[96%] animate-pulse rounded bg-muted/55" />
      <div className="h-3.5 w-[88%] animate-pulse rounded bg-muted/50" />
      <div className="h-3.5 w-[72%] animate-pulse rounded bg-muted/45" />
      <div className="h-3.5 w-[94%] animate-pulse rounded bg-muted/40" />
      <div className="h-3.5 w-[42%] animate-pulse rounded bg-muted/35" />
    </div>
  );
}
