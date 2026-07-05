"use client";

/**
 * AgentMemoryFooter — context-aware WindowPanel footer slot.
 * Default (All memories / nothing selected): count + refresh.
 * Editing (new or existing memory): a prominent importance score (0-10) +
 * slider + Save, so the actions live in one slim, always-in-the-same-place
 * row instead of floating inside the body.
 */

import { Loader2, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { importanceScore, importanceTier } from "../types";
import {
  ALL_MEMORIES_ID,
  NEW_MEMORY_ID,
  type UseAgentMemoriesReturn,
} from "../hooks/useAgentMemories";

const TIER_TEXT_CLASS: Record<ReturnType<typeof importanceTier>, string> = {
  high: "text-primary",
  medium: "text-foreground",
  low: "text-muted-foreground",
};

interface AgentMemoryFooterProps {
  state: UseAgentMemoriesReturn;
}

export function AgentMemoryFooter({ state }: AgentMemoryFooterProps) {
  const { totalCount, loading, selectedId } = state;
  const isEditing =
    selectedId === NEW_MEMORY_ID || selectedId !== ALL_MEMORIES_ID;
  const isNew = selectedId === NEW_MEMORY_ID;

  if (!isEditing) {
    return (
      <div className="flex w-full items-center justify-between px-3 py-1.5">
        <span className="text-[11px] text-muted-foreground">
          {totalCount} {totalCount === 1 ? "memory" : "memories"} saved
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

  const score = importanceScore(state.draft.importance);
  const tier = importanceTier(state.draft.importance);

  return (
    <div className="flex w-full items-center gap-4 px-3 py-1.5">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="shrink-0 text-[11px] text-muted-foreground">
          Importance
        </span>
        <span
          className={cn(
            "shrink-0 font-mono text-sm font-bold tabular-nums",
            TIER_TEXT_CLASS[tier],
          )}
        >
          {score}
          <span className="text-[10px] font-normal text-muted-foreground">
            /10
          </span>
        </span>
        <Slider
          className="w-24"
          value={[state.draft.importance]}
          onValueChange={([v]) => state.setDraftImportance(v)}
          min={0}
          max={1}
          step={0.1}
        />
      </div>

      <Button
        type="button"
        size="sm"
        className="h-7 shrink-0 gap-1.5 text-xs"
        disabled={!state.canSave || !state.isDirty || state.saving}
        onClick={() => void state.saveDraft()}
      >
        {state.saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Save className="h-3.5 w-3.5" />
        )}
        {isNew ? "Save memory" : "Save changes"}
      </Button>
    </div>
  );
}
