"use client";

/**
 * AgentMemorySidebar — the WindowPanel `sidebar` slot for the Memory window.
 * Reads nothing from Redux directly; it's a pure view over the hoisted
 * `useAgentMemories()` state passed down from the composition root.
 */

import { Layers, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { displayTitleForMemory } from "../types";
import {
  ALL_MEMORIES_ID,
  NEW_MEMORY_ID,
  type UseAgentMemoriesReturn,
} from "../hooks/useAgentMemories";

const IMPORTANCE_DOT_THRESHOLDS: [number, string][] = [
  [0.8, "bg-primary"],
  [0.5, "bg-primary/60"],
  [0, "bg-muted-foreground/30"],
];

function importanceDotClass(importance: number | null): string {
  const value = importance ?? 0.5;
  for (const [threshold, cls] of IMPORTANCE_DOT_THRESHOLDS) {
    if (value >= threshold) return cls;
  }
  return "bg-muted-foreground/30";
}

interface AgentMemorySidebarProps {
  state: UseAgentMemoriesReturn;
}

export function AgentMemorySidebar({ state }: AgentMemorySidebarProps) {
  const { memories, loading, selectedId, setSelectedId } = state;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border p-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 w-full justify-start gap-2 text-xs"
          onClick={() => setSelectedId(NEW_MEMORY_ID)}
        >
          <Plus className="h-3.5 w-3.5" />
          New memory
        </Button>
      </div>

      <div className="shrink-0 border-b border-border p-1.5">
        <button
          type="button"
          onClick={() => setSelectedId(ALL_MEMORIES_ID)}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
            selectedId === ALL_MEMORIES_ID
              ? "bg-primary/10 text-primary font-medium"
              : "text-foreground hover:bg-muted/60",
          )}
        >
          <Layers className="h-4 w-4 shrink-0" />
          <span className="truncate">All memories</span>
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            {memories.length}
          </span>
        </button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-0.5 p-1.5">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading memories…
            </div>
          )}

          {!loading && memories.length === 0 && (
            <div className="px-2 py-8 text-center text-xs text-muted-foreground">
              No memories yet.
            </div>
          )}

          {!loading &&
            memories.map((memory) => {
              const isActive = selectedId === memory.id;
              return (
                <button
                  key={memory.id}
                  type="button"
                  onClick={() => setSelectedId(memory.id)}
                  className={cn(
                    "flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-muted/60",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        importanceDotClass(memory.importance),
                      )}
                    />
                    <span className="truncate text-xs font-medium">
                      {displayTitleForMemory(memory)}
                    </span>
                  </span>
                  <span className="truncate pl-3 text-[11px] text-muted-foreground">
                    {memory.content}
                  </span>
                </button>
              );
            })}
        </div>
      </ScrollArea>
    </div>
  );
}
