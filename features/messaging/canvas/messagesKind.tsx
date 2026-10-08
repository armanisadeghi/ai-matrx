"use client";

/**
 * Messages as a canvas tab — the canonical conversation list and thread
 * (`ConversationListPane` / `ConversationPane`) in the right-hand column. The
 * tab navigates inside itself: a row opens its thread, the thread's own header
 * goes back to the list. Which conversation is open is the messaging
 * package's store, never a copy in the tab's data. One tab: the header button
 * toggles it.
 */

import { ExternalLink, MessageSquare } from "lucide-react";
import { canvasItemId, type CanvasController } from "@ai-matrx/canvas";
import { defineCanvasKind, useOptionalCanvas } from "@ai-matrx/canvas/react";
import { openToolInCanvas, useToolToggle } from "@/features/canvas/host/toolCanvas";

export const MESSAGES_KIND = "messages";
const TITLE = "Messages";
const KEY = "default";

export const messagesKind = defineCanvasKind<null>({
  id: MESSAGES_KIND,
  surface: "dom",
  label: TITLE,
  icon: MessageSquare,
  load: () => import("./MessagesCanvasView"),
  restore: true,
  launcher: { key: KEY, data: null, title: TITLE },
  menuItems: () => [
    {
      id: "open-messages-page",
      label: "Open Messages",
      icon: <ExternalLink />,
      onSelect: () => window.open("/messages", "_blank", "noopener"),
    },
  ],
});

/** The header button's press and pressed state: toggle-or-focus the Messages tab. */
export function useMessagesToggle() {
  return useToolToggle({ kind: MESSAGES_KIND, key: KEY, title: TITLE, data: null });
}

/** Opens (or focuses) the Messages tab — for "message this person" doors. */
export function useOpenMessages() {
  const canvas = useOptionalCanvas();
  return () => openToolInCanvas(canvas, { kind: MESSAGES_KIND, key: KEY, title: TITLE, data: null });
}

/** Closes the Messages tab — the full /messages page shows the same thread. */
export function closeMessagesTab(canvas: CanvasController | null): void {
  const id = canvasItemId(MESSAGES_KIND, KEY);
  if (canvas?.getState().items[id]) canvas.close(id);
}
