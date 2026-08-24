"use client";

/**
 * P26 — "The table itself needs to be fully dynamic and able to show
 * dimensions and values as well. So the user needs to be able to choose from
 * a list and then add them as columns."
 *
 * Every dimension this site sees — the platform ones and the ones it invented
 * this afternoon — is offered. Nothing is hardcoded: the list is
 * `seo.facet_dimension_catalog`, so a dimension created inside the assign
 * panel appears here without a deploy.
 */

import { useState } from "react";
import { Columns3, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { FacetDimension } from "@/features/marketing/seo/value-system/dimensions/data";
import {
  WORKBENCH_OPTIONAL_COLUMNS,
  type WorkbenchOptionalColumnId,
} from "@/features/marketing/seo/keyword-workbench/state";

function Row({
  checked,
  onToggle,
  label,
  hint,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-accent">
      <Checkbox checked={checked} onCheckedChange={onToggle} />
      <span className="min-w-0 flex-1 truncate text-foreground">{label}</span>
      {hint ? (
        <span className="shrink-0 text-[10px] text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

export function ColumnChooser({
  dimensions,
  loading,
  selected,
  onSelectedChange,
  optional,
  onOptionalChange,
}: {
  dimensions: FacetDimension[];
  loading?: boolean;
  selected: string[];
  onSelectedChange: (next: string[]) => void;
  optional: WorkbenchOptionalColumnId[];
  onOptionalChange: (next: WorkbenchOptionalColumnId[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const term = search.trim().toLowerCase();
  const matches = dimensions.filter((d) =>
    term === "" ? true : d.label.toLowerCase().includes(term),
  );
  const yours = matches.filter((d) => d.scope === "site");
  const shared = matches.filter((d) => d.scope !== "site");

  const toggle = (slug: string) =>
    onSelectedChange(
      selected.includes(slug)
        ? selected.filter((s) => s !== slug)
        : [...selected, slug],
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground"
        >
          <Columns3 className="h-3.5 w-3.5" />
          Columns
          {selected.length + optional.length > 0 ? (
            <span className="ml-0.5 rounded-full bg-muted px-1 text-[10px] text-foreground">
              {selected.length + optional.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a dimension…"
            className="h-7 pl-7 text-xs"
            aria-label="Find a dimension"
          />
        </div>
        <div className="max-h-80 space-y-2 overflow-y-auto scrollbar-thin">
          <div>
            <p className="px-1.5 pb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Metrics
            </p>
            {WORKBENCH_OPTIONAL_COLUMNS.map((column) => (
              <Row
                key={column.id}
                label={column.label}
                checked={optional.includes(column.id)}
                onToggle={() =>
                  onOptionalChange(
                    optional.includes(column.id)
                      ? optional.filter((id) => id !== column.id)
                      : [...optional, column.id],
                  )
                }
              />
            ))}
          </div>
          {yours.length > 0 ? (
            <div>
              <p className="px-1.5 pb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Yours
              </p>
              {yours.map((d) => (
                <Row
                  key={d.slug}
                  label={d.label}
                  hint={d.value_count > 0 ? `${d.value_count}` : "empty"}
                  checked={selected.includes(d.slug)}
                  onToggle={() => toggle(d.slug)}
                />
              ))}
            </div>
          ) : null}
          {shared.length > 0 ? (
            <div>
              <p className="px-1.5 pb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Shared across every business
              </p>
              {shared.map((d) => (
                <Row
                  key={d.slug}
                  label={d.label}
                  hint={d.value_count > 0 ? `${d.value_count}` : "empty"}
                  checked={selected.includes(d.slug)}
                  onToggle={() => toggle(d.slug)}
                />
              ))}
            </div>
          ) : null}
          {loading ? (
            <p className="px-1.5 py-2 text-xs text-muted-foreground">
              Loading your dimensions…
            </p>
          ) : matches.length === 0 ? (
            <p className="px-1.5 py-2 text-xs text-muted-foreground">
              No dimension matches “{search.trim()}”. Assign one to a keyword
              and it appears here.
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
