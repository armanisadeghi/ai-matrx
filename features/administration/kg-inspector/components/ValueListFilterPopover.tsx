"use client";

/**
 * features/administration/kg-inspector/components/ValueListFilterPopover.tsx
 *
 * Excel-style checkbox value filter shared by every admin data-grid column
 * header (kg-inspector + the canonicalization AdminAuditTable): a search box
 * to narrow long option lists, Select all / Deselect all, individual
 * checkboxes, and an explicit Apply ("Filter") button so selections are
 * staged locally and only committed on click — never per-checkbox.
 *
 * Callers own pagination/cardinality decisions: this component renders every
 * entry in `options` into the DOM, so it is meant for a bounded, already-
 * loaded distinct-value list (see AdminAuditTable's MAX_TEXT_FILTER_OPTIONS
 * cap), not a live/paginated/unbounded column.
 */

import { useEffect, useState } from "react";
import { Filter, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/styles/themes/utils";

export interface ValueListFilterPopoverProps {
  label: string;
  /** Distinct values currently available for this column (already capped by the caller). */
  options: string[];
  /** Currently committed selection — undefined/empty means "no filter applied". */
  selected: string[] | undefined;
  /** Called with the new committed selection when the user clicks Filter. `undefined` clears it. */
  onApply: (values: string[] | undefined) => void;
  /** Optional display transform for raw option values, e.g. booleans ("true" -> "Yes"). */
  formatOption?: (value: string) => string;
  /** Show the search box above this many options. Default 8. */
  searchThreshold?: number;
}

export function ValueListFilterPopover({
  label,
  options,
  selected,
  onApply,
  formatOption,
  searchThreshold = 8,
}: ValueListFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [staged, setStaged] = useState<Set<string>>(
    () => new Set(selected ?? []),
  );
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) {
      setStaged(new Set(selected ?? []));
      setQuery("");
    }
  }, [open, selected]);

  const active = Boolean(selected && selected.length > 0);
  const q = query.trim().toLowerCase();
  const visibleOptions = q
    ? options.filter((opt) => opt.toLowerCase().includes(q))
    : options;

  const toggle = (opt: string) => {
    setStaged((prev) => {
      const next = new Set(prev);
      if (next.has(opt)) next.delete(opt);
      else next.add(opt);
      return next;
    });
  };

  const commit = () => {
    onApply(staged.size > 0 ? Array.from(staged) : undefined);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-muted",
            active && "text-primary",
          )}
          title={`Filter ${label} by value`}
          onClick={(e) => e.stopPropagation()}
        >
          <Filter className={cn("h-3 w-3", !active && "opacity-50")} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 space-y-2 p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Filter {label}
        </div>

        {options.length > searchThreshold ? (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search values…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-7 pl-6 text-base"
              autoFocus
            />
          </div>
        ) : null}

        <div className="flex items-center justify-between text-[11px]">
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => setStaged(new Set(visibleOptions))}
          >
            Select all{q ? " (shown)" : ""}
          </button>
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() =>
              setStaged((prev) => {
                if (!q) return new Set();
                const next = new Set(prev);
                for (const opt of visibleOptions) next.delete(opt);
                return next;
              })
            }
          >
            Deselect all{q ? " (shown)" : ""}
          </button>
        </div>

        <div className="max-h-56 space-y-1 overflow-y-auto border-t border-border pt-1.5">
          {visibleOptions.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              No matching values
            </div>
          ) : (
            visibleOptions.map((opt) => (
              <label
                key={opt}
                className="flex cursor-pointer items-center gap-2 py-0.5 text-xs"
              >
                <Checkbox
                  checked={staged.has(opt)}
                  onCheckedChange={() => toggle(opt)}
                />
                <span className="truncate" title={opt}>
                  {formatOption ? formatOption(opt) : opt}
                </span>
              </label>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {staged.size} selected
          </span>
          <div className="flex gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setStaged(new Set());
              }}
              disabled={staged.size === 0}
            >
              Clear
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={commit}>
              Filter
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
