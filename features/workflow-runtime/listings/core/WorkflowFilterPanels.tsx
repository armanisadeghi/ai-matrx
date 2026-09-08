"use client";

import {
  CheckRow,
  OptionRow,
  SearchInput,
  SidePanelHeader,
} from "@/features/agents/components/agent-listings/core/primitives";
import { WORKFLOW_SORT_OPTIONS } from "../types";
import type { WorkflowListControls } from "../useWorkflowListCore";

export function WorkflowSortPanel({
  controls,
  onClose,
}: {
  controls: WorkflowListControls;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <SidePanelHeader title="Sort By" onClose={onClose} />
      <div className="overflow-y-auto flex-1">
        {WORKFLOW_SORT_OPTIONS.map((opt) => (
          <OptionRow
            key={opt.value}
            label={opt.label}
            selected={controls.sortBy === opt.value}
            onClick={() => controls.setSortBy(opt.value)}
          />
        ))}
      </div>
      <div className="border-t border-border">
        <CheckRow
          label="Favorites first"
          checked={controls.favoritesFirst}
          onClick={() => controls.setFavoritesFirst(!controls.favoritesFirst)}
        />
      </div>
    </div>
  );
}

export function WorkflowCategoriesPanel({
  controls,
  allCategories,
  search,
  setSearch,
  onClose,
}: {
  controls: WorkflowListControls;
  allCategories: string[];
  search: string;
  setSearch: (v: string) => void;
  onClose: () => void;
}) {
  const filtered = allCategories.filter(
    (c) => !search || c.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="flex flex-col h-full">
      <SidePanelHeader title="Categories" onClose={onClose} />
      <div className="px-2 pt-2 pb-1 shrink-0">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Filter categories..."
        />
      </div>
      {controls.includedCats.length > 0 && (
        <button
          onClick={() => controls.includedCats.forEach(controls.toggleCategory)}
          className="mx-2 mb-1 h-6 rounded text-[11px] font-medium text-primary hover:bg-muted/50 transition-colors text-left shrink-0"
        >
          Clear ({controls.includedCats.length})
        </button>
      )}
      <div className="overflow-y-auto flex-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            No categories
          </p>
        ) : (
          filtered.map((cat) => (
            <CheckRow
              key={cat}
              label={cat}
              checked={controls.includedCats.includes(cat)}
              onClick={() => controls.toggleCategory(cat)}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function WorkflowTagsPanel({
  controls,
  allTags,
  search,
  setSearch,
  onClose,
}: {
  controls: WorkflowListControls;
  allTags: string[];
  search: string;
  setSearch: (v: string) => void;
  onClose: () => void;
}) {
  const filtered = allTags.filter(
    (t) => !search || t.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="flex flex-col h-full">
      <SidePanelHeader title="Tags" onClose={onClose} />
      <div className="px-2 pt-2 pb-1 shrink-0">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Filter tags..."
        />
      </div>
      {controls.includedTags.length > 0 && (
        <button
          onClick={() => controls.includedTags.forEach(controls.toggleTag)}
          className="mx-2 mb-1 h-6 rounded text-[11px] font-medium text-primary hover:bg-muted/50 transition-colors text-left shrink-0"
        >
          Clear ({controls.includedTags.length})
        </button>
      )}
      <div className="overflow-y-auto flex-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            No tags
          </p>
        ) : (
          filtered.map((tag) => (
            <CheckRow
              key={tag}
              label={tag}
              checked={controls.includedTags.includes(tag)}
              onClick={() => controls.toggleTag(tag)}
            />
          ))
        )}
      </div>
    </div>
  );
}
