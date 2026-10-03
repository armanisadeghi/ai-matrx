"use client";

/** The body of a conversation-context canvas tab: the chat package's ContextRulesPanel. */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { canvasRecord } from "@/features/canvas/host/toolCanvas";
import { ContextRulesPanel } from "@ai-matrx/chat/agents/components/context-policies-display/ContextRulesPanel";
import { readConversationContextTab } from "./conversationContextKind";

export default function ConversationContextCanvasView({ data, item, canvas, presentation }: CanvasKindProps) {
  const tab = readConversationContextTab(data);
  if (!tab) return null;
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
