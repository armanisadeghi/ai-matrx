"use client";

/**
 * What a sent turn actually delivered, as a canvas tab — the chat package's
 * MessageContextReceiptView (the receipt table; a value opens its delivered
 * text in place). ONE tab per message, keyed by its id; the message's receipt
 * pill toggles it through the chat canvas port's `useTab`. The kind id lives
 * in the chat package (`host/canvas-tabs.ts`).
 */

import { Boxes } from "lucide-react";
import { defineCanvasKind } from "@ai-matrx/canvas/react";
import type { CanvasJson } from "@ai-matrx/canvas";
import { MESSAGE_CONTEXT_RECEIPT_KIND } from "@ai-matrx/chat/host/canvas-tabs";
import { canvasText } from "@/features/canvas/host/toolCanvas";

export { MESSAGE_CONTEXT_RECEIPT_KIND };

export function readMessageContextReceiptTab(
  data: CanvasJson | undefined | null,
): { conversationId: string; messageId: string } | null {
  const conversationId = canvasText(data, "conversationId");
  const messageId = canvasText(data, "messageId");
  return conversationId && messageId ? { conversationId, messageId } : null;
}

export const messageContextReceiptKind = defineCanvasKind<CanvasJson>({
  id: MESSAGE_CONTEXT_RECEIPT_KIND,
  surface: "dom",
  label: "Sent values",
  icon: Boxes,
  load: () => import("./MessageContextReceiptCanvasView"),
  unavailable: (data) => (readMessageContextReceiptTab(data) ? null : "No message"),
  // The receipt is read from the loaded conversation's messages.
  restore: false,
});
