"use client";

/**
 * Date-range presets + compare-mode picker for the Search Console workspace.
 * Compact header control: a preset select, an inline custom-range editor,
 * and a compare toggle (none / previous period / year over year).
 *
 * The custom editor is PLAIN conditional rendering — deliberately not a
 * Popover. Opening a popover from inside a closing Radix Select races its
 * dismiss layer (the closing pointer events land "outside" the popover and
 * shut it instantly), which shipped as "the date input flashes and
 * disappears". Inline state can't lose that race.
 */

import { useState } from "react";
import { CalendarRange, Check, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

  const openCustomEditor = () => {
    setDraftFrom(value.customFrom ?? "");
    setDraftTo(value.customTo ?? "");
    setCustomOpen(true);
  };

  return (
    <div className="flex items-center gap-1.5">
      <Select
        value={value.range === "custom" ? "custom" : value.range}
        onValueChange={(next) => {
          if (next === "custom") {
            openCustomEditor();
            return;
          }
          setCustomOpen(false);
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

      {value.range === "custom" && !customOpen ? (
        // Radix's Select won't re-fire onValueChange for the already
        // selected "custom" item, so an applied custom range needs its own
        // edit affordance.
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          aria-label="Edit custom range"
          onClick={openCustomEditor}
        >
          <CalendarRange className="h-3 w-3" />
          Edit
        </Button>
      ) : null}

      {customOpen ? (
        <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5">
          <Input
            type="date"
            value={draftFrom}
            onChange={(e) => setDraftFrom(e.target.value)}
            className="h-6 w-32 border-0 bg-transparent px-1 text-xs"
            aria-label="Start date"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <Input
            type="date"
            value={draftTo}
            onChange={(e) => setDraftTo(e.target.value)}
            className="h-6 w-32 border-0 bg-transparent px-1 text-xs"
            aria-label="End date"
          />
          <Button
            size="sm"
            className="h-6 gap-1 px-1.5 text-xs"
            disabled={!draftFrom || !draftTo || draftFrom > draftTo}
            aria-label="Apply custom range"
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
            <Check className="h-3 w-3" />
            Apply
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1 text-xs"
            aria-label="Cancel custom range"
            onClick={() => setCustomOpen(false)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : null}

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
