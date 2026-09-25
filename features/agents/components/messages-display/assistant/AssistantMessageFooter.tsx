"use client";

/**
 * AssistantMessageFooter — what sits under an assistant turn in /chat.
 *
 * Every action comes from the ONE rich-document action registry through
 * <RichDocumentActions/> — the same bar a note, a study guide or the proving
 * route draws: thumbs (with the live verdict), read aloud, the pencil,
 * Regenerate, Continue in chat, the Alchemy copy menu and the ⋯ menu with
 * every other action. The dialogs those actions ask for (delete-vs-fork, edit
 * history, convert, save table, flashcard, review-and-apply) are owned by the
 * ONE document dialogs host. This file only derives the chat facts the
 * registry needs and keeps the chat-only strips under the bar (timestamp, the
 * negative-verdict follow-up, the Rulebook nudge). RC-B6 deleted the
 * hand-built AssistantActionBar this replaces.
 *
 * id-only contract: receives `messageId` + `conversationId`; everything else
 * is read from Redux.
 */

import React, { useEffect, useRef, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { cn } from "@/lib/utils";
import { RichDocumentActions } from "@/features/rich-document/RichDocumentActions";
import { RegistryContextMenu } from "@/features/rich-document/RegistryContextMenu";
import { buildChatMessageActions } from "@/features/rich-document/chat/chatMessageActions";
import {
  convertOriginForSource,
  useDocumentDialogsHost,
} from "@/features/rich-document/hosts/DocumentDialogsHost";
import { useOutputFeedback } from "@/lib/output-feedback/useOutputFeedback";
import { NegativeVerdictFollowUp } from "@/features/review-walk/components/NegativeVerdictFollowUp";
import { RulebookNudge } from "@/features/masterwork/oracle/RulebookNudge";
import { precedingQuestion } from "@/features/masterwork/oracle/service";
import {
  selectMessageById,
  selectOrderedMessageIds,
  selectMessagePosition,
  selectIsLatestAssistantMessage,
  extractFlatText,
  extractInspectableText,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import {
  selectAgentIdFromInstance,
  selectConversationTitle,
} from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { selectAgentIsConfirmedOwner } from "@/features/agents/redux/agent-definition/selectors";
import {
  selectResponseDensity,
  selectShowAssistantMessageOptions,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { buildConversationMessageTitle } from "@/features/agents/utils/conversation-message-title";
import { resolveAssistantEditTarget } from "../message-options/resolveAssistantEditTarget";
import { MessageTimestamp } from "../MessageTimestamp";

export interface AssistantMessageFooterProps {
  /** Server `cx_message.id`. */
  messageId: string;
  /** Server `cx_conversation.id`. */
  conversationId: string;
  /** Full-page print handler (DOM capture to PDF). */
  onFullPrint?: () => void;
  isCapturing?: boolean;
  /** UI surface — fork / delete outcomes route through the surfaces registry. */
  surfaceKey?: string;
  /**
   * Every assistant `cx_message.id` of a multi-iteration turn, in order. Copy
   * / read-aloud / save cover the whole turn; edit targets the text-bearing
   * row; like / delete stay on `messageId`.
   */
  groupMessageIds?: string[];
}

/**
 * Everything a chat assistant turn's registry actions need — the ONE place the
 * footer bar and the message's right-click menu get it from, so both offer the
 * same actions over the same facts.
 */
export function useAssistantMessageActions({
  messageId,
  conversationId,
  onFullPrint,
  isCapturing,
  surfaceKey,
  groupMessageIds,
}: AssistantMessageFooterProps) {
  const record = useAppSelector(selectMessageById(conversationId, messageId));
  const messagePosition = useAppSelector(
    selectMessagePosition(conversationId, messageId),
  );
  const density = useAppSelector(selectResponseDensity(conversationId));
  const showOptions = useAppSelector(
    selectShowAssistantMessageOptions(conversationId),
  );
  const isLatestAssistant = useAppSelector(
    selectIsLatestAssistantMessage(conversationId, messageId),
  );
  const conversationTitle = useAppSelector(selectConversationTitle(conversationId));
  const agentId = useAppSelector(selectAgentIdFromInstance(conversationId));
  // Creator tools only for the agent's confirmed owner (never flash).
  const isCreator = useAppSelector((s) =>
    agentId ? selectAgentIsConfirmedOwner(s, agentId) : false,
  );
  const byId = useAppSelector(
    (state: RootState) => state.messages.byConversationId[conversationId]?.byId,
  );
  const orderedIds = useAppSelector(selectOrderedMessageIds(conversationId));

  // The raw-faithful view: flat text, or the JSON of a structured payload.
  const inspectable = extractInspectableText(record);
  const content = inspectable.text;
  const contentHistoryCount = Array.isArray(record?.contentHistory)
    ? record.contentHistory.length
    : 0;
  const metadata = record?.metadata
    ? (record.metadata as Record<string, unknown>)
    : null;

  const groupParts =
    groupMessageIds && groupMessageIds.length > 1 && byId
      ? groupMessageIds
          .map((id) => extractFlatText(byId[id]))
          .filter((text) => text.length > 0)
      : [];
  const aggregatedContent = groupParts.length > 0 ? groupParts.join("\n\n") : null;
  const turnText = aggregatedContent ?? content;

  const editTarget = resolveAssistantEditTarget(
    groupMessageIds,
    byId,
    messageId,
    content,
    inspectable.isStructuredRaw,
  );

  // THE ORACLE TAP's question half — the user turn this answer replied to.
  const answeredQuestion = byId
    ? precedingQuestion(
        orderedIds.map((id) => {
          const rec = byId[id];
          const text = rec?.content;
          return {
            id,
            role: String(rec?.role ?? ""),
            content: typeof text === "string" ? text : extractFlatText(rec),
          };
        }),
        messageId,
      )
    : null;

  // The Rulebook nudge fires on an ACTIVE verdict click — never on hydration,
  // never on a retraction. The registry thumbs write the ONE store; this
  // reads it and counts each new verdict landed after the first load.
  const { verdict, isLoaded } = useOutputFeedback({
    subjectType: "message",
    subjectId: messageId,
    skipFetch: true,
  });
  const [verdictClickCount, setVerdictClickCount] = useState(0);
  const lastVerdict = useRef<{ loaded: boolean; verdict: typeof verdict }>({
    loaded: false,
    verdict: null,
  });
  useEffect(() => {
    const prev = lastVerdict.current;
    if (prev.loaded && verdict && verdict !== prev.verdict) {
      setVerdictClickCount((n) => n + 1);
    }
    lastVerdict.current = { loaded: isLoaded, verdict };
  }, [verdict, isLoaded]);

  const dialogsHost = useDocumentDialogsHost({
    convertOrigin: convertOriginForSource(
      { type: "chat-message", conversationId, messageId },
      buildConversationMessageTitle(conversationTitle, messagePosition) ??
        "Chat response",
    ),
    text: turnText,
    writable: !inspectable.isStructuredRaw,
    chatMessage: { conversationId, messageId, surfaceKey: surfaceKey ?? null },
  });

  // THE ONE chat → registry builder (shared with the proving route).
  const config = buildChatMessageActions({
    conversationId,
    messageId,
    role: "assistant",
    messageContent: content,
    contentIsStructuredRaw: inspectable.isStructuredRaw,
    turnContent: aggregatedContent,
    editTarget,
    metadata,
    streamRequestId: record?._streamRequestId ?? null,
    contentHistoryCount,
    groupMessageIds,
    isCreator,
    surfaceKey: surfaceKey ?? null,
    showFullPrint: Boolean(onFullPrint),
    isCapturing: Boolean(isCapturing),
    callbacks: { ...dialogsHost.callbacks, onFullPrint },
  });

  return {
    config,
    dialogsHost,
    record,
    content,
    turnText,
    agentId,
    answeredQuestion,
    verdictClickCount,
    density,
    showOptions,
    isLatestAssistant,
  };
}

export function AssistantMessageFooter(props: AssistantMessageFooterProps) {
  const { messageId, conversationId, surfaceKey } = props;
  const {
    config,
    dialogsHost,
    record,
    content,
    turnText,
    agentId,
    answeredQuestion,
    verdictClickCount,
    density,
    showOptions,
    isLatestAssistant,
  } = useAssistantMessageActions(props);

  // Compact (agentic) density: older turns reveal the bar on hover; the
  // latest answer always shows it.
  const isHoverOnly = density === "compact" && !isLatestAssistant;

  return (
    <>
      <div
        className={cn(
          "transition-opacity",
          isHoverOnly &&
            "opacity-0 group-hover/assistant-msg:opacity-100 focus-within:opacity-100",
        )}
      >
        <div className="flex items-center gap-2">
          <RichDocumentActions
            content={config.content}
            source={config.source}
            actions={config.actions}
            hideOverflow={!showOptions}
            className="px-0"
          />
          <MessageTimestamp timestamp={record?.createdAt} />
        </div>

        {/* Negative-verdict follow-up — reads the SAME output-feedback store
            the registry thumbs write. */}
        <NegativeVerdictFollowUp
          messageId={messageId}
          content={content}
          surfaceName={surfaceKey ?? null}
          agentId={agentId ?? null}
          className="mt-1"
        />

        {/* The Oracle-tap follow-up after an active verdict click. */}
        <RulebookNudge
          verdictClickCount={verdictClickCount}
          content={turnText}
          conversationId={conversationId}
          messageId={messageId}
          question={answeredQuestion}
          className="mt-1"
        />
      </div>
      {dialogsHost.dialogs}
    </>
  );
}

export default AssistantMessageFooter;

/**
 * The right-click menu over an assistant turn's content: the ONE registry
 * (RegistryContextMenu), fed by the same facts as the footer bar — so the ⋯
 * menu and right-click offer the same actions. The v3 engine's universal rows
 * (Copy, Speak, Find…) come with it. Suppressed while the turn streams.
 */
export function AssistantMessageContextMenu(
  props: AssistantMessageFooterProps & {
    suppressed?: boolean;
    children: React.ReactNode;
  },
) {
  const { suppressed, children, ...rest } = props;
  const { config, dialogsHost } = useAssistantMessageActions(rest);
  return (
    <>
      <RegistryContextMenu
        content={config.content}
        source={config.source}
        actions={config.actions}
        suppressed={suppressed}
        sourceFeature="chat"
        surfaceName="matrx-user/assistant-message"
        // The assistant-message surface declares these values (camelCase for
        // the menu's own handlers, snake_case for surface-value bindings).
        contextData={{
          conversationId: rest.conversationId,
          conversation_id: rest.conversationId,
          messageId: rest.messageId,
          message_id: rest.messageId,
        }}
      >
        {children}
      </RegistryContextMenu>
      {dialogsHost.dialogs}
    </>
  );
}
