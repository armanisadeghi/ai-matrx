"use client";

/**
 * AgentMemorySidebar — the WindowPanel `sidebar` slot for the Memory window.
 * Dense, single-line rows: a prominent 0-10 importance score + title (fades
 * out at the right edge instead of a hard ellipsis) + scope tag, with a
 * hover-revealed "..." menu for row actions. A sort control (importance /
 * updated / created / alphabetical) sits above the list — importance desc
 * is the default so the most important memories surface first.
 */

import {
  ArrowUpDown,
  Layers,
  Loader2,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@ai-matrx/chat/host/ui-slots";
import { ReadFailure } from "@ai-matrx/chat/host/ui-slots";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ai-matrx/design-system";
import { cn } from "@ai-matrx/design-system";
import {
  displayTitleForMemory,
  importanceScore,
  importanceTier,
  type AgentMemoryRow,
} from "../types";
import {
  ALL_MEMORIES_ID,
  NEW_MEMORY_ID,
  SORT_MODE_OPTIONS,
  type UseAgentMemoriesReturn,
} from "../hooks/useAgentMemories";
import { Button } from "@ai-matrx/design-system/controls";

const TIER_CHIP_CLASS: Record<ReturnType<typeof importanceTier>, string> = {
  high: "bg-primary/15 text-primary",
  medium: "bg-muted text-foreground/80",
  low: "bg-muted text-muted-foreground",
};

const FADE_MASK =
  "[mask-image:linear-gradient(to_right,black_78%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_right,black_78%,transparent_100%)]";

interface MemoryRowProps {
  memory: AgentMemoryRow;
  isActive: boolean;
  onSelect: () => void;
  onRequestDelete: () => void;
}

function MemoryRow({
  memory,
  isActive,
  onSelect,
  onRequestDelete,
}: MemoryRowProps) {
  return (
    <div
      className={cn(
        "group/row relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-foreground hover:bg-muted/60",
      )}
    >
      <Button variant="quiet" onClick={onSelect} className="min-w-0">
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded px-1 py-px text-[10px] font-bold tabular-nums",
            TIER_CHIP_CLASS[importanceTier(memory.importance)],
          )}
          title="Importance"
        >
          {importanceScore(memory.importance)}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 overflow-hidden whitespace-nowrap text-xs font-medium",
            FADE_MASK,
          )}
        >
          {displayTitleForMemory(memory)}
        </span>
      </Button>

      <span className="shrink-0 text-[9px] uppercase tracking-wide text-muted-foreground/70 transition-opacity group-hover/row:opacity-0">
        {memory.scope === "organization" ? "org" : "me"}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="quiet" icon={<MoreHorizontal />} aria-label="Memory options" className="absolute right-1 top-1/2 shrink-0 opacity-0 group-hover/row:opacity-100 data-[state=open]:opacity-100" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="right">
          <DropdownMenuItem
            onClick={onRequestDelete}
            className="gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

interface AgentMemorySidebarProps {
  state: UseAgentMemoriesReturn;
}

export function AgentMemorySidebar({ state }: AgentMemorySidebarProps) {
  const {
    memories,
    totalCount,
    loading,
    error,
    refresh,
    selectedId,
    setSelectedId,
    deletingId,
    sortMode,
    setSortMode,
  } = state;
  const [pendingDelete, setPendingDelete] = useState<AgentMemoryRow | null>(
    null,
  );
  const sortLabel =
    SORT_MODE_OPTIONS.find((o) => o.value === sortMode)?.label ?? "Importance";

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 p-2">
        <Button
          type="button"
          variant="outline" className="w-full"
          onClick={() => setSelectedId(NEW_MEMORY_ID)}
        >
          <Plus className="h-3.5 w-3.5" />
          New memory
        </Button>
      </div>

      <div className="shrink-0 px-2 pb-1">
        <Button variant="quiet" pressed={selectedId === ALL_MEMORIES_ID} icon={<Layers />} onClick={() => setSelectedId(ALL_MEMORIES_ID)} className="w-full">
          <span className="truncate">All memories</span>
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            {totalCount}
          </span>
        </Button>
      </div>

      <div className="flex shrink-0 items-center justify-between px-2 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
          Memories
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="quiet" icon={<ArrowUpDown />}>{sortLabel}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {SORT_MODE_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => setSortMode(option.value)}
                className={cn(
                  "text-xs",
                  sortMode === option.value && "bg-primary/10 text-primary",
                )}
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="flex flex-col gap-0.5 px-2 pb-2">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading…
            </div>
          )}

          {!loading && error && memories.length === 0 && (
            <ReadFailure
              error={error}
              what="your memories"
              className="m-1"
              onRetry={() => void refresh()}
            />
          )}

          {!loading && !error && memories.length === 0 && (
            <div className="px-1 py-8 text-center text-xs text-muted-foreground">
              No memories yet.
            </div>
          )}

          {!loading &&
            memories.map((memory) => (
              <MemoryRow
                key={memory.id}
                memory={memory}
                isActive={selectedId === memory.id}
                onSelect={() => setSelectedId(memory.id)}
                onRequestDelete={() => setPendingDelete(memory)}
              />
            ))}
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete this memory?"
        description={
          pendingDelete
            ? `"${displayTitleForMemory(pendingDelete)}" will no longer be remembered. This archives it; an admin can restore it.`
            : undefined
        }
        confirmLabel="Delete"
        variant="destructive"
        busy={!!pendingDelete && deletingId === pendingDelete.id}
        onConfirm={async () => {
          if (!pendingDelete) return;
          await state.deleteMemory(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
