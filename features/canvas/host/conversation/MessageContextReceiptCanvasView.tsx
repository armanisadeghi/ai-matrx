"use client";

/** The body of a message-context-receipt canvas tab: the chat package's MessageContextReceiptView. */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { MessageContextReceiptView } from "@ai-matrx/chat/agents/components/context-policies-display/MessageContextReceipt";
import { readMessageContextReceiptTab } from "./messageContextReceiptKind";

export default function MessageContextReceiptCanvasView({ data }: CanvasKindProps) {
  const tab = readMessageContextReceiptTab(data);
  if (!tab) return null;
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <MessageContextReceiptView conversationId={tab.conversationId} messageId={tab.messageId} />
    </div>
  );
}
