"use client";

/**
 * The body of a conversation-context canvas tab: the chat package's ContextRulesPanel.
 *
 * The tab is bound to the conversation it was opened for (its key) and says
 * which — "Transcripts · Huddle supply order list" — so a tab restored from an
 * earlier session beside a DIFFERENT chat can never pass for that chat's
 * values. A conversation this session has not loaded is loaded first: its
 * rows are never computed from an empty store (they used to show the first
 * turn's system values a chat with history would never send, 2026-10-03).
 */

import { useEffect, useState } from "react";
import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { canvasRecord, canvasText, subjectTitle, useCanvasTabTitle } from "@/features/canvas/host/toolCanvas";
import { ContextRulesPanel } from "@ai-matrx/chat/agents/components/context-policies-display/ContextRulesPanel";
import { selectConversationTitle } from "@ai-matrx/chat/agents/redux/execution-system/conversations/conversations.selectors";
import { loadConversation } from "@ai-matrx/chat/agents/redux/execution-system/thunks/load-conversation.thunk";
import { Skeleton } from "@ai-matrx/design-system";
import { CONVERSATION_CONTEXT_LABEL, readConversationContextTab } from "./conversationContextKind";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
export default function ConversationContextCanvasView({ data, item, canvas, presentation }: CanvasKindProps) {
  const tab = readConversationContextTab(data);
  const conversationId = tab?.conversationId ?? null;
  const dispatch = useAppDispatch();
  const loaded = useAppSelector((state) =>
    conversationId ? Boolean(state.conversations.byConversationId[conversationId]) : false,
  );
  const chatTitle = useAppSelector((state) =>
    conversationId ? selectConversationTitle(conversationId)(state) : null,
  );
  const [failed, setFailed] = useState<string | null>(null);

  // The tab names the chat it belongs to — never a bare "Surface values" that
  // could be read as the chat beside it.
  const what = canvasText(data, "title") || CONVERSATION_CONTEXT_LABEL;
  useCanvasTabTitle(canvas, item, chatTitle?.trim() ? subjectTitle(what, chatTitle) : "");

  useEffect(() => {
    if (!conversationId || loaded) return undefined;
    let live = true;
    setFailed(null);
    dispatch(loadConversation({ conversationId }))
      .unwrap()
      .catch((error: unknown) => {
        console.error(`[canvas] values tab could not load conversation "${conversationId}"`, error);
        if (live) setFailed(error instanceof Error ? error.message : "Could not open this chat");
      });
    return () => {
      live = false;
    };
  }, [dispatch, conversationId, loaded]);

  if (!tab) return null;
  if (!loaded) {
    if (failed) {
      return (
        <div data-error-box className="p-4 type-body text-muted-foreground" data-values-tab-state="unavailable">
          This chat could not be opened.
        <ErrorAlchemyMenu /></div>
      );
    }
    return (
      <div className="flex flex-col gap-2 p-3" data-values-tab-state="loading" aria-busy="true">
        <Skeleton shape="title" width="2/3" />
        <Skeleton shape="title" />
        <Skeleton shape="title" width="3/4" />
      </div>
    );
  }
  return (
    <ContextRulesPanel
      conversationId={tab.conversationId}
      agentId={tab.agentId}
      selectedKey={tab.selected}
      // A narrow pane gets one column: the list, then the value with Back.
      narrow={presentation.isNarrow}
      // The selection lives on the tab, so the composer's pills and a reload agree.
      onSelectedKeyChange={(key) =>
        void canvas.update(item.id, { data: { ...canvasRecord(data), selected: key } })
      }
    />
  );
}
