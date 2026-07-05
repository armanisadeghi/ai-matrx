"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UseAgentMemoriesReturn } from "../hooks/useAgentMemories";

interface AgentMemoryFooterProps {
  state: UseAgentMemoriesReturn;
}

export function AgentMemoryFooter({ state }: AgentMemoryFooterProps) {
  const { memories, loading } = state;
  return (
    <div className="flex w-full items-center justify-between px-3 py-1.5">
      <span className="text-[11px] text-muted-foreground">
        {memories.length} {memories.length === 1 ? "memory" : "memories"} saved
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-6 gap-1.5 px-2 text-[11px] text-muted-foreground hover:text-foreground"
        disabled={loading}
        onClick={() => void state.refresh()}
      >
        <RefreshCw className="h-3 w-3" />
        Refresh
      </Button>
    </div>
  );
}
