"use client";

/**
 * AgentMemoryAllView — every memory rendered as ONE continuous scrollable
 * document (heading + full content + divider, repeated) — not a grid of
 * cards, nothing clamped or cut off. Clicking a heading jumps into the
 * single-memory editor for that entry.
 */

import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  displayTitleForMemory,
  importanceScore,
  importanceTier,
} from "../types";
import type { UseAgentMemoriesReturn } from "../hooks/useAgentMemories";

const TIER_BADGE_CLASS: Record<ReturnType<typeof importanceTier>, string> = {
  high: "bg-primary/15 text-primary",
  medium: "bg-muted text-foreground",
  low: "bg-muted text-muted-foreground",
};

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
    <div className="h-full overflow-y-auto">
      <div className="p-3">
        {memories.map((memory, index) => (
          <button
            key={memory.id}
            type="button"
            onClick={() => setSelectedId(memory.id)}
            className={
              "block w-full py-3 text-left first:pt-0" +
              (index < memories.length - 1 ? " border-b border-border/60" : "")
            }
          >
            <div className="mb-1 flex items-center gap-2">
              <span
                className={cn(
                  "flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                  TIER_BADGE_CLASS[importanceTier(memory.importance)],
                )}
                title="Importance"
              >
                {importanceScore(memory.importance)}
                <span className="text-[8px] font-normal opacity-70">/10</span>
              </span>
              <h3 className="text-sm font-semibold text-foreground">
                {displayTitleForMemory(memory)}
              </h3>
              <Badge
                variant="secondary"
                className="shrink-0 text-[10px] capitalize"
              >
                {memory.scope}
              </Badge>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {memory.content}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
