// features/admin/spend/explorer/WindowPicker.tsx
//
// Today / Yesterday / Last 24h / 7 days / 30 days / Custom. "Custom" reveals
// two local calendar days (inclusive). Nothing else on the explorer picks a
// time range — this is the one control.
//
// Doc: features/admin/spend/FEATURE.md

"use client";

import { Input, SegmentedControl } from "@ai-matrx/design-system";

import { localDateString, parseLocalDate, WINDOW_PRESETS, type SpendWindowPreset } from "../windows";

export interface WindowPickerProps {
  preset: SpendWindowPreset;
  fromDay: Date | null;
  toDay: Date | null;
  onChange: (next: { preset: SpendWindowPreset; fromDay: Date | null; toDay: Date | null }) => void;
}

export function WindowPicker({ preset, fromDay, toDay, onChange }: WindowPickerProps) {
  const today = localDateString(new Date());
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl
        size="sm"
        value={preset}
        onValueChange={(value) =>
          onChange({ preset: value as SpendWindowPreset, fromDay, toDay })
        }
        data={WINDOW_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
      />
      {preset === "custom" ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <label className="flex items-center gap-1">
            <span>from</span>
            <Input
              type="date"
              aria-label="From day"
              className="h-7 w-[9.5rem] text-xs"
              max={today}
              value={fromDay ? localDateString(fromDay) : ""}
              onChange={(e) =>
                onChange({ preset, fromDay: parseLocalDate(e.target.value), toDay })
              }
            />
          </label>
          <label className="flex items-center gap-1">
            <span>to</span>
            <Input
              type="date"
              aria-label="To day (inclusive)"
              className="h-7 w-[9.5rem] text-xs"
              max={today}
              value={toDay ? localDateString(toDay) : ""}
              onChange={(e) =>
                onChange({ preset, fromDay, toDay: parseLocalDate(e.target.value) })
              }
            />
          </label>
          <span>(both days included)</span>
        </div>
      ) : null}
    </div>
  );
}
