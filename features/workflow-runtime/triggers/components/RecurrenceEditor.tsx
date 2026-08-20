"use client";

/**
 * RecurrenceEditor — how a person who does not code says "every weekday at
 * 9 in the morning".
 *
 * A bare cron box is the thing this exists to avoid: the schedule is authored
 * in plain language, in the person's OWN timezone, and the cron expression is
 * derived (`toCron`). The expression is still shown — and still editable, one
 * click away under "Set it up myself" — because a power user must never be
 * locked out of what the platform can express. Anything typed there stays
 * verbatim (`fromCron` returns `advanced`), never rewritten.
 *
 * The next few real fire times are previewed with the platform's cron
 * primitives (`lib/scheduler-client/next-due.ts`), not a second parser.
 */

import { useMemo } from "react";

import { nextNCronFires, validateCron } from "@/lib/scheduler-client/next-due";

import {
  DAY_NAMES,
  describeRecurrence,
  toCron,
  type Recurrence,
  type RecurrenceMode,
} from "../recurrence";

const MODE_LABELS: Record<RecurrenceMode, string> = {
  daily: "Every day",
  weekdays: "Every weekday (Mon–Fri)",
  weekly: "Certain days of the week",
  monthly: "Once a month",
  hourly: "Every few hours",
  advanced: "Set it up myself",
};

const MODE_ORDER: RecurrenceMode[] = [
  "daily",
  "weekdays",
  "weekly",
  "monthly",
  "hourly",
  "advanced",
];

const COMMON_TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function allTimezones(current: string): string[] {
  const out = new Set<string>([current, browserTimezone(), ...COMMON_TIMEZONES]);
  const supported = Intl as unknown as {
    supportedValuesOf?: (key: string) => string[];
  };
  try {
    for (const zone of supported.supportedValuesOf?.("timeZone") ?? []) {
      out.add(zone);
    }
  } catch {
    // Older engine — the common list above is the whole menu.
  }
  return [...out];
}

/** "24" → the two selects a person actually reads. */
function TimeOfDayPicker({
  hour,
  minute,
  onChange,
}: {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
}) {
  const isPm = hour >= 12;
  const display = hour % 12 === 0 ? 12 : hour % 12;
  const setDisplay = (next: number) => {
    const base = next % 12;
    onChange(isPm ? base + 12 : base, minute);
  };
  return (
    <div className="flex items-center gap-1.5">
      <select
        aria-label="Hour"
        value={display}
        onChange={(e) => setDisplay(Number(e.target.value))}
        className="rounded-md border border-border bg-background px-2 py-1.5 text-base"
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-muted-foreground">:</span>
      <select
        aria-label="Minute"
        value={minute}
        onChange={(e) => onChange(hour, Number(e.target.value))}
        className="rounded-md border border-border bg-background px-2 py-1.5 text-base"
      >
        {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
          <option key={m} value={m}>
            {String(m).padStart(2, "0")}
          </option>
        ))}
      </select>
      <select
        aria-label="Morning or afternoon"
        value={isPm ? "PM" : "AM"}
        onChange={(e) => {
          const base = hour % 12;
          onChange(e.target.value === "PM" ? base + 12 : base, minute);
        }}
        className="rounded-md border border-border bg-background px-2 py-1.5 text-base"
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

export function RecurrenceEditor({
  recurrence,
  timezone,
  onRecurrenceChange,
  onTimezoneChange,
}: {
  recurrence: Recurrence;
  timezone: string;
  onRecurrenceChange: (next: Recurrence) => void;
  onTimezoneChange: (next: string) => void;
}) {
  const expression = toCron(recurrence);
  const cronError = expression ? validateCron(expression, timezone) : "Nothing set yet";
  const upcoming = useMemo(() => {
    if (!expression || cronError) return [];
    try {
      return nextNCronFires(expression, timezone, 3);
    } catch {
      return [];
    }
  }, [cronError, expression, timezone]);

  const hour = "hour" in recurrence ? recurrence.hour : 9;
  const minute = "minute" in recurrence ? recurrence.minute : 0;

  const setMode = (mode: RecurrenceMode) => {
    switch (mode) {
      case "daily":
        onRecurrenceChange({ mode, hour, minute });
        return;
      case "weekdays":
        onRecurrenceChange({ mode, hour, minute });
        return;
      case "weekly":
        onRecurrenceChange({ mode, days: [1], hour, minute });
        return;
      case "monthly":
        onRecurrenceChange({ mode, dayOfMonth: 1, hour, minute });
        return;
      case "hourly":
        onRecurrenceChange({ mode, everyHours: 6, minute });
        return;
      case "advanced":
        // Carry the derived expression across so nothing is lost when a
        // person opens the escape hatch to tweak what they already built.
        onRecurrenceChange({ mode, expression: expression || "0 9 * * *" });
        return;
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label
          htmlFor="recurrence-mode"
          className="text-xs font-medium text-muted-foreground"
        >
          How often should it run?
        </label>
        <select
          id="recurrence-mode"
          value={recurrence.mode}
          onChange={(e) => setMode(e.target.value as RecurrenceMode)}
          className="mt-1 block w-full max-w-sm rounded-md border border-border bg-background p-2 text-base"
        >
          {MODE_ORDER.map((mode) => (
            <option key={mode} value={mode}>
              {MODE_LABELS[mode]}
            </option>
          ))}
        </select>
      </div>

      {recurrence.mode === "weekly" ? (
        <fieldset>
          <legend className="text-xs font-medium text-muted-foreground">
            Which days?
          </legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {DAY_NAMES.map((name, index) => {
              const on = recurrence.days.includes(index);
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    const next = on
                      ? recurrence.days.filter((d) => d !== index)
                      : [...recurrence.days, index];
                    onRecurrenceChange({
                      ...recurrence,
                      days: next.length > 0 ? next : [index],
                    });
                  }}
                  className={
                    on
                      ? "min-h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
                      : "min-h-9 rounded-md border border-border px-3 text-sm text-foreground"
                  }
                >
                  {name.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {recurrence.mode === "monthly" ? (
        <div>
          <label
            htmlFor="recurrence-dom"
            className="text-xs font-medium text-muted-foreground"
          >
            Which day of the month?
          </label>
          <select
            id="recurrence-dom"
            value={recurrence.dayOfMonth}
            onChange={(e) =>
              onRecurrenceChange({
                ...recurrence,
                dayOfMonth: Number(e.target.value),
              })
            }
            className="mt-1 block w-32 rounded-md border border-border bg-background p-2 text-base"
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Days 1–28 only, so it never skips a short month.
          </p>
        </div>
      ) : null}

      {recurrence.mode === "hourly" ? (
        <div>
          <label
            htmlFor="recurrence-every"
            className="text-xs font-medium text-muted-foreground"
          >
            Run it every…
          </label>
          <select
            id="recurrence-every"
            value={recurrence.everyHours}
            onChange={(e) =>
              onRecurrenceChange({
                ...recurrence,
                everyHours: Number(e.target.value),
              })
            }
            className="mt-1 block w-40 rounded-md border border-border bg-background p-2 text-base"
          >
            {[1, 2, 3, 4, 6, 8, 12].map((h) => (
              <option key={h} value={h}>
                {h === 1 ? "hour" : `${h} hours`}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {recurrence.mode === "advanced" ? (
        <div>
          <label
            htmlFor="recurrence-cron"
            className="text-xs font-medium text-muted-foreground"
          >
            Schedule expression
          </label>
          <input
            id="recurrence-cron"
            value={recurrence.expression}
            onChange={(e) =>
              onRecurrenceChange({ mode: "advanced", expression: e.target.value })
            }
            placeholder="0 9 * * 1-5"
            maxLength={200}
            className="mt-1 block w-full max-w-sm rounded-md border border-border bg-background p-2 font-mono text-base"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Five fields: minute, hour, day of month, month, day of week.
          </p>
        </div>
      ) : (
        <div>
          <span className="text-xs font-medium text-muted-foreground">
            {recurrence.mode === "hourly" ? "At which minute past the hour?" : "At what time?"}
          </span>
          <div className="mt-1.5">
            {recurrence.mode === "hourly" ? (
              <select
                aria-label="Minutes past the hour"
                value={recurrence.minute}
                onChange={(e) =>
                  onRecurrenceChange({
                    ...recurrence,
                    minute: Number(e.target.value),
                  })
                }
                className="rounded-md border border-border bg-background px-2 py-1.5 text-base"
              >
                {[0, 15, 30, 45].map((m) => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, "0")} past
                  </option>
                ))}
              </select>
            ) : (
              <TimeOfDayPicker
                hour={hour}
                minute={minute}
                onChange={(h, m) =>
                  onRecurrenceChange({ ...recurrence, hour: h, minute: m } as Recurrence)
                }
              />
            )}
          </div>
        </div>
      )}

      <div>
        <label
          htmlFor="recurrence-tz"
          className="text-xs font-medium text-muted-foreground"
        >
          In which timezone?
        </label>
        <select
          id="recurrence-tz"
          value={timezone}
          onChange={(e) => onTimezoneChange(e.target.value)}
          className="mt-1 block w-full max-w-sm rounded-md border border-border bg-background p-2 text-base"
        >
          {allTimezones(timezone).map((zone) => (
            <option key={zone} value={zone}>
              {zone === browserTimezone() ? `${zone} (yours)` : zone}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-border bg-muted/40 p-2.5">
        {cronError ? (
          <p className="text-xs text-destructive">
            {recurrence.mode === "advanced"
              ? `That expression isn't valid: ${cronError}`
              : cronError}
          </p>
        ) : (
          <>
            <p className="text-xs font-medium text-foreground">
              {describeRecurrence(recurrence)}
            </p>
            {upcoming.length > 0 ? (
              <ul className="mt-1 space-y-0.5">
                {upcoming.map((iso) => (
                  <li key={iso} className="text-[11px] text-muted-foreground">
                    {formatInZone(iso, timezone)}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * An instant written the way the person set the schedule up.
 *
 * Pass the SCHEDULE's timezone for a future fire — that is the promise the
 * person authored ("every day at 9am, Tokyo time"). Pass nothing for a PAST
 * one: history is a moment the viewer is reading, so it belongs in the
 * viewer's own zone. A webhook trigger has no meaningful zone at all — its
 * stored `timezone` is just the "UTC" default — so its history read as
 * "8:11 AM UTC" to somebody for whom it was ten past one in the morning.
 */
export function formatInZone(iso: string, timezone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return date.toLocaleString(undefined, {
      timeZone: timezone ?? browserTimezone(),
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return date.toLocaleString();
  }
}
