"use client";

import { ArrowUpDown, Star, Folder, Tag, RotateCcw } from "lucide-react";
import type { UseAgentConsumerReturn } from "@/features/agents/hooks/useAgentConsumer";
import type { RightPanel } from "./types";
import { SORT_OPTIONS } from "./types";
import { FilterChip } from "./primitives";

export interface AgentFilterBarProps {
  consumer: UseAgentConsumerReturn;
  allCategories: string[];
  allTags: string[];
  activeFilterCount: number;
  isMobile: boolean;
  rightPanel: RightPanel;
  onFilterChipClick: (panel: "sort" | "categories" | "tags") => void;
  onReset: () => void;
  /** System tab — sort only; skip fav/category/tag filters. */
  systemTab?: boolean;
}

export function AgentFilterBar({
  consumer,
  allCategories,
  allTags,
  activeFilterCount,
  isMobile,
  rightPanel,
  onFilterChipClick,
  onReset,
  systemTab = false,
}: AgentFilterBarProps) {
  return (
    <div className="flex items-center gap-1 px-2 pb-1.5 overflow-x-auto scrollbar-none shrink-0">
      <FilterChip
        icon={ArrowUpDown}
        label={
          SORT_OPTIONS.find((o) => o.value === consumer.sortBy)?.label ?? "Sort"
        }
        active={consumer.sortBy !== "updated-desc"}
        focused={!isMobile && rightPanel === "sort"}
        onClick={() => onFilterChipClick("sort")}
      />
      {!systemTab && (
        <>
          <FilterChip
            icon={Star}
            label={
              consumer.favFilter === "yes"
                ? "Favs"
                : consumer.favFilter === "no"
                  ? "No Favs"
                  : "Favs"
            }
            active={consumer.favFilter !== "all"}
            onClick={() => {
              const next =
                consumer.favFilter === "all"
                  ? "yes"
                  : consumer.favFilter === "yes"
                    ? "no"
                    : "all";
              consumer.setFavFilter(next as "all" | "yes" | "no");
            }}
          />
          {allCategories.length > 0 && (
            <FilterChip
              icon={Folder}
              label={
                consumer.includedCats.length > 0
                  ? `${consumer.includedCats.length}`
                  : "Category"
              }
              active={consumer.includedCats.length > 0}
              focused={!isMobile && rightPanel === "categories"}
              onClick={() => onFilterChipClick("categories")}
            />
          )}
          {allTags.length > 0 && (
            <FilterChip
              icon={Tag}
              label={
                consumer.includedTags.length > 0
                  ? `${consumer.includedTags.length}`
                  : "Tags"
              }
              active={consumer.includedTags.length > 0}
              focused={!isMobile && rightPanel === "tags"}
              onClick={() => onFilterChipClick("tags")}
            />
          )}
        </>
      )}
      {activeFilterCount > 0 && (
        <button
          onClick={onReset}
          className="flex items-center gap-0.5 h-6 px-1.5 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
