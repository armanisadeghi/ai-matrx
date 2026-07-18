"use client";

/**
 * AgentMemoryInlinePanel — the Memory window's exact state + views, composed
 * for a narrow embedded host (the Chat Options window/sheet Memory tab).
 *
 * Same `useAgentMemories()` hook, same list (AgentMemorySidebar), same editor
 * (AgentMemoryBody) and footer — but as a master→detail swap instead of a
 * two-column window: list first; picking a memory (or New) swaps to the
 * editor with a back bar. Behavior can never drift from the window because
 * every piece IS the window's piece.
 */

import { ArrowLeft, ExternalLink } from "lucide-react";
import { useOpenAgentMemoryWindow } from "@/features/overlays/openers/agentMemoryWindow";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  ALL_MEMORIES_ID,
  NEW_MEMORY_ID,
  useAgentMemories,
} from "../hooks/useAgentMemories";
import { AgentMemorySidebar } from "./AgentMemorySidebar";
import { AgentMemoryBody } from "./AgentMemoryBody";
import { AgentMemoryFooter } from "./AgentMemoryFooter";

export function AgentMemoryInlinePanel() {
  const state = useAgentMemories();
  const isMobile = useIsMobile();
  const openMemoryWindow = useOpenAgentMemoryWindow();

  const inDetail =
    state.selectedId === NEW_MEMORY_ID || !!state.selectedMemory;

  if (!inDetail) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-hidden">
          <AgentMemorySidebar state={state} />
        </div>
        {!isMobile && (
          <div className="flex shrink-0 items-center justify-end border-t border-border px-2 py-1">
            <button
              type="button"
              onClick={() => openMemoryWindow()}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
              title="Open the full Memory window"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              Open window
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center border-b border-border px-1.5 py-1">
        <button
          type="button"
          onClick={() => state.setSelectedId(ALL_MEMORIES_ID)}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All memories
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <AgentMemoryBody state={state} />
      </div>
      <div className="shrink-0 border-t border-border">
        <AgentMemoryFooter state={state} />
      </div>
    </div>
  );
}
