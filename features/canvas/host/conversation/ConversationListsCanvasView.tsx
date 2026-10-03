"use client";

/** The body of a conversation-lists canvas tab: the chat package's TaskPanel. */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { TaskPanel } from "@ai-matrx/chat/agents/ui-first-tools/ui/lists/TaskPanel";
import { readConversationListsTab } from "./conversationListsKind";

export default function ConversationListsCanvasView({ data }: CanvasKindProps) {
  const tab = readConversationListsTab(data);
  return tab ? <TaskPanel conversationId={tab.conversationId} /> : null;
}
