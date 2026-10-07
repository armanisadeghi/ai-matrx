"use client";

/** The body of an agent-edit-history canvas tab: the chat package's AgentEditHistory. */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { AgentEditHistory } from "@/features/agents/components/undo-history/AgentEditHistory";
import { useAppSelector } from "@/lib/redux/hooks";
import { subjectTitle, useCanvasTabTitle } from "@/features/canvas/host/toolCanvas";
import { readAgentEditHistoryTab } from "./agentEditHistoryKind";
import { readAgentName } from "@ai-matrx/chat/agents/identity/agent-identity";

export default function AgentEditHistoryCanvasView({ data, item, canvas }: CanvasKindProps) {
  const tab = readAgentEditHistoryTab(data);
  const agentName = useAppSelector((state) => (tab ? readAgentName(state, tab.agentId) : undefined));
  // The tab names its agent — two agents' edit histories never share a title.
  useCanvasTabTitle(canvas, item, agentName?.trim() ? subjectTitle("Edit history", agentName) : "");
  if (!tab) return null;
  return <AgentEditHistory agentId={tab.agentId} />;
}
