// features/admin/spend/explorer/FilterChips.tsx
//
// The drill-down breadcrumb. Every active filter is a chip with the dimension
// name and the value's label; one click removes it, "Clear all" removes them
// all. When any filter is on, the coverage line says how much of the window's
// ledger this view explains — a filtered view must never read as a total.
//
// Doc: features/admin/spend/FEATURE.md

"use client";

import { X } from "lucide-react";

import { Button } from "@ai-matrx/design-system";

import { usd } from "../format";
import { SPEND_DIMENSIONS, type SpendBreakdown, type SpendDimension, type SpendFilters } from "../types";
import { DIMENSION_LABEL, percent, rowLabel } from "./labels";

export interface FilterChipsProps {
  filters: SpendFilters;
  data: SpendBreakdown | null;
  onRemove: (dim: SpendDimension) => void;
  onClear: () => void;
}

export function FilterChips({ filters, data, onRemove, onClear }: FilterChipsProps) {
  const active = SPEND_DIMENSIONS.filter((dim) => filters[dim]);
  if (active.length === 0) return null;

  const ledger = data?.totals.ledgerCost ?? 0;
  const cost = data?.totals.cost ?? 0;

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Looking at
      </span>
      {active.map((dim) => {
        const key = filters[dim] ?? "";
        // With a filter on, the dimension has exactly one row: the value itself.
        const row = data?.dimensions[dim]?.rows[0];
        const label = row && row.key === key ? rowLabel(dim, row) : key;
        return (
          <Button
            key={dim}
            variant="secondary"
            size="sm"
            className="h-6 gap-1 px-2 text-xs"
            onClick={() => onRemove(dim)}
            title={`Remove the ${DIMENSION_LABEL[dim].toLowerCase()} filter`}
          >
            <span className="text-muted-foreground">{DIMENSION_LABEL[dim]}:</span>
            <span className="max-w-[18rem] truncate font-medium">{label}</span>
            <X className="h-3 w-3" aria-hidden />
          </Button>
        );
      })}
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onClear}>
        Clear all
      </Button>
      {data ? (
        <span className="ml-auto text-[11px] text-muted-foreground">
          This slice is {usd(cost)} of the {usd(ledger)} the whole window cost (
          {percent(ledger > 0 ? cost / ledger : 0)}).
        </span>
      ) : null}
    </div>
  );
}
