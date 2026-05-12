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

import { useCallback, useMemo, useState } from "react";
import MarkdownStream from "@/components/MarkdownStream";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useDebugContext } from "@/hooks/useDebugContext";
import { selectErrorIsFatal } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { selectBufferStream } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import {
  selectMessageById,
  extractFlatText,
  extractContentBlocks,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { normalizeContentBlocks } from "@/features/agents/redux/execution-system/utils/normalize-content-blocks";
import { AssistantError } from "../../run/AssistantError";
import { AssistantActionBar } from "./AssistantActionBar";
import { RetryConfirmDialog } from "@/features/agents/components/messages-display/message-options/RetryConfirmDialog";
import { atomicRetry } from "@/features/agents/redux/execution-system/message-crud/atomic-retry.thunk";
import { Button } from "@/components/ui/button";
import { Loader2, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { useDomCapturePrint } from "@/features/conversation/hooks/useDomCapturePrint";
import { MessageFilesStrip } from "@/features/code/views/history/MessageFilesStrip";

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
}

export function AgentAssistantMessage({
  conversationId,
  requestId,
  messageId,
  isStreamActive = false,
  surfaceKey,
}: AgentAssistantMessageProps) {
  useDebugContext("AgentAssistantMessage");

  const dispatch = useAppDispatch();
  const [retryDialogOpen, setRetryDialogOpen] = useState(false);

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

  const canRetry = Boolean(messageId);

  const handleRetry = useCallback(async () => {
    if (!messageId) return;
    try {
      await dispatch(
        atomicRetry({
          conversationId,
          failedMessageId: messageId,
        }),
      ).unwrap();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err && "message" in err
            ? String((err as { message?: string }).message)
            : "Retry failed";
      toast.error(message);
    }
  }, [dispatch, conversationId, messageId]);

  if (isFatalError) {
    return (
      <div className="flex flex-col gap-2 mt-1">
        <AssistantError error="An error occurred during streaming." />
        {canRetry && (
          <div className="ml-10">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setRetryDialogOpen(true)}
            >
              <RotateCw className="w-3.5 h-3.5" />
              Retry from scratch
            </Button>
          </div>
        )}
        {messageId && (
          <RetryConfirmDialog
            open={retryDialogOpen}
            onOpenChange={setRetryDialogOpen}
            failedMessageId={messageId}
            onConfirm={handleRetry}
          />
        )}
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

  return (
    <div
      ref={captureRef}
      data-message-id={messageId ?? undefined}
      // `group/assistant-msg` is the hover anchor for AssistantActionBar's
      // compact-density "show on hover" behaviour. Hovering anywhere on the
      // assistant turn reveals the bar; non-compact mode keeps it visible.
      className="group/assistant-msg rounded transition-shadow"
    >
      {bufferStream && isStreamActive ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Working on it…</p>
        </div>
      ) : (
        <MarkdownStream
          requestId={effectiveRequestId}
          turnId={messageId}
          conversationId={conversationId}
          messageId={messageId ?? undefined}
          content={flatText}
          isStreamActive={isStreamActive}
          hideCopyButton={true}
          allowFullScreenEditor={false}
          serverProcessedBlocks={serverProcessedBlocks}
        />
      )}
      {messageId && (
        <MessageFilesStrip
          conversationId={conversationId}
          messageId={messageId}
        />
      )}
      {!isStreamActive && messageId && (
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
