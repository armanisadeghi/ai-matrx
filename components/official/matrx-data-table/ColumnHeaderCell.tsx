"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ListFilter,
  ListX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ColumnFilterValue, SortDirection } from "./types";
import type { ResolvedFilterKind } from "./infer-filter";
import { isColumnFilterActive } from "./filter-engine";

interface ColumnHeaderCellProps {
  label: React.ReactNode;
  sortable: boolean;
  isSorted: boolean;
  sortDirection: SortDirection;
  onSortAsc: () => void;
  onSortDesc: () => void;
  onClearSort: () => void;
  /** Header click cycles asc ↔ desc (or starts at asc). */
  onHeaderSortClick: () => void;
  filterKind: ResolvedFilterKind | null;
  filterValue: ColumnFilterValue | undefined;
  onFilterChange: (next: ColumnFilterValue | undefined) => void;
  selectOptions?: Array<{ value: string; label: string }>;
  align?: "left" | "center" | "right";
  className?: string;
}

export function ColumnHeaderCell({
  label,
  sortable,
  isSorted,
  sortDirection,
  onSortAsc,
  onSortDesc,
  onClearSort,
  onHeaderSortClick,
  filterKind,
  filterValue,
  onFilterChange,
  selectOptions = [],
  align = "left",
  className,
}: ColumnHeaderCellProps) {
  const filterActive = isColumnFilterActive(filterValue);

  return (
    <div
      className={cn(
        "flex items-center gap-0.5",
        align === "center" && "justify-center",
        align === "right" && "justify-end",
        className,
      )}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onHeaderSortClick}
          className={cn(
            "inline-flex min-w-0 items-center gap-1 rounded px-0.5 py-0.5 text-left text-xs font-semibold uppercase tracking-wide transition-colors",
            isSorted
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span className="truncate">{label}</span>
          {isSorted ? (
            sortDirection === "asc" ? (
              <ArrowUp className="h-3 w-3 shrink-0 text-primary" />
            ) : (
              <ArrowDown className="h-3 w-3 shrink-0 text-primary" />
            )
          ) : (
            <ArrowUpDown className="h-3 w-3 shrink-0 opacity-40" />
          )}
        </button>
      ) : (
        <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      )}

      {filterKind ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="Sort or filter column"
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "rounded p-0.5 transition-colors",
                filterActive
                  ? "text-primary hover:text-primary/80"
                  : "text-muted-foreground/40 hover:text-muted-foreground",
              )}
            >
              <ListFilter
                className={cn("h-3 w-3", filterActive && "fill-primary/20")}
              />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-60 p-2"
            onClick={(e) => e.stopPropagation()}
          >
            {sortable ? (
              <>
                <div className="flex flex-col gap-0.5 pb-2">
                  <Button
                    variant={
                      isSorted && sortDirection === "asc"
                        ? "secondary"
                        : "ghost"
                    }
                    size="sm"
                    className="h-8 justify-start gap-2 px-2 text-xs font-normal"
                    onClick={onSortAsc}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                    Sort ascending
                  </Button>
                  <Button
                    variant={
                      isSorted && sortDirection === "desc"
                        ? "secondary"
                        : "ghost"
                    }
                    size="sm"
                    className="h-8 justify-start gap-2 px-2 text-xs font-normal"
                    onClick={onSortDesc}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                    Sort descending
                  </Button>
                  {isSorted ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 justify-start gap-2 px-2 text-xs font-normal text-muted-foreground"
                      onClick={onClearSort}
                    >
                      <ListX className="h-3.5 w-3.5" />
                      Clear sort
                    </Button>
                  ) : null}
                </div>
                <div className="mb-2 h-px bg-border" />
              </>
            ) : null}
            <FilterBody
              kind={filterKind}
              value={filterValue}
              onChange={onFilterChange}
              selectOptions={selectOptions}
            />
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}

function FilterBody({
  kind,
  value,
  onChange,
  selectOptions,
}: {
  kind: ResolvedFilterKind;
  value: ColumnFilterValue | undefined;
  onChange: (next: ColumnFilterValue | undefined) => void;
  selectOptions: Array<{ value: string; label: string }>;
}) {
  if (kind === "text") {
    const text = value?.kind === "text" ? value.value : "";
    return (
      <div className="space-y-1.5 px-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Filter
        </p>
        <div className="relative">
          <Input
            autoFocus
            value={text}
            onChange={(e) =>
              onChange(
                e.target.value
                  ? { kind: "text", value: e.target.value }
                  : undefined,
              )
            }
            placeholder="Contains…"
            className="h-8 pr-7 text-sm"
            style={{ fontSize: "16px" }}
          />
          {text ? (
            <button
              type="button"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              onClick={() => onChange(undefined)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (kind === "select") {
    const selected = value?.kind === "select" ? value.value : "__all__";
    return (
      <div className="space-y-1.5 px-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Filter
        </p>
        <Select
          value={selected}
          onValueChange={(v) =>
            onChange(v === "__all__" ? undefined : { kind: "select", value: v })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All</SelectItem>
            {selectOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (kind === "boolean") {
    const current =
      value?.kind === "boolean" ? value.value : ("__all__" as const);
    return (
      <div className="space-y-1.5 px-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Filter
        </p>
        <Select
          value={current === "__all__" ? "__all__" : current ? "true" : "false"}
          onValueChange={(v) => {
            if (v === "__all__") onChange(undefined);
            else onChange({ kind: "boolean", value: v === "true" });
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All</SelectItem>
            <SelectItem value="true">Yes</SelectItem>
            <SelectItem value="false">No</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }

  return <NumberFilterBody value={value} onChange={onChange} />;
}

function NumberFilterBody({
  value,
  onChange,
}: {
  value: ColumnFilterValue | undefined;
  onChange: (next: ColumnFilterValue | undefined) => void;
}) {
  const min = value?.kind === "number" ? value.min : undefined;
  const max = value?.kind === "number" ? value.max : undefined;
  const [minText, setMinText] = useState(min !== undefined ? String(min) : "");
  const [maxText, setMaxText] = useState(max !== undefined ? String(max) : "");

  const commit = (raw: string, which: "min" | "max") => {
    const nextMin = which === "min" ? parseOptionalNumber(raw) : min;
    const nextMax = which === "max" ? parseOptionalNumber(raw) : max;
    if (nextMin === undefined && nextMax === undefined) {
      onChange(undefined);
      return;
    }
    onChange({ kind: "number", min: nextMin, max: nextMax });
  };

  return (
    <div className="space-y-1.5 px-1">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Range
        </p>
        {(min !== undefined || max !== undefined) && (
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => {
              setMinText("");
              setMaxText("");
              onChange(undefined);
            }}
          >
            clear
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <Input
          value={minText}
          onChange={(e) => setMinText(e.target.value)}
          onBlur={(e) => commit(e.target.value, "min")}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder="min"
          className="h-8 font-mono text-xs"
          style={{ fontSize: "16px" }}
        />
        <span className="text-xs text-muted-foreground">–</span>
        <Input
          value={maxText}
          onChange={(e) => setMaxText(e.target.value)}
          onBlur={(e) => commit(e.target.value, "max")}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder="max"
          className="h-8 font-mono text-xs"
          style={{ fontSize: "16px" }}
        />
      </div>
    </div>
  );
}

function parseOptionalNumber(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const n = Number(raw.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}
