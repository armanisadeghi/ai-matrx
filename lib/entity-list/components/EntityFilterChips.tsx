"use client";

// lib/entity-list/components/EntityFilterChips.tsx
//
// THE ACTIVE FILTERS, AS CHIPS (config.filterChips). Notion, Linear and Google Drive show what is
// narrowing a list as a row of removable pills under the search box; a narrowing hidden behind a
// column header's funnel is one a person forgets they set. The chips are the SAME filter bag the
// headers and the Filters panel write (one state, three entry points) — nothing here holds a copy.
// Renders nothing until something is set, so it never adds an empty row.

import { X } from "lucide-react";
import type { EntityColumnSpec } from "../columns";
import { NONE_VALUE, type EntityFilters } from "../types";
import { DIMENSION_FILTER_KEY } from "../dimensionFilter";

interface Props<TRow> {
  columns: EntityColumnSpec<TRow>[];
  filters: EntityFilters;
  toggles?: Array<{ id: string; label: string }> | undefined;
  onFiltersChange: (filters: EntityFilters) => void;
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span
      data-entity-filter-chip=""
      className="inline-flex h-11 max-w-[16rem] sm:h-8 items-center gap-1 rounded-full border border-border bg-muted/50 pl-2.5 pr-1 type-secondary text-foreground"
    >
      <span className="truncate" title={label}>
        {label}
      </span>
      <button
        type="button"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground sm:h-6 sm:w-6"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

export function EntityFilterChips<TRow>({
  columns,
  filters,
  toggles,
  onFiltersChange,
}: Props<TRow>) {
  // The organization and Dimension filters are their own visible controls on the lane row; no second chip.
  const entries = Object.entries(filters).filter(([id]) => id !== DIMENSION_FILTER_KEY);
  if (entries.length === 0) return null;
  const without = (id: string) => {
    const next = { ...filters };
    delete next[id];
    return next;
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-entity-filter-chips="">
      {entries.map(([id, filter]) => {
        const toggle = toggles?.find((t) => t.id === id);
        const spec = columns.find((c) => c.id === id);
        const name = toggle?.label ?? spec?.label ?? id;
        const options = spec?.column.filterOptions;
        const word = (value: string) =>
          value === NONE_VALUE
            ? "None"
            : (options?.find((o) => o.value === value)?.label ?? spec?.formatFacetValue?.(value) ?? value);
        const label =
          filter.kind === "select"
            ? `${name}: ${filter.values.map(word).join(", ")}`
            : filter.kind === "text"
              ? `${name}: ${filter.value}`
              : toggle
                ? name
                : `${name}: ${filter.value ? "Yes" : "No"}`;
        return <Chip key={id} label={label} onRemove={() => onFiltersChange(without(id))} />;
      })}
    </div>
  );
}
