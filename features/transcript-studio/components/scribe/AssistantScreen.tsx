"use client";

import { ListChecks, Loader2 } from "lucide-react";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { useStudioAssistant } from "../../hooks/useStudioAssistant";
import { useScribeDraftTasks } from "../../hooks/useScribeDraftTasks";

interface AssistantScreenProps {
  sessionId: string;
}

export function AssistantScreen({ sessionId }: AssistantScreenProps) {
  const assistant = useStudioAssistant(sessionId);
  const conversationId = assistant.conversationId;
  const draftTasks = useScribeDraftTasks(conversationId, assistant.send);

  if (!conversationId) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Draft-tasks action — asks the agent to extract reviewed draft tasks
          from this session's transcript. The proposal lands as an Approve/Reject
          ask-card below (PendingAsksZone); nothing is written until approved. */}
      <div className="flex shrink-0 items-center justify-end px-2 py-1">
        <button
          type="button"
          onClick={draftTasks}
          className="flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-xs font-medium text-foreground transition-colors active:bg-accent"
          title="Extract draft tasks from this session for review"
        >
          <ListChecks className="h-3.5 w-3.5 text-primary" />
          Draft tasks
        </button>
      </div>

      {/* Conversation + input — the same seamless column used by the chat and
          agent-run routes. The working document now lives at the ScribeScreen
          level (shared across all tabs), so it's not rendered here. */}
      <div className="min-h-0 flex-1">
        <AgentConversationColumn
          conversationId={conversationId}
          surfaceKey={`studio-assistant:${sessionId}`}
          constrainWidth
          edgeToEdgeScroll
          smartInputProps={{ sendButtonVariant: "blue" }}
        />
      </div>
    </div>
  );
}
