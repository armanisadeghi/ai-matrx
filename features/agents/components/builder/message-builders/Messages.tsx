"use client";

import { RefObject } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAgentConversationMessageIndices } from "@/features/agents/redux/agent-definition/selectors";
import { MessageItem } from "@/features/agents/components/builder/message-builders/MessageItem";

interface MessagesProps {
  agentId: string;
  onOpenFullScreenEditor?: (messageIndex: number) => void;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
}

export function Messages({
  agentId,
  onOpenFullScreenEditor,
  scrollContainerRef,
}: MessagesProps) {
  const conversationIndices = useAppSelector((state) =>
    selectAgentConversationMessageIndices(state, agentId),
  );

  if (conversationIndices === undefined) {
    return <Skeleton className="h-24 w-full rounded-md" />;
  }

  return (
    <div className="space-y-2">
      {conversationIndices.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center">
          <p className="text-xs text-muted-foreground">
            No conversation examples yet. Add user/assistant message pairs to
            guide the agent.
          </p>
        </div>
      ) : (
        <div className="space-y-2 rounded-lg">
          {conversationIndices.map((msgIndex) => (
            <MessageItem
              key={msgIndex}
              messageIndex={msgIndex}
              agentId={agentId}
              onOpenFullScreenEditor={onOpenFullScreenEditor}
              scrollContainerRef={scrollContainerRef}
            />
          ))}
        </div>
      )}
    </div>
  );
}
