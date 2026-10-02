"use client";

/** The body of a Quick Chat canvas tab — the chat package's QuickChatSheet, chrome in the tab header. */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { QuickChatSheet } from "@ai-matrx/chat/quick-actions/components/QuickChatSheet";
import { patchQuickChatData, readQuickChatData } from "./quickChatKind";

export default function QuickChatCanvasView({ item, data, canvas }: CanvasKindProps) {
  const tab = readQuickChatData(data);
  return (
    <QuickChatSheet
      chrome="host"
      className="h-full bg-background"
      instanceKey={item.key}
      initialConversationId={tab.conversationId ?? undefined}
      resumeAgentId={tab.agentId ?? undefined}
      showHistory={tab.history}
      newChatSignal={tab.newChat}
      onConversationChange={(ref) => patchQuickChatData(canvas, item.id, ref)}
    />
  );
}
