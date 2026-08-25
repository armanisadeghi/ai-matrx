/**
 * Plain-language recurrence ↔ cron — PURE.
 *
 * `workflow.trigger.cron_expression` is a 5-field cron string, which is a
 * developer artifact. Our user is a subject-matter expert who does not code,
 * so the UI authors a `Recurrence` ("every weekday at 9:00 AM") and this
 * module is the ONE place it becomes cron and back. A cron expression we did
 * not author (or one the person typed themselves) round-trips as `advanced`,
 * so nothing is ever silently rewritten.
 *
 * Cron evaluation itself is NOT reimplemented here: `validateCron` /
 * `nextNCronFires` in `lib/scheduler-client/next-due.ts` are the platform's
 * cron primitives (cron-parser, timezone-aware) and every preview goes
 * through them.
 */

export type RecurrenceMode =
  | "daily"
  | "weekdays"
  | "weekly"
  | "monthly"
  | "hourly"
  | "advanced";

export interface DailyRecurrence {
  mode: "daily";
  hour: number;
  minute: number;
}
export interface WeekdaysRecurrence {
  mode: "weekdays";
  hour: number;
  minute: number;
}
export interface WeeklyRecurrence {
  mode: "weekly";
  /** 0 = Sunday … 6 = Saturday, ascending, at least one. */
  days: number[];
  hour: number;
  minute: number;
}
export interface MonthlyRecurrence {
  mode: "monthly";
  /** 1–28 — days 29–31 are refused so a month can never silently skip. */
  dayOfMonth: number;
  hour: number;
  minute: number;
}
export interface HourlyRecurrence {
  mode: "hourly";
  everyHours: number;
  minute: number;
}
export interface AdvancedRecurrence {
  mode: "advanced";
  expression: string;
}

export type Recurrence =
  | DailyRecurrence
  | WeekdaysRecurrence
  | WeeklyRecurrence
  | MonthlyRecurrence
  | HourlyRecurrence
  | AdvancedRecurrence;

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const SHORT_DAY_NAMES = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

/** The default a fresh schedule opens on: every day at 9:00 in the morning. */
export const DEFAULT_RECURRENCE: Recurrence = {
  mode: "daily",
  hour: 9,
  minute: 0,
};

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/** The `Recurrence` as a 5-field cron expression (minute hour dom month dow). */
export function toCron(recurrence: Recurrence): string {
  switch (recurrence.mode) {
    case "daily": {
      const h = clampInt(recurrence.hour, 0, 23);
      const m = clampInt(recurrence.minute, 0, 59);
      return `${m} ${h} * * *`;
    }
    case "weekdays": {
      const h = clampInt(recurrence.hour, 0, 23);
      const m = clampInt(recurrence.minute, 0, 59);
      return `${m} ${h} * * 1-5`;
    }
    case "weekly": {
      const h = clampInt(recurrence.hour, 0, 23);
      const m = clampInt(recurrence.minute, 0, 59);
      const days = normalizeDays(recurrence.days);
      return `${m} ${h} * * ${days.join(",")}`;
    }
    case "monthly": {
      const h = clampInt(recurrence.hour, 0, 23);
      const m = clampInt(recurrence.minute, 0, 59);
      const dom = clampInt(recurrence.dayOfMonth, 1, 28);
      return `${m} ${h} ${dom} * *`;
    }
    case "hourly": {
      const every = clampInt(recurrence.everyHours, 1, 23);
      const m = clampInt(recurrence.minute, 0, 59);
      return every === 1 ? `${m} * * * *` : `${m} */${every} * * *`;
    }
    case "advanced":
      return recurrence.expression.trim();
  }
}

/** Ascending, de-duplicated, in range; empty falls back to Monday. */
function normalizeDays(days: number[]): number[] {
  const set = new Set<number>();
  for (const day of days) {
    if (Number.isInteger(day) && day >= 0 && day <= 6) set.add(day);
  }
  if (set.size === 0) return [1];
  return [...set].sort((a, b) => a - b);
}

function parseIntStrict(token: string): number | null {
  if (!/^\d{1,2}$/.test(token)) return null;
  const value = Number(token);
  return Number.isInteger(value) ? value : null;
}

/**
 * Read a cron expression back as the plain-language shape that produced it.
 * Anything this does not recognize comes back as `advanced` with the original
 * text — a person's own expression is never rewritten into an approximation.
 */
export function fromCron(expression: string): Recurrence {
  const raw = (expression ?? "").trim();
  const advanced: AdvancedRecurrence = { mode: "advanced", expression: raw };
  const parts = raw.split(/\s+/);
  if (parts.length !== 5) return advanced;
  const [minutePart, hourPart, domPart, monthPart, dowPart] = parts;
  if (monthPart !== "*") return advanced;

  const minute = parseIntStrict(minutePart);
  if (minute === null || minute > 59) return advanced;

  // Every N hours: "M * * * *" or "M */N * * *".
  if (domPart === "*" && dowPart === "*") {
    if (hourPart === "*") return { mode: "hourly", everyHours: 1, minute };
    const stepMatch = /^\*\/(\d{1,2})$/.exec(hourPart);
    if (stepMatch) {
      const every = Number(stepMatch[1]);
      if (every >= 2 && every <= 23) {
        return { mode: "hourly", everyHours: every, minute };
      }
      return advanced;
    }
  }

  const hour = parseIntStrict(hourPart);
  if (hour === null || hour > 23) return advanced;

  // Every day.
  if (domPart === "*" && dowPart === "*") return { mode: "daily", hour, minute };

  // Day of the month.
  if (dowPart === "*" && domPart !== "*") {
    const dom = parseIntStrict(domPart);
    if (dom !== null && dom >= 1 && dom <= 28) {
      return { mode: "monthly", dayOfMonth: dom, hour, minute };
    }
    return advanced;
  }

  // Days of the week.
  if (domPart === "*" && dowPart !== "*") {
    if (dowPart === "1-5") return { mode: "weekdays", hour, minute };
    const tokens = dowPart.split(",");
    const days: number[] = [];
    for (const token of tokens) {
      const day = parseIntStrict(token);
      if (day === null || day > 6) return advanced;
      days.push(day);
    }
    if (days.length === 0) return advanced;
    return { mode: "weekly", days: normalizeDays(days), hour, minute };
  }

  return advanced;
}

/** "9:05 AM" — the time a non-technical person reads, never 24h wire time. */
export function formatTimeOfDay(hour: number, minute: number): string {
  const h = clampInt(hour, 0, 23);
  const m = clampInt(minute, 0, 59);
  const suffix = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:${String(m).padStart(2, "0")} ${suffix}`;
}

function joinDayNames(days: number[]): string {
  const names = normalizeDays(days).map((d) => SHORT_DAY_NAMES[d]);
  if (names.length === 1) return DAY_NAMES[normalizeDays(days)[0]];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** One sentence a person can check at a glance. Never contains cron syntax. */
export function describeRecurrence(recurrence: Recurrence): string {
  switch (recurrence.mode) {
    case "daily":
      return `Every day at ${formatTimeOfDay(recurrence.hour, recurrence.minute)}`;
    case "weekdays":
      return `Every weekday at ${formatTimeOfDay(recurrence.hour, recurrence.minute)}`;
    case "weekly":
      return `Every ${joinDayNames(recurrence.days)} at ${formatTimeOfDay(recurrence.hour, recurrence.minute)}`;
    case "monthly": {
      const day = clampInt(recurrence.dayOfMonth, 1, 28);
      return `On day ${day} of every month at ${formatTimeOfDay(recurrence.hour, recurrence.minute)}`;
    }
    case "hourly": {
      const every = clampInt(recurrence.everyHours, 1, 23);
      const at = `${String(clampInt(recurrence.minute, 0, 59)).padStart(2, "0")} minutes past`;
      return every === 1
        ? `Every hour, at ${at} the hour`
        : `Every ${every} hours, at ${at} the hour`;
    }
    case "advanced":
      return recurrence.expression || "A custom schedule";
  }
}
