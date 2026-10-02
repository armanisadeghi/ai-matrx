"use client";

// lib/entity-list/components/EntityDimensionFilter.tsx
//
// THE DIMENSION FILTER CONTROL — beside the organization filter on every canonical list header that
// declares `config.dimensionFilter` (lane 3 INTEGRATION, W1.5). Pick a Dimension's Value (Practice Area →
// Sports rehab) and the list shows only rows linked to it; "Any" is first and the default. State and
// server contract: ../dimensionFilter.ts. Rows: ../useListDimensions.ts (the one door).
//
// Standalone by design (value/onChange), like EntityOrgFilter, so a page outside the shell can render
// the same control.

import { useState } from "react";
import { Check, ChevronDown, Layers, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useListDimensions } from "../useListDimensions";

export const ANY_DIMENSION_LABEL = "Any dimension";

/** Past this many Values the menu offers a search. */
const SEARCH_AT = 10;

export interface EntityDimensionFilterProps {
  /** The chosen Value id; null = Any. */
  valueId: string | null;
  onChange: (valueId: string | null) => void;
  className?: string;
}

export function EntityDimensionFilter({ valueId, onChange, className }: EntityDimensionFilterProps) {
  const [opened, setOpened] = useState(false);
  const [needle, setNeedle] = useState("");
  // The tree is asked for only once the menu opens, or when the URL already names a Value.
  const { dimensions, loading, error, find } = useListDimensions(opened || Boolean(valueId));
  const selected = valueId ? find(valueId) : null;

  const label = valueId
    ? selected
      ? `${selected.dimension.label}: ${selected.value.name}`
      : loading
        ? "Dimension: …"
        : "Dimension: a value you cannot see"
    : ANY_DIMENSION_LABEL;

  const totalValues = dimensions.reduce((n, d) => n + d.values.length, 0);
  const q = needle.trim().toLowerCase();
  const shown = q
    ? dimensions
        .map((d) => ({
          ...d,
          values: d.label.toLowerCase().includes(q) ? d.values : d.values.filter((v) => v.name.toLowerCase().includes(q)),
        }))
        .filter((d) => d.values.length > 0)
    : dimensions;

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) setOpened(true);
        else setNeedle("");
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-entity-dimension-filter=""
          aria-label={`Dimension filter: ${label}`}
          title="Show only items linked to one value"
          className={cn(
            "inline-flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors sm:max-w-[13rem] lg:max-w-[18rem]",
            valueId
              ? "border-primary/40 bg-primary/10 text-foreground"
              : "border-border text-muted-foreground hover:bg-muted hover:text-foreground max-sm:shrink-0",
            className,
          )}
        >
          <Layers className="h-3.5 w-3.5 shrink-0" />
          <span className={cn("truncate", !valueId && "max-sm:sr-only")}>{label}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0", !valueId && "max-sm:hidden")} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[60dvh] min-w-60 overflow-y-auto">
        {totalValues > SEARCH_AT && (
          <div className="px-1 pb-1">
            <input
              value={needle}
              onChange={(e) => setNeedle(e.target.value)}
              // Keep Radix's typeahead from stealing the keystrokes.
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Find a value…"
              aria-label="Find a value"
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-base lg:text-xs"
            />
          </div>
        )}
        <DropdownMenuItem onSelect={() => onChange(null)}>
          <span className="flex items-center gap-2">
            {valueId ? <span className="w-3.5" /> : <Check className="h-3.5 w-3.5" />}
            Any
          </span>
        </DropdownMenuItem>
        {shown.map((d) => (
          <div key={d.id} data-entity-dimension-group="">
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="truncate text-xs text-muted-foreground">{d.label}</DropdownMenuLabel>
            {d.values.map((v) => (
              <DropdownMenuItem key={v.id} onSelect={() => onChange(v.id)}>
                <span className="flex min-w-0 items-center gap-2">
                  {valueId === v.id ? <Check className="h-3.5 w-3.5 shrink-0" /> : <span className="w-3.5 shrink-0" />}
                  <span className="truncate">{v.name}</span>
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        ))}
        {loading && dimensions.length === 0 && (
          <div className="flex justify-center px-2 py-2" role="status" aria-label="Loading dimensions">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && error && dimensions.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-destructive">Dimensions could not load.</p>
        )}
        {!loading && !error && dimensions.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">No dimensions with values yet.</p>
        )}
        {!loading && q && shown.length === 0 && dimensions.length > 0 && (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">No value matches “{needle.trim()}”.</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
