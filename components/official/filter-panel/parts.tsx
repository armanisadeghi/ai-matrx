"use client";

// components/official/filter-panel/parts.tsx
//
// The reusable pieces of a filter popover, lifted verbatim in behaviour from
// features/agents/components/shared/DesktopFilterPanel.tsx — which had them as
// private locals, so every other surface that wanted the same panel had to
// re-implement chips-with-search, radio groups, and section headers.
//
// One difference that matters at scale: `FacetChips` takes COUNTS and a
// `maxVisible` cap. The original rendered every value it was handed, which is
// fine for 34 categories and unusable for 773 tags. Here the list is ordered by
// count, capped, and expandable — and searching filters the whole set, not just
// the visible slice.

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Sentinel meaning "has none" (uncategorized / untagged). Matches the SQL. */
export const NONE_SENTINEL = "__none__";

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

export function FilterSection({
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
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
          {label}
        </span>
        {active && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
      </div>
      {children}
    </div>
  );
}

export function RadioSelect<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string }[];
}) {
  return (
    <div className="flex flex-col">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
            value === opt.value
              ? "bg-primary/10 font-medium text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <span
            className={cn(
              "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2",
              value === opt.value ? "border-primary" : "border-muted-foreground/40",
            )}
          >
            {value === opt.value && (
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            )}
          </span>
          <span className="flex-1 truncate">{opt.label}</span>
          {opt.hint && (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {opt.hint}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * Multi-select chips over server-computed facets. Selected = OR filter;
 * nothing selected = no filter.
 */
export function FacetChips({
  options,
  selected,
  onChange,
  searchPlaceholder,
  maxVisible = 24,
}: {
  options: FacetOption[];
  selected: string[];
  onChange: (v: string[]) => void;
  searchPlaceholder: string;
  maxVisible?: number;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? options.filter((o) => o.label.toLowerCase().includes(q))
      : options;
    // Selected values always render, even when the cap or the search would
    // hide them — an active filter you cannot see is an active filter you
    // cannot turn off.
    const chosen = options.filter(
      (o) => selected.includes(o.value) && !base.includes(o),
    );
    return [...chosen, ...base];
  }, [options, query, selected]);

  const visible = expanded || query ? matches : matches.slice(0, maxVisible);
  const hiddenCount = matches.length - visible.length;

  const toggle = (val: string) =>
    onChange(
      selected.includes(val)
        ? selected.filter((v) => v !== val)
        : [...selected, val],
    );

  return (
    <div className="space-y-2">
      {options.length > 8 && (
        <div className="flex h-7 items-center gap-1.5 rounded-md border border-border/50 bg-muted/50 px-2">
          <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Clear"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {selected.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-xs text-primary hover:underline"
        >
          Clear {selected.length} selected
        </button>
      )}

      <div className="flex max-h-[190px] flex-wrap gap-1.5 overflow-y-auto">
        {visible.map((opt) => {
          const isSelected = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className={cn(
                "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
                opt.value === NONE_SENTINEL && "italic",
                isSelected
                  ? "border-primary/30 bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
              title={`${opt.label} (${opt.count})`}
            >
              <span className="truncate">{opt.label}</span>
              <span className="shrink-0 tabular-nums opacity-60">{opt.count}</span>
            </button>
          );
        })}
      </div>

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-xs text-primary hover:underline"
        >
          Show {hiddenCount} more
        </button>
      )}
      {matches.length === 0 && (
        <p className="text-xs text-muted-foreground">No matches</p>
      )}
    </div>
  );
}
