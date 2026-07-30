"use client";

/**
 * Date-range presets + compare-mode picker for the Search Console workspace.
 * Compact header control: a preset select, a custom-range popover, and a
 * compare toggle (none / previous period / year over year).
 */

import { useState } from "react";
import { CalendarRange } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  GscCompareMode,
  GscRangeKey,
} from "@/features/marketing/search-console/types";
import { GSC_RANGE_PRESETS } from "@/features/marketing/search-console/types";

export interface RangeCompareValue {
  range: GscRangeKey;
  customFrom: string | null;
  customTo: string | null;
  compare: GscCompareMode;
}

export function RangeCompareControl({
  value,
  onChange,
  disabled,
}: {
  value: RangeCompareValue;
  onChange: (next: RangeCompareValue) => void;
  disabled?: boolean;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(value.customFrom ?? "");
  const [draftTo, setDraftTo] = useState(value.customTo ?? "");

  const rangeLabel =
    value.range === "custom"
      ? `${value.customFrom ?? "?"} → ${value.customTo ?? "?"}`
      : (GSC_RANGE_PRESETS.find((r) => r.key === value.range)?.label ??
        value.range);

  return (
    <div className="flex items-center gap-1.5">
      <Select
        value={value.range === "custom" ? "custom" : value.range}
        onValueChange={(next) => {
          if (next === "custom") {
            setCustomOpen(true);
            return;
          }
          onChange({
            ...value,
            range: next as GscRangeKey,
            customFrom: null,
            customTo: null,
          });
        }}
        disabled={disabled}
      >
        <SelectTrigger
          size="sm"
          className="h-7 w-auto gap-1 border-border bg-card px-2 text-xs"
          aria-label="Date range"
        >
          <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
          <SelectValue>{rangeLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {GSC_RANGE_PRESETS.map((preset) => (
            <SelectItem key={preset.key} value={preset.key} className="text-xs">
              {preset.label}
            </SelectItem>
          ))}
          <SelectItem value="custom" className="text-xs">
            Custom range…
          </SelectItem>
        </SelectContent>
      </Select>

      <Popover open={customOpen} onOpenChange={setCustomOpen}>
        <PopoverTrigger asChild>
          <span aria-hidden className="sr-only" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 space-y-2 p-3">
          <p className="text-xs font-medium text-foreground">Custom range</p>
          <div className="space-y-1.5">
            <Input
              type="date"
              value={draftFrom}
              onChange={(e) => setDraftFrom(e.target.value)}
              className="h-8 text-xs"
              aria-label="Start date"
            />
            <Input
              type="date"
              value={draftTo}
              onChange={(e) => setDraftTo(e.target.value)}
              className="h-8 text-xs"
              aria-label="End date"
            />
          </div>
          <div className="flex justify-end gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setCustomOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!draftFrom || !draftTo || draftFrom > draftTo}
              onClick={() => {
                onChange({
                  ...value,
                  range: "custom",
                  customFrom: draftFrom,
                  customTo: draftTo,
                });
                setCustomOpen(false);
              }}
            >
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Select
        value={value.compare}
        onValueChange={(next) =>
          onChange({ ...value, compare: next as GscCompareMode })
        }
        disabled={disabled}
      >
        <SelectTrigger
          size="sm"
          className="h-7 w-auto border-border bg-card px-2 text-xs"
          aria-label="Compare mode"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none" className="text-xs">
            No compare
          </SelectItem>
          <SelectItem value="prev" className="text-xs">
            vs previous period
          </SelectItem>
          <SelectItem value="yoy" className="text-xs">
            vs last year
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
