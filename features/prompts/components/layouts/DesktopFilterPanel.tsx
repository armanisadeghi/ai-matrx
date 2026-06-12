"use client";

import { useState } from "react";
import {
  Check,
  ChevronDown,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { NONE_SENTINEL } from "../../hooks/usePromptFilters";
import type {
  PromptSortOption,
  PromptTab,
  FavFilter,
  ArchFilter,
} from "../../hooks/usePromptFilters";
import type { AgentTab } from "@/features/agents/redux/agent-consumers/slice";
import type { AgentSortOption } from "@/features/agents/redux/agent-consumers/slice";
import type { AgentFavFilter } from "@/features/agents/redux/agent-consumers/slice";
import type { AgentArchFilter } from "@/features/agents/redux/agent-consumers/slice";

interface DesktopFilterPanelProps {
  sortBy: PromptSortOption;
  setSortBy: (v: PromptSortOption) => void;
  activeTab: PromptTab | AgentTab;
  setActiveTab: (v: PromptTab | AgentTab) => void;
  includedCats: string[];
  setIncludedCats: (v: string[]) => void;
  includedTags: string[];
  setIncludedTags: (v: string[]) => void;
  favFilter: FavFilter;
  setFavFilter: (v: FavFilter) => void;
  archFilter: ArchFilter;
  setArchFilter: (v: ArchFilter) => void;
  favoritesFirst: boolean;
  setFavoritesFirst: (v: boolean) => void;
  allCategories: string[];
  allTags: string[];
  resetFilters: () => void;
  activeFilterCount: number;
  hasShared: boolean;
  /** Render trigger as a compact icon button instead of a labelled button. */
  iconOnly?: boolean;
}

const SORT_OPTIONS: {
  value: PromptSortOption | AgentSortOption;
  label: string;
}[] = [
  { value: "updated-desc", label: "Recently Updated" },
  { value: "created-desc", label: "Recently Created" },
  { value: "name-asc", label: "Name (A-Z)" },
  { value: "name-desc", label: "Name (Z-A)" },
  { value: "category-asc", label: "Category (A-Z)" },
];

const FAV_OPTIONS: { value: FavFilter | AgentFavFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "yes", label: "Favorites only" },
  { value: "no", label: "Not favorites" },
];

const ARCH_OPTIONS: { value: ArchFilter | AgentArchFilter; label: string }[] = [
  { value: "active", label: "Active only" },
  { value: "archived", label: "Archived only" },
  { value: "both", label: "All (active + archived)" },
];

function RadioSelect<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T | AgentSortOption | AgentFavFilter | AgentArchFilter;
  onChange: (v: T | AgentSortOption | AgentFavFilter | AgentArchFilter) => void;
  options: {
    value: T | AgentSortOption | AgentFavFilter | AgentArchFilter;
    label: string;
  }[];
}) {
  return (
    <div className="flex flex-col">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors text-left",
            value === opt.value
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <div
            className={cn(
              "w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0",
              value === opt.value
                ? "border-primary"
                : "border-muted-foreground/40",
            )}
          >
            {value === opt.value && (
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
            )}
          </div>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function MultiSelectChips({
  items,
  selected,
  onChange,
  noneLabel,
  searchPlaceholder,
}: {
  items: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  noneLabel: string;
  searchPlaceholder: string;
}) {
  const [searchQ, setSearchQ] = useState("");
  const hasFilter = selected.length > 0;
  const filtered = items.filter(
    (item) => !searchQ || item.toLowerCase().includes(searchQ.toLowerCase()),
  );
  const includesNone = selected.includes(NONE_SENTINEL);

  const toggle = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter((v) => v !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  return (
    <div className="space-y-2">
      {items.length > 5 && (
        <div className="flex items-center gap-1.5 px-2 h-7 rounded-md bg-muted/50 border border-border/50">
          <Search className="h-3 w-3 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 outline-none"
          />
          {searchQ && (
            <button
              onClick={() => setSearchQ("")}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {hasFilter && (
        <button
          onClick={() => onChange([])}
          className="text-xs text-primary hover:underline"
        >
          Clear filter
        </button>
      )}

      <div className="flex flex-wrap gap-1.5 max-h-[180px] overflow-y-auto">
        {!searchQ && (
          <button
            onClick={() => toggle(NONE_SENTINEL)}
            className={cn(
              "px-2 py-0.5 rounded-full text-xs font-medium border transition-colors italic",
              includesNone
                ? "bg-primary/15 border-primary/30 text-primary"
                : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            )}
          >
            {noneLabel}
          </button>
        )}
        {filtered.map((item) => {
          const isSelected = selected.includes(item);
          return (
            <button
              key={item}
              onClick={() => toggle(item)}
              className={cn(
                "px-2 py-0.5 rounded-full text-xs font-medium border transition-colors",
                isSelected
                  ? "bg-primary/15 border-primary/30 text-primary"
                  : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              {item}
            </button>
          );
        })}
      </div>
      {filtered.length === 0 && searchQ && (
        <p className="text-xs text-muted-foreground">No matches</p>
      )}
    </div>
  );
}

function FilterSection({
  label,
  children,
  active,
}: {
  label: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
          {label}
        </span>
        {active && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
      </div>
      {children}
    </div>
  );
}

export function DesktopFilterPanel({
  sortBy,
  setSortBy,
  activeTab,
  setActiveTab,
  includedCats,
  setIncludedCats,
  includedTags,
  setIncludedTags,
  favFilter,
  setFavFilter,
  archFilter,
  setArchFilter,
  favoritesFirst,
  setFavoritesFirst,
  allCategories,
  allTags,
  resetFilters,
  activeFilterCount,
  hasShared,
  iconOnly = false,
}: DesktopFilterPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {iconOnly ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full matrx-glass-thin-border hover:shadow-xl relative border border-border/50 shrink-0"
            title="Filters"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 inline-flex items-center justify-center h-4 min-w-[16px] px-1 text-[10px] font-bold bg-primary text-primary-foreground rounded-full">
                {activeFilterCount}
              </span>
            )}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-3 rounded-full matrx-glass-thin-border hover:shadow-xl relative border border-border/50"
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                open && "rotate-180",
              )}
            />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center h-4 min-w-[16px] px-1 text-[10px] font-bold bg-primary text-primary-foreground rounded-full">
                {activeFilterCount}
              </span>
            )}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        collisionPadding={16}
        className="w-[360px] p-0 overflow-hidden flex flex-col"
        style={{
          maxHeight:
            "var(--radix-popover-content-available-height, calc(100dvh - 120px))",
        }}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
          <span className="text-sm font-semibold">Filters & Sort</span>
          {activeFilterCount > 0 && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
            >
              <RotateCcw className="h-3 w-3" />
              Reset all
            </button>
          )}
        </div>
        <div className="overflow-y-auto min-h-0 flex-1 p-4 space-y-5">
          <FilterSection label="Sort" active={sortBy !== "updated-desc"}>
            <RadioSelect
              value={sortBy}
              onChange={setSortBy}
              options={SORT_OPTIONS}
            />
          </FilterSection>

          {hasShared && (
            <FilterSection label="Show" active={activeTab !== "mine"}>
              <RadioSelect
                value={activeTab}
                onChange={setActiveTab}
                options={[
                  { value: "mine" as PromptTab, label: "My Prompts" },
                  { value: "shared" as PromptTab, label: "Shared with Me" },
                  { value: "all" as PromptTab, label: "All Prompts" },
                ]}
              />
            </FilterSection>
          )}

          <FilterSection label="Favorites" active={favFilter !== "all"}>
            <RadioSelect
              value={favFilter}
              onChange={setFavFilter}
              options={FAV_OPTIONS}
            />
          </FilterSection>

          <FilterSection label="Archived" active={archFilter !== "active"}>
            <RadioSelect
              value={archFilter}
              onChange={setArchFilter}
              options={ARCH_OPTIONS}
            />
          </FilterSection>

          {allCategories.length > 0 && (
            <FilterSection label="Categories" active={includedCats.length > 0}>
              <p className="text-[11px] text-muted-foreground mb-1">
                Select to filter. None selected = show all.
              </p>
              <MultiSelectChips
                items={allCategories}
                selected={includedCats}
                onChange={setIncludedCats}
                noneLabel="Uncategorized"
                searchPlaceholder="Find category..."
              />
            </FilterSection>
          )}

          {allTags.length > 0 && (
            <FilterSection label="Tags" active={includedTags.length > 0}>
              <p className="text-[11px] text-muted-foreground mb-1">
                Select to filter. None selected = show all.
              </p>
              <MultiSelectChips
                items={allTags}
                selected={includedTags}
                onChange={setIncludedTags}
                noneLabel="Untagged"
                searchPlaceholder="Find tag..."
              />
            </FilterSection>
          )}

          <FilterSection label="Options">
            <button
              onClick={() => setFavoritesFirst(!favoritesFirst)}
              className="flex items-center gap-2 w-full text-sm text-left"
            >
              <div
                className={cn(
                  "w-8 h-[18px] rounded-full relative transition-colors shrink-0",
                  favoritesFirst
                    ? "bg-primary"
                    : "bg-muted border border-border",
                )}
              >
                <span
                  className={cn(
                    "absolute top-[1px] w-4 h-4 rounded-full bg-white shadow-sm transition-all",
                    favoritesFirst ? "left-[14px]" : "left-[1px]",
                  )}
                />
              </div>
              <span className="text-foreground">Pin favorites to top</span>
            </button>
          </FilterSection>
        </div>
      </PopoverContent>
    </Popover>
  );
}
