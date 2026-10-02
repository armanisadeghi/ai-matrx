"use client";

import { useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsExecuting } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { Button } from "@/components/ui/button";
import { MessageSquare, Minimize2, X } from "lucide-react";
import { AgentRunner } from "../smart/AgentRunner";

interface AgentChatBubbleProps {
  conversationId: string;
  onClose: () => void;
}

export function AgentChatBubble({
  conversationId,
  onClose,
}: AgentChatBubbleProps) {
  const [expanded, setExpanded] = useState(true);
  const isExecuting = useAppSelector(selectIsExecuting(conversationId));

  if (!expanded) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          size="icon"
          className="h-12 w-12 rounded-full shadow-lg"
          onClick={() => setExpanded(true)}
        >
          <MessageSquare className="w-5 h-5" />
          {isExecuting && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full animate-pulse" />
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(24rem,calc(100vw-2rem))] h-[min(500px,calc(100dvh-2rem))] bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0 bg-muted/30">
        <span className="text-xs font-medium">Agent Chat</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setExpanded(false)}
          >
            <Minimize2 className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onClose}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>
      <AgentRunner
        conversationId={conversationId}
        compact
        className="flex-1 min-h-0"
      />
    </div>
  );
}
