"use client";

// lib/entity-list/components/EntityDimensionFilter.tsx
//
// THE DIMENSION FILTER CONTROL — beside the organization filter on every canonical list header that
// declares `config.dimensionFilter` (lane 3 INTEGRATION, W1.5). Pick a Dimension's Value (Practice Area →
// Sports rehab) and the list shows only rows linked to it; "Any" is first and the default. State and
// server contract: ../dimensionFilter.ts. Rows: ../useListDimensions.ts (the one door — the record
// store's paged tree: Dimensions first, a Dimension's Values when it is opened, server-side search).
//
// Standalone by design (value/onChange), like EntityOrgFilter, so a page outside the shell can render
// the same control.

import { useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Layers, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useListDimensions, type ListDimensionValue } from "../useListDimensions";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
export const ANY_DIMENSION_LABEL = "Any dimension";

export interface EntityDimensionFilterProps {
  /** The chosen Value id; null = Any. */
  valueId: string | null;
  onChange: (valueId: string | null) => void;
  className?: string;
}

function ValueItem({ value, chosen, onPick }: { value: ListDimensionValue; chosen: boolean; onPick: () => void }) {
  return (
    <DropdownMenuItem onSelect={onPick} className="pl-6">
      <span className="flex min-w-0 items-center gap-2">
        {chosen ? <Check className="h-3.5 w-3.5 shrink-0" /> : <span className="w-3.5 shrink-0" />}
        <span className="truncate">{value.name}</span>
      </span>
    </DropdownMenuItem>
  );
}

export function EntityDimensionFilter({ valueId, onChange, className }: EntityDimensionFilterProps) {
  const [opened, setOpened] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [needle, setNeedle] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const q = needle.trim();
  const dims = useListDimensions(opened, valueId, q);
  const hits = dims.hits;

  const label = valueId
    ? dims.selected
      ? `${dims.selected.dimension.label}: ${dims.selected.value.name}`
      : dims.selectedMissing
        ? "Dimension: a value you cannot see"
        : "Dimension: …"
    : ANY_DIMENSION_LABEL;

  const toggle = (id: string) => {
    setOpen((cur) => (cur === id ? null : id));
    dims.loadValues(id);
  };

  return (
    <DropdownMenu
      onOpenChange={(isOpen) => {
        if (isOpen) {
          setOpened(true);
          // The search box takes focus on open (Radix focuses the menu itself first), so typing searches.
          window.setTimeout(() => searchRef.current?.focus(), 30);
        } else setNeedle("");
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-entity-dimension-filter=""
          aria-label={`Dimension filter: ${label}`}
          title="Show only items linked to one value"
          className={cn(
            "matrx-glyph-trim inline-flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors sm:max-w-[13rem] lg:max-w-[18rem]",
            valueId
              ? "border-primary/40 bg-primary/10 text-foreground"
              : "border-border text-muted-foreground hover:bg-muted hover:text-foreground max-sm:shrink-0",
            className,
          )}
        >
          <Layers className="h-3.5 w-3.5 shrink-0" />
          {/* Icon-only on a phone while un-narrowed, and always below 48rem of a list pane (the
              pane, not the viewport: beside the chat panel a 1024px screen holds a 540px list). */}
          <span className={cn("truncate @max-3xl/list:sr-only", !valueId && "max-sm:sr-only")}>{label}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 @max-3xl/list:hidden", !valueId && "max-sm:hidden")} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-64 overflow-y-auto">
        <div className="px-1 pb-1">
          <input
            ref={searchRef}
            value={needle}
            onChange={(e) => setNeedle(e.target.value)}
            // Keep Radix's typeahead from stealing the keystrokes.
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Find a value…"
            aria-label="Find a value"
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-base lg:text-xs"
          />
        </div>
        <DropdownMenuItem onSelect={() => onChange(null)}>
          <span className="flex items-center gap-2">
            {valueId ? <span className="w-3.5" /> : <Check className="h-3.5 w-3.5" />}
            Any
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {q ? (
          hits === null ? (
            <div className="flex justify-center px-2 py-2" role="status" aria-label="Searching values">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : hits.length === 0 ? (
            <p className="px-2 py-1.5 type-secondary text-muted-foreground">No value matches “{q}”.</p>
          ) : (
            hits.map((h) => (
              <DropdownMenuItem key={h.value.id} onSelect={() => onChange(h.value.id)}>
                <span className="flex min-w-0 items-center gap-2">
                  {valueId === h.value.id ? <Check className="h-3.5 w-3.5 shrink-0" /> : <span className="w-3.5 shrink-0" />}
                  <span className="truncate">{h.value.name}</span>
                  <span className="ml-auto shrink-0 truncate pl-2 type-secondary text-muted-foreground">{h.dimension.label}</span>
                </span>
              </DropdownMenuItem>
            ))
          )
        ) : (
          <>
            {dims.dimensions.map((d) => {
              const values = dims.valuesOf(d.id);
              const isOpen = open === d.id;
              return (
                <div key={d.id} data-entity-dimension-group="">
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      toggle(d.id);
                    }}
                    aria-expanded={isOpen}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                      <span className="truncate">{d.label}</span>
                    </span>
                  </DropdownMenuItem>
                  {isOpen &&
                    (values === undefined ? (
                      <div className="flex justify-center px-2 py-1.5" role="status" aria-label={`Loading ${d.label}`}>
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      </div>
                    ) : values.length === 0 ? (
                      // read-gate-exempt: values is undefined until the dimension read answers
                      <p className="py-1 pl-8 type-secondary text-muted-foreground">No values yet.</p>
                    ) : (
                      values.map((v) => (
                        <ValueItem key={v.id} value={v} chosen={valueId === v.id} onPick={() => onChange(v.id)} />
                      ))
                    ))}
                </div>
              );
            })}
            {dims.loading && (
              <div className="flex justify-center px-2 py-2" role="status" aria-label="Loading dimensions">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!dims.loading && dims.error && (
              <p className="px-2 py-1.5 type-secondary text-destructive">Dimensions could not load.<ErrorAlchemyMenu /></p>
            )}
            {!dims.loading && !dims.error && dims.dimensions.length === 0 && (
              <p className="px-2 py-1.5 type-secondary text-muted-foreground">No dimensions yet.</p>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
