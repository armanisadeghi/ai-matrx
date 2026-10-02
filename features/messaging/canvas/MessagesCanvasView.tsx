"use client";

/**
 * The body of the Messages canvas tab. The pane header names the tab and
 * carries its menu; the thread's own header carries Back.
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background" data-messages-canvas>
      {conversationId ? (
        <ConversationPane
          conversationId={conversationId}
          className="flex-1"
          onBack={() => host?.engine.store.setActiveConversation(null)}
          onSelectConversation={(id) => void host?.engine.openConversation(asConversationId(id))}
        />
      ) : (
        <ConversationListPane className="flex-1" />
      )}
    </div>
  );
}
