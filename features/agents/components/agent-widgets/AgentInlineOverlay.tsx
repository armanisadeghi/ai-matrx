"use client";

import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { AgentRunner } from "../smart/AgentRunner";

interface AgentInlineOverlayProps {
  conversationId: string;
  onClose: () => void;
}

export function AgentInlineOverlay({
  conversationId,
  onClose,
}: AgentInlineOverlayProps) {
  return (
    <div className="fixed top-1/3 left-1/2 -translate-x-1/2 z-50 w-[600px] max-h-[60dvh] bg-card border border-border rounded-lg shadow-2xl overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b border-border shrink-0">
        <span className="text-xs font-medium text-muted-foreground">
          Agent Result
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={onClose}
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
      <AgentRunner
        conversationId={conversationId}
        compact
        className="flex-1 min-h-0 bg-background"
      />
    </div>
  );
}
