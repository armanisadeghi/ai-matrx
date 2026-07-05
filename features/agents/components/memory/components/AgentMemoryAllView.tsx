"use client";

/**
 * AgentMemoryAllView — read-first overview of every memory at once, each
 * card jumping into the single-memory editor on click.
 */

import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { displayTitleForMemory } from "../types";
import type { UseAgentMemoriesReturn } from "../hooks/useAgentMemories";

interface AgentMemoryAllViewProps {
  state: UseAgentMemoriesReturn;
}

export function AgentMemoryAllView({ state }: AgentMemoryAllViewProps) {
  const { memories, loading, error, setSelectedId } = state;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading memories…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (memories.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
        <p className="text-sm font-medium text-foreground">No memories yet</p>
        <p className="text-xs text-muted-foreground">
          Memories the agent saves about you will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto flex max-w-2xl flex-col gap-2">
        {memories.map((memory) => (
          <button
            key={memory.id}
            type="button"
            onClick={() => setSelectedId(memory.id)}
            className={cn(
              "flex flex-col gap-1 rounded-lg border border-border bg-card px-3.5 py-3 text-left transition-colors",
              "hover:border-primary/40 hover:bg-muted/40",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-foreground">
                {displayTitleForMemory(memory)}
              </span>
              <Badge
                variant="secondary"
                className="shrink-0 text-[10px] capitalize"
              >
                {memory.scope}
              </Badge>
            </div>
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {memory.content}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
