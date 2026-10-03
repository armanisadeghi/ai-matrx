"use client";

/** The body of an agent-edit-history canvas tab: the chat package's AgentEditHistory. */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { AgentEditHistory } from "@ai-matrx/chat/agents/components/undo-history/AgentEditHistory";
import { readAgentEditHistoryTab } from "./agentEditHistoryKind";

export default function AgentEditHistoryCanvasView({ data }: CanvasKindProps) {
  const tab = readAgentEditHistoryTab(data);
  if (!tab) return null;
  return <AgentEditHistory agentId={tab.agentId} />;
}
