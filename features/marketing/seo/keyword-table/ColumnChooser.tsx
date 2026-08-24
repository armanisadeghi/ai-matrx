"use client";

/**
 * THE COLUMNS CHOOSER — "Now we can add and remove columns, and that's what we
 * have to do… you're basically just saving configurations for each page, and
 * then the user gets to create their own configurations." (Arman, 2026-08-24.)
 *
 * Two lists, one rule. The CORE columns are the same everywhere in the product
 * — a surface only decides which of them it OPENS on, and this popover lets the
 * person disagree with that choice. The DIMENSION columns come from
 * `seo.facet_dimension_catalog`, so a dimension invented inside the assign
 * panel this afternoon appears here without a deploy.
 *
 * Whatever is ticked lands in the URL, which is what a saved view stores — so
 * "my columns" survives reload, a pasted link, and a colleague opening it.
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
  KEYWORD_CORE_COLUMNS,
  KEYWORD_REQUIRED_COLUMN,
  type KeywordCoreColumnId,
} from "./state";

function Row({
  checked,
  disabled,
  onToggle,
  label,
  hint,
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <label
      className={
        disabled
          ? "flex items-center gap-2 rounded-md px-1.5 py-1 text-xs opacity-60"
          : "flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-accent"
      }
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={() => {
          if (!disabled) onToggle();
        }}
      />
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
  coreVisible,
  onToggleCore,
}: {
  dimensions: FacetDimension[];
  loading?: boolean;
  /** Dimension slugs currently shown. */
  selected: string[];
  onSelectedChange: (next: string[]) => void;
  /** Core column ids currently shown on this surface. */
  coreVisible: readonly KeywordCoreColumnId[];
  onToggleCore: (id: KeywordCoreColumnId) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const term = search.trim().toLowerCase();
  const matches = dimensions.filter((d) =>
    term === "" ? true : d.label.toLowerCase().includes(term),
  );
  const yours = matches.filter((d) => d.scope === "site");
  const shared = matches.filter((d) => d.scope !== "site");
  const coreMatches = KEYWORD_CORE_COLUMNS.filter((c) =>
    term === "" ? true : c.label.toLowerCase().includes(term),
  );

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
          <span className="ml-0.5 rounded-full bg-muted px-1 text-[10px] text-foreground">
            {coreVisible.length + selected.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a column…"
            className="h-7 pl-7 text-xs"
            aria-label="Find a column"
          />
        </div>
        <div className="max-h-80 space-y-2 overflow-y-auto scrollbar-thin">
          {coreMatches.length > 0 ? (
            <div>
              <p className="px-1.5 pb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                The keyword table
              </p>
              {coreMatches.map((column) => (
                <Row
                  key={column.id}
                  label={column.label}
                  hint={
                    column.id === KEYWORD_REQUIRED_COLUMN ? "always" : undefined
                  }
                  disabled={column.id === KEYWORD_REQUIRED_COLUMN}
                  checked={coreVisible.includes(column.id)}
                  onToggle={() => onToggleCore(column.id)}
                />
              ))}
            </div>
          ) : null}
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
          ) : matches.length === 0 && coreMatches.length === 0 ? (
            <p className="px-1.5 py-2 text-xs text-muted-foreground">
              No column matches “{search.trim()}”. Assign a dimension to a
              keyword and it appears here.
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
