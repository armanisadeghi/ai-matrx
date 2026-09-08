"use client";

import { ChevronRight } from "lucide-react";
import {
  CheckRow,
  OptionRow,
  SearchInput,
} from "@/features/agents/components/agent-listings/core/primitives";
import { WORKFLOW_SORT_OPTIONS } from "../types";
import type { WorkflowListControls } from "../useWorkflowListCore";

export interface WorkflowMobileSubViewProps {
  view: "sort" | "categories" | "tags";
  controls: WorkflowListControls;
  allCategories: string[];
  allTags: string[];
  catSearch: string;
  setCatSearch: (v: string) => void;
  tagSearch: string;
  setTagSearch: (v: string) => void;
  onBack: () => void;
}

export function WorkflowMobileSubView({
  view,
  controls,
  allCategories,
  allTags,
  catSearch,
  setCatSearch,
  tagSearch,
  setTagSearch,
  onBack,
}: WorkflowMobileSubViewProps) {
  const title =
    view === "sort" ? "Sort" : view === "categories" ? "Categories" : "Tags";

  return (
    <div className="flex flex-col">
      <button
        onClick={onBack}
        className="flex shrink-0 items-center gap-1.5 border-b border-border px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-muted/30"
      >
        <ChevronRight className="h-4 w-4 rotate-180" />
        {title}
      </button>
      {view === "sort" && (
        <>
          {WORKFLOW_SORT_OPTIONS.map((opt) => (
            <OptionRow
              key={opt.value}
              label={opt.label}
              selected={controls.sortBy === opt.value}
              onClick={() => {
                controls.setSortBy(opt.value);
                onBack();
              }}
            />
          ))}
          <div className="border-t border-border">
            <CheckRow
              label="Favorites first"
              checked={controls.favoritesFirst}
              onClick={() =>
                controls.setFavoritesFirst(!controls.favoritesFirst)
              }
            />
          </div>
        </>
      )}
      {view === "categories" && (
        <>
          <div className="px-2 pb-1 pt-2">
            <SearchInput
              value={catSearch}
              onChange={setCatSearch}
              placeholder="Filter categories..."
            />
          </div>
          {controls.includedCats.length > 0 && (
            <button
              onClick={() =>
                controls.includedCats.forEach(controls.toggleCategory)
              }
              className="mx-2 mb-1 h-6 rounded text-left text-[11px] font-medium text-primary transition-colors hover:bg-muted/50"
            >
              Clear ({controls.includedCats.length})
            </button>
          )}
          <div className="max-h-[300px] overflow-y-auto">
            {allCategories
              .filter(
                (c) =>
                  !catSearch ||
                  c.toLowerCase().includes(catSearch.toLowerCase()),
              )
              .map((cat) => (
                <CheckRow
                  key={cat}
                  label={cat}
                  checked={controls.includedCats.includes(cat)}
                  onClick={() => controls.toggleCategory(cat)}
                />
              ))}
          </div>
        </>
      )}
      {view === "tags" && (
        <>
          <div className="px-2 pb-1 pt-2">
            <SearchInput
              value={tagSearch}
              onChange={setTagSearch}
              placeholder="Filter tags..."
            />
          </div>
          {controls.includedTags.length > 0 && (
            <button
              onClick={() => controls.includedTags.forEach(controls.toggleTag)}
              className="mx-2 mb-1 h-6 rounded text-left text-[11px] font-medium text-primary transition-colors hover:bg-muted/50"
            >
              Clear ({controls.includedTags.length})
            </button>
          )}
          <div className="max-h-[300px] overflow-y-auto">
            {allTags
              .filter(
                (t) =>
                  !tagSearch ||
                  t.toLowerCase().includes(tagSearch.toLowerCase()),
              )
              .map((tag) => (
                <CheckRow
                  key={tag}
                  label={tag}
                  checked={controls.includedTags.includes(tag)}
                  onClick={() => controls.toggleTag(tag)}
                />
              ))}
          </div>
        </>
      )}
    </div>
  );
}
