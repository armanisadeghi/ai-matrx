"use client";

// features/meet/components/manage/RecurrenceEditor.tsx
//
// REPEAT — Google Calendar's control: a menu of the sensible choices for THIS
// start ("Weekly on Tuesday", "Monthly on the first Tuesday"…) and "Custom…",
// which opens the full editor inline: every N days/weeks/months, weekday chips,
// day-of-month or Nth-weekday, and ends never / on a date / after N times. The
// sentence under it is the one invitees will read in their email.

import { Repeat } from "lucide-react";
import { Input } from "@ai-matrx/design-system";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  WEEKDAYS,
  WEEKDAY_CHIPS,
  WEEKDAY_NAMES,
  buildRrule,
  describeRecurrence,
  repeatPresets,
  weekOfMonth,
  type RecurrenceSpec,
  type RepeatFrequency,
} from "@/features/meet/lib/recurrence";
import type { ZonedParts } from "@/features/meet/lib/zoned-time";

const CUSTOM = "custom";

function sameSpec(
  a: RecurrenceSpec,
  b: RecurrenceSpec,
  start: ZonedParts,
): boolean {
  return buildRrule(a, start) === buildRrule(b, start);
}

const ORDINAL: Record<number, string> = {
  1: "first",
  2: "second",
  3: "third",
  4: "fourth",
  [-1]: "last",
};

export function RecurrenceEditor({
  value,
  onChange,
  start,
  custom,
  onCustomChange,
}: {
  value: RecurrenceSpec;
  onChange: (spec: RecurrenceSpec) => void;
  /** The first meeting's start, read on the meeting's own clock. */
  start: ZonedParts;
  /** Whether the full editor is open. */
  custom: boolean;
  onCustomChange: (open: boolean) => void;
}) {
  const presets = repeatPresets(start);
  const presetIndex = presets.findIndex((p) => sameSpec(p.spec, value, start));
  const selected = custom || presetIndex < 0 ? CUSTOM : String(presetIndex);
  const rule = buildRrule(value, start);
  const weekday = WEEKDAYS[start.weekday]!;

  const set = (patch: Partial<RecurrenceSpec>) =>
    onChange({ ...value, ...patch });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Repeat
          className="h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <Select
          value={selected}
          onValueChange={(next) => {
            if (next === CUSTOM) {
              if (value.frequency === "none") {
                onChange({ ...presets[2]!.spec });
              }
              onCustomChange(true);
              return;
            }
            onCustomChange(false);
            onChange(presets[Number(next)]!.spec);
          }}
        >
          <SelectTrigger className="h-9 w-full sm:w-72" aria-label="Repeat">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {presets.map((preset, index) => (
              <SelectItem key={preset.label} value={String(index)}>
                {preset.label}
              </SelectItem>
            ))}
            <SelectItem value={CUSTOM}>
              {selected === CUSTOM && rule
                ? describeRecurrence(rule)
                : "Custom…"}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {selected === CUSTOM && value.frequency !== "none" ? (
        <div
          className="space-y-3 rounded-md border border-border bg-muted/30 p-3"
          aria-label="Custom repeat"
        >
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Repeat every</span>
            <Input
              type="number"
              min={1}
              max={99}
              value={value.interval}
              onChange={(e) =>
                set({ interval: Math.max(1, Number(e.target.value) || 1) })
              }
              className="h-8 w-16"
              aria-label="Repeat interval"
            />
            <Select
              value={value.frequency}
              onValueChange={(f) => set({ frequency: f as RepeatFrequency })}
            >
              <SelectTrigger className="h-8 w-28" aria-label="Repeat unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">
                  {value.interval === 1 ? "day" : "days"}
                </SelectItem>
                <SelectItem value="weekly">
                  {value.interval === 1 ? "week" : "weeks"}
                </SelectItem>
                <SelectItem value="monthly">
                  {value.interval === 1 ? "month" : "months"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {value.frequency === "weekly" ? (
            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">Repeat on</div>
              <div
                className="flex gap-1.5"
                role="group"
                aria-label="Repeat on days"
              >
                {WEEKDAYS.map((day) => {
                  const chosen =
                    value.weekdays.length === 0
                      ? day === weekday
                      : value.weekdays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={chosen}
                      aria-label={WEEKDAY_NAMES[day]}
                      title={WEEKDAY_NAMES[day]}
                      onClick={() => {
                        const current =
                          value.weekdays.length === 0
                            ? [weekday]
                            : value.weekdays;
                        const next = chosen
                          ? current.filter((d) => d !== day)
                          : [...current, day];
                        set({ weekdays: next.length === 0 ? [weekday] : next });
                      }}
                      className={cn(
                        "h-8 w-8 rounded-full text-xs font-medium transition-colors",
                        chosen
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-foreground ring-1 ring-border hover:bg-accent",
                      )}
                    >
                      {WEEKDAY_CHIPS[day]}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {value.frequency === "monthly" ? (
            <Select
              value={value.monthlyMode}
              onValueChange={(mode) =>
                set({ monthlyMode: mode as RecurrenceSpec["monthlyMode"] })
              }
            >
              <SelectTrigger
                className="h-8 w-full sm:w-72"
                aria-label="Monthly on"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day-of-month">
                  Monthly on day {start.day}
                </SelectItem>
                <SelectItem value="weekday-of-month">
                  Monthly on the {ORDINAL[weekOfMonth(start)]}{" "}
                  {WEEKDAY_NAMES[weekday]}
                </SelectItem>
              </SelectContent>
            </Select>
          ) : null}

          <fieldset className="space-y-1.5">
            <legend className="text-xs text-muted-foreground">Ends</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="repeat-ends"
                checked={value.ends.kind === "never"}
                onChange={() => set({ ends: { kind: "never" } })}
              />
              Never
            </label>
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <input
                type="radio"
                name="repeat-ends"
                checked={value.ends.kind === "on"}
                onChange={() =>
                  set({
                    ends: {
                      kind: "on",
                      date:
                        value.ends.kind === "on" ? value.ends.date : start.date,
                    },
                  })
                }
              />
              On
              <Input
                type="date"
                value={value.ends.kind === "on" ? value.ends.date : ""}
                min={start.date}
                onChange={(e) =>
                  set({ ends: { kind: "on", date: e.target.value } })
                }
                onFocus={() => {
                  if (value.ends.kind !== "on")
                    set({ ends: { kind: "on", date: start.date } });
                }}
                className="h-8 w-40"
                aria-label="Ends on date"
              />
            </label>
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <input
                type="radio"
                name="repeat-ends"
                checked={value.ends.kind === "after"}
                onChange={() =>
                  set({
                    ends: {
                      kind: "after",
                      count:
                        value.ends.kind === "after" ? value.ends.count : 10,
                    },
                  })
                }
              />
              After
              <Input
                type="number"
                min={1}
                max={1000}
                value={value.ends.kind === "after" ? value.ends.count : 10}
                onChange={(e) =>
                  set({
                    ends: {
                      kind: "after",
                      count: Math.max(1, Number(e.target.value) || 1),
                    },
                  })
                }
                onFocus={() => {
                  if (value.ends.kind !== "after")
                    set({ ends: { kind: "after", count: 10 } });
                }}
                className="h-8 w-20"
                aria-label="Ends after occurrences"
              />
              occurrences
            </label>
          </fieldset>
        </div>
      ) : null}

      {rule ? (
        <p className="pl-6 text-xs text-muted-foreground" aria-live="polite">
          {describeRecurrence(rule)}. One link for every session.
        </p>
      ) : null}
    </div>
  );
}
