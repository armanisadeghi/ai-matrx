"use client";

import { ArrowUpDown, ChevronDown, ChevronUp, Filter } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { cn } from "@/styles/themes/utils";

import {
  type ColumnFilter,
  type ColumnFilterType,
  type SortDirection,
  isColumnFilterActive,
} from "../utils/tableFilters";

export function KgSortIcon({
  active,
  dir,
}: {
  active: boolean;
  dir: SortDirection;
}) {
  if (!active) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
  return dir === "asc" ? (
    <ChevronUp className="h-3 w-3" />
  ) : (
    <ChevronDown className="h-3 w-3" />
  );
}

function ColumnFilterPopover({
  label,
  filterType,
  value,
  enumOptions,
  onChange,
}: {
  label: string;
  filterType: Exclude<ColumnFilterType, "text">;
  value: ColumnFilter | undefined;
  enumOptions?: string[];
  onChange: (value: ColumnFilter | undefined) => void;
}) {
  const active = isColumnFilterActive(value, filterType);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded hover:bg-muted",
            active && "text-primary",
          )}
          title={`Filter ${label}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Filter className={cn("h-3 w-3", !active && "opacity-50")} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-2 p-3">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Filter {label}
        </div>

        {filterType === "enum" ? (
          <div className="max-h-56 space-y-1 overflow-y-auto">
            {(enumOptions ?? []).length === 0 ? (
              <div className="text-xs text-muted-foreground">No values</div>
            ) : (
              (enumOptions ?? []).map((opt) => {
                const selected = value?.enumValues?.includes(opt) ?? false;
                return (
                  <label
                    key={opt}
                    className="flex cursor-pointer items-center gap-2 py-0.5 text-xs"
                  >
                    <Checkbox
                      checked={selected}
                      onCheckedChange={() => {
                        const next = new Set(value?.enumValues ?? []);
                        if (next.has(opt)) next.delete(opt);
                        else next.add(opt);
                        onChange({
                          ...(value ?? {}),
                          enumValues: Array.from(next),
                        });
                      }}
                    />
                    <span className="truncate" title={opt}>
                      {opt}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        ) : null}

        {filterType === "number" ? (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              placeholder="Min"
              value={value?.numMin ?? ""}
              onChange={(e) =>
                onChange({
                  ...(value ?? {}),
                  numMin: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              className="h-8 text-base"
            />
            <span className="text-xs text-muted-foreground">–</span>
            <Input
              type="number"
              placeholder="Max"
              value={value?.numMax ?? ""}
              onChange={(e) =>
                onChange({
                  ...(value ?? {}),
                  numMax: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              className="h-8 text-base"
            />
          </div>
        ) : null}

        {filterType === "date" ? (
          <div className="space-y-2">
            <label className="block text-[10px] uppercase tracking-wide text-muted-foreground">
              From
              <Input
                type="date"
                value={value?.dateFrom ?? ""}
                onChange={(e) =>
                  onChange({ ...(value ?? {}), dateFrom: e.target.value })
                }
                className="mt-0.5 h-8 text-base"
              />
            </label>
            <label className="block text-[10px] uppercase tracking-wide text-muted-foreground">
              To
              <Input
                type="date"
                value={value?.dateTo ?? ""}
                onChange={(e) =>
                  onChange({ ...(value ?? {}), dateTo: e.target.value })
                }
                className="mt-0.5 h-8 text-base"
              />
            </label>
          </div>
        ) : null}

        <div className="flex justify-between pt-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onChange(undefined)}
            disabled={!active}
          >
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function KgInspectorColumnHeader({
  label,
  sortKey,
  activeSortKey,
  sortDir,
  onSort,
  align = "left",
  filterType,
  textValue,
  onTextChange,
  selectValue,
  selectOptions,
  onSelectChange,
  columnFilter,
  onColumnFilterChange,
  enumOptions,
  sortable = true,
  filterable = true,
}: {
  label: string;
  sortKey: string;
  activeSortKey: string;
  sortDir: SortDirection;
  onSort: (key: string) => void;
  align?: "left" | "right";
  filterType?: ColumnFilterType;
  textValue?: string;
  onTextChange?: (value: string) => void;
  selectValue?: string;
  selectOptions?: { value: string; label: string }[];
  onSelectChange?: (value: string) => void;
  columnFilter?: ColumnFilter;
  onColumnFilterChange?: (value: ColumnFilter | undefined) => void;
  enumOptions?: string[];
  sortable?: boolean;
  filterable?: boolean;
}) {
  const showTextFilter = filterable && filterType === "text" && onTextChange;
  const showSelectFilter =
    filterable && filterType === "enum" && selectOptions && onSelectChange;
  const showPopoverFilter =
    filterable &&
    filterType &&
    filterType !== "text" &&
    filterType !== "enum" &&
    onColumnFilterChange;

  return (
    <div className="space-y-1">
      <div
        className={cn(
          "flex items-center gap-1",
          align === "right" && "justify-end",
          sortable && "cursor-pointer select-none hover:text-primary",
        )}
        onClick={() => {
          if (sortable) onSort(sortKey);
        }}
      >
        <span className="font-semibold">{label}</span>
        {sortable ? (
          <KgSortIcon active={activeSortKey === sortKey} dir={sortDir} />
        ) : null}
        {showPopoverFilter ? (
          <ColumnFilterPopover
            label={label}
            filterType={filterType}
            value={columnFilter}
            enumOptions={enumOptions}
            onChange={onColumnFilterChange}
          />
        ) : null}
      </div>

      {showTextFilter ? (
        <Input
          placeholder="Filter…"
          value={textValue ?? ""}
          onChange={(e) => onTextChange(e.target.value)}
          className="h-7 text-base"
          onClick={(e) => e.stopPropagation()}
        />
      ) : null}

      {showSelectFilter ? (
        <Select value={selectValue} onValueChange={onSelectChange}>
          <SelectTrigger
            className="h-7 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            {selectOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}
