"use client";

import {
  ArrowUpDown,
  Star,
  Folder,
  Tag,
  RotateCcw,
  Archive,
  ScanSearch,
} from "lucide-react";
import { FilterChip } from "@ai-matrx/agents/catalog/react";
import type { RightPanel } from "@ai-matrx/agents/catalog/react";
import { WORKFLOW_SORT_OPTIONS } from "../types";
import type { WorkflowListControls } from "../useWorkflowListCore";

export interface WorkflowFilterBarProps {
  controls: WorkflowListControls;
  allCategories: string[];
  allTags: string[];
  activeFilterCount: number;
  isMobile: boolean;
  rightPanel: RightPanel;
  onFilterChipClick: (panel: "sort" | "categories" | "tags") => void;
}

/**
 * IDENTICAL on every tab, and two chips RICHER than the agent bar because the
 * workflow RPC answers two more questions: archived records, and a deep search
 * that reaches inside the steps. Both are opt-in, both are counted in the
 * filter badge, and neither is hidden behind a tab.
 */
export function WorkflowFilterBar({
  controls,
  allCategories,
  allTags,
  activeFilterCount,
  isMobile,
  rightPanel,
  onFilterChipClick,
}: WorkflowFilterBarProps) {
  return (
    <div className="flex items-center gap-1 px-2 pb-1.5 overflow-x-auto scrollbar-none shrink-0">
      <FilterChip
        icon={ArrowUpDown}
        label={
          WORKFLOW_SORT_OPTIONS.find((o) => o.value === controls.sortBy)
            ?.label ?? "Sort"
        }
        active={controls.sortBy !== "updated-desc"}
        focused={!isMobile && rightPanel === "sort"}
        onClick={() => onFilterChipClick("sort")}
      />
      <FilterChip
        icon={Star}
        label={controls.favFilter === "no" ? "No Favs" : "Favs"}
        active={controls.favFilter !== "all"}
        onClick={() =>
          controls.setFavFilter(
            controls.favFilter === "all"
              ? "yes"
              : controls.favFilter === "yes"
                ? "no"
                : "all",
          )
        }
      />
      {allCategories.length > 0 && (
        <FilterChip
          icon={Folder}
          label={
            controls.includedCats.length > 0
              ? `${controls.includedCats.length}`
              : "Category"
          }
          active={controls.includedCats.length > 0}
          focused={!isMobile && rightPanel === "categories"}
          onClick={() => onFilterChipClick("categories")}
        />
      )}
      {allTags.length > 0 && (
        <FilterChip
          icon={Tag}
          label={
            controls.includedTags.length > 0
              ? `${controls.includedTags.length}`
              : "Tags"
          }
          active={controls.includedTags.length > 0}
          focused={!isMobile && rightPanel === "tags"}
          onClick={() => onFilterChipClick("tags")}
        />
      )}
      <FilterChip
        icon={Archive}
        label={controls.archived === "archived" ? "Archived" : "All"}
        active={controls.archived !== "active"}
        onClick={() =>
          controls.setArchived(
            controls.archived === "active"
              ? "all"
              : controls.archived === "all"
                ? "archived"
                : "active",
          )
        }
      />
      <FilterChip
        icon={ScanSearch}
        label="In steps"
        active={controls.deepSearch}
        onClick={() => controls.setDeepSearch(!controls.deepSearch)}
      />
      {activeFilterCount > 0 && (
        <button
          onClick={controls.resetFilters}
          title="Clear filters"
          className="flex items-center gap-0.5 h-6 px-1.5 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
