"use client";

/**
 * The body of the Messages canvas tab. The pane header names the tab and
 * carries its menu; the thread's own header carries Back.
 *
 * THE PANE'S WIDTH DECIDES, NOT THE WINDOW'S (2026-10-03). A canvas pane on a
 * desktop is 360–900px wide; the thread's Back was hidden by a VIEWPORT query
 * (≥768px), so a thread in a 628–751px pane had no way back to the list.
 * The root is a size container (`@container/messages`): wide enough for both
 * (42rem), the list sits beside the open thread and Back is not drawn; narrower,
 * one at a time with Back (`messages-native.css`).
 */

import { asConversationId } from "@ai-matrx/messaging";
import { useMessagingHost, useMessagingSnapshot } from "@ai-matrx/messaging/react";
import { ConversationListPane } from "../components/ConversationListPane";
import { ConversationPane } from "../components/ConversationPane";

export default function MessagesCanvasView() {
  const host = useMessagingHost();
  const snapshot = useMessagingSnapshot();
  const conversationId = snapshot?.activeConversationId ?? null;
  return (
    <div
      className="@container/messages flex h-full min-h-0 overflow-hidden bg-background"
      data-messages-canvas
    >
      {conversationId ? (
        <>
          <div className="hidden min-h-0 w-72 shrink-0 flex-col border-r border-border @2xl/messages:flex">
            <ConversationListPane className="min-h-0 flex-1" />
          </div>
          <ConversationPane
            conversationId={conversationId}
            className="min-w-0 flex-1"
            onBack={() => host?.engine.store.setActiveConversation(null)}
            onSelectConversation={(id) => void host?.engine.openConversation(asConversationId(id))}
          />
        </>
      ) : (
        <ConversationListPane className="flex-1" />
      )}
    </div>
  );
}
