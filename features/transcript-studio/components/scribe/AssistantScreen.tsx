"use client";

import { Loader2 } from "lucide-react";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { useStudioAssistant } from "../../hooks/useStudioAssistant";

interface AssistantScreenProps {
  sessionId: string;
}

export function AssistantScreen({ sessionId }: AssistantScreenProps) {
  const assistant = useStudioAssistant(sessionId);
  const conversationId = assistant.conversationId;

  if (!conversationId) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Conversation + input — the same seamless column used by the chat and
          agent-run routes. The working document now lives at the ScribeScreen
          level (shared across all tabs), so it's not rendered here. */}
      <div className="min-h-0 flex-1">
        <AgentConversationColumn
          conversationId={conversationId}
          surfaceKey={`studio-assistant:${sessionId}`}
          constrainWidth
          smartInputProps={{ sendButtonVariant: "blue" }}
        />
      </div>
    </div>
  );
}
