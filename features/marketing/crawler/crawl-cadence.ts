/**
 * The recurring-crawl cadence vocabulary.
 *
 * This is the client half of ONE contract. The server half is
 * `matrx_scraper/web_crawl/schedules.py` (`CronCadence` / `IntervalCadence` /
 * `parse_cadence`), which is what actually fires the crawl — a `web.crawl_schedule`
 * row whose `cadence` this file cannot produce is a row the dispatcher will
 * DISABLE rather than guess at. So every shape here must round-trip through
 * `parse_cadence`, and the floor below must not drop under the server's.
 *
 * Deliberately small: a schedule says "crawl me again, this often". It carries
 * no crawl knobs — what a scheduled crawl RUNS is resolved server-side by the
 * same `derive_recrawl_config` a human clicking "Crawl again" goes through.
 */

/**
 * Mirrors `schedules.MIN_INTERVAL_MINUTES` and the `v_floor` constant inside the
 * `web.crawl_schedule_cadence_floor` database trigger. A crawl is expensive;
 * anything under this is a mistake, not a preference.
 *
 * This file is the THIRD layer, and the only one whose job is to EXPLAIN. The
 * database trigger is what actually stops the write (it is on the path of this
 * client-direct insert, and of an agent's, and of a human at a psql prompt);
 * the dispatcher is what refuses to fire a row that somehow got stored. Neither
 * of those can say anything useful to a person mid-save, which is why the check
 * is duplicated here — a drift is a confusing error message, never a runaway
 * crawl.
 */
export const MIN_CRAWL_INTERVAL_MINUTES = 15;

export type CrawlCadence =
  | { kind: "cron"; expression: string }
  | { kind: "interval"; minutes: number };

/**
 * The frequencies the UI offers. Not the full contract — a cadence hand-written
 * by an agent or an admin can be any valid cron, and this file reads those back
 * as "custom" rather than flattening them into the nearest preset.
 */
export const CRAWL_FREQUENCIES = [
  "every_6_hours",
  "every_12_hours",
  "daily",
  "weekly",
  "monthly",
] as const;

export type CrawlFrequency = (typeof CRAWL_FREQUENCIES)[number];

export const CRAWL_FREQUENCY_LABELS: Record<CrawlFrequency, string> = {
  every_6_hours: "Every 6 hours",
  every_12_hours: "Every 12 hours",
  daily: "Every day",
  weekly: "Every week",
  monthly: "Every month",
};

/** Whether this frequency lets the user pick a time of day. */
export function frequencyHasTimeOfDay(frequency: CrawlFrequency): boolean {
  return frequency === "daily" || frequency === "weekly" || frequency === "monthly";
}

/**
 * Build the stored cadence for a frequency.
 *
 * Cron is used for daily/weekly/monthly on purpose: the server evaluates a cron
 * expression in the schedule's OWN timezone, so "3am every day" stays 3am
 * across a daylight-saving shift. An interval would drift by an hour twice a
 * year. Sub-daily frequencies use an interval, where wall-clock time is not
 * what the user is asking for.
 *
 * `hour` is ignored for interval frequencies.
 */
export function cadenceForFrequency(
  frequency: CrawlFrequency,
  hour: number,
): CrawlCadence {
  const atHour = clampHour(hour);
  switch (frequency) {
    case "every_6_hours":
      return { kind: "interval", minutes: 6 * 60 };
    case "every_12_hours":
      return { kind: "interval", minutes: 12 * 60 };
    case "daily":
      return { kind: "cron", expression: `0 ${atHour} * * *` };
    case "weekly":
      // Monday — a week's crawl lands before the week's work is looked at.
      return { kind: "cron", expression: `0 ${atHour} * * 1` };
    case "monthly":
      return { kind: "cron", expression: `0 ${atHour} 1 * *` };
  }
}

function clampHour(hour: number): number {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return 3;
  return hour;
}

/**
 * Read a stored `cadence` jsonb back into the typed shape.
 *
 * Returns null for anything this file did not write AND cannot validate —
 * the UI shows those read-only as "custom" instead of rewriting them. Silently
 * coercing an unrecognized cadence into the nearest preset would let opening a
 * form change a schedule nobody touched.
 */
export function parseCrawlCadence(value: unknown): CrawlCadence | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.kind === "cron") {
    return typeof record.expression === "string" && record.expression.trim()
      ? { kind: "cron", expression: record.expression }
      : null;
  }
  if (record.kind === "interval") {
    const { minutes } = record;
    return typeof minutes === "number" &&
      Number.isInteger(minutes) &&
      minutes >= MIN_CRAWL_INTERVAL_MINUTES
      ? { kind: "interval", minutes }
      : null;
  }
  return null;
}

/* ---------------------------------------------------------------------------
 * The frequency floor — COMPUTED, never inferred from the shape of the string
 * ------------------------------------------------------------------------- */

/**
 * The floor used to be enforced on the interval cadence only, so
 * `{ kind: "cron", expression: "*\/10 * * * *" }` was stored and dispatched a
 * full site crawl six times an hour — the exact frequency of the 2026-08
 * runaway-crawl incident. A cron field is not readable by eye: `0 *\/6 * * *` is
 * legal and `0,5 * * * *` is not, and no prefix test separates them. So the
 * expression is expanded and its shortest possible gap is computed, exactly as
 * `web.crawl_cadence_min_gap_minutes` and `schedules.minimum_gap_minutes` do.
 */
const CRON_FIELD_COUNT = 5;
const CRON_FIELD_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 7], // day of week (7 === Sunday === 0)
];
/** Every month length a day-of-month cadence can meet — `*\/2` fires on the 31st
 * and again on the 1st, a one-day gap the shortest month alone would hide. */
const MONTH_LENGTHS = [28, 29, 30, 31] as const;
const MINUTES_PER_DAY = 1440;

/** Thrown for a cadence this file cannot expand OR cannot allow. */
export class CrawlCadenceRefused extends Error {}

/**
 * Every value one numeric cron field can take. Throws on any term it cannot
 * expand — names (`MON`), `L`, `W`, `#` and `?` are refused rather than guessed
 * at, because a field we cannot expand is a field we cannot bound.
 */
function expandCronField(field: string, low: number, high: number): number[] {
  const text = field.trim();
  if (!text) throw new CrawlCadenceRefused("This schedule has an empty cron field.");
  const values = new Set<number>();
  for (const rawTerm of text.split(",")) {
    let term = rawTerm.trim();
    let step = 1;
    if (term.includes("/")) {
      const [base, stepText] = term.split("/", 2);
      if (!/^\d+$/.test(stepText ?? "") || Number(stepText) < 1) {
        throw new CrawlCadenceRefused(`"${rawTerm}" is not a schedule step this system understands.`);
      }
      step = Number(stepText);
      term = (base ?? "").trim();
    }
    let start: number;
    let end: number;
    if (term === "*") {
      start = low;
      end = high;
    } else if (/^\d+-\d+$/.test(term)) {
      const [a, b] = term.split("-", 2);
      start = Number(a);
      end = Number(b);
    } else if (/^\d+$/.test(term)) {
      start = Number(term);
      end = start;
    } else {
      throw new CrawlCadenceRefused(`"${rawTerm}" is not a schedule value this system understands.`);
    }
    if (start < low || end > high || start > end) {
      throw new CrawlCadenceRefused(`"${rawTerm}" is outside the allowed range ${low}-${high}.`);
    }
    for (let value = start; value <= end; value += step) values.add(value);
  }
  if (values.size === 0) {
    throw new CrawlCadenceRefused(`"${field}" never matches anything, so this schedule would never run.`);
  }
  return [...values].sort((a, b) => a - b);
}

/** Smallest step between two consecutive values, or null for a single value. */
function minStep(values: number[]): number | null {
  let best: number | null = null;
  for (let i = 1; i < values.length; i += 1) {
    const gap = values[i] - values[i - 1];
    best = best === null ? gap : Math.min(best, gap);
  }
  return best;
}

function minDayOfWeekGap(values: number[]): number {
  const days = [...new Set(values.map((day) => (day === 7 ? 0 : day)))].sort((a, b) => a - b);
  const wrap = 7 - days[days.length - 1] + days[0];
  const step = minStep(days);
  return Math.max(1, step === null ? wrap : Math.min(step, wrap));
}

function minDayOfMonthGap(values: number[]): number {
  const step = minStep(values);
  let wrap: number | null = null;
  for (const length of MONTH_LENGTHS) {
    const inside = values.filter((value) => value <= length);
    if (inside.length === 0) continue;
    const candidate = length - inside[inside.length - 1] + values[0];
    wrap = wrap === null ? candidate : Math.min(wrap, candidate);
  }
  const wrapGap = wrap ?? 31;
  return Math.max(1, step === null ? wrapGap : Math.min(step, wrapGap));
}

function cronMinGapMinutes(expression: string): number {
  const fields = expression.trim().split(/\s+/).filter(Boolean);
  if (fields.length !== CRON_FIELD_COUNT) {
    throw new CrawlCadenceRefused(
      `This schedule has ${fields.length} parts; a schedule needs exactly ${CRON_FIELD_COUNT} ` +
        "(minute, hour, day of month, month, day of week).",
    );
  }
  const minutes = expandCronField(fields[0], ...CRON_FIELD_RANGES[0]);
  const hours = expandCronField(fields[1], ...CRON_FIELD_RANGES[1]);
  const daysOfMonth = expandCronField(fields[2], ...CRON_FIELD_RANGES[2]);
  expandCronField(fields[3], ...CRON_FIELD_RANGES[3]);
  const daysOfWeek = expandCronField(fields[4], ...CRON_FIELD_RANGES[4]);

  const domAny = fields[2].trim() === "*";
  const dowAny = fields[4].trim() === "*";
  let dayGapDays: number;
  if (domAny && dowAny) {
    dayGapDays = 1;
  } else if (!domAny && !dowAny) {
    // cron ORs a restricted day-of-month with a restricted day-of-week, so the
    // firing days are a union this check does not resolve: the closest they can
    // be is adjacent, and the check rounds toward refusing.
    dayGapDays = 1;
  } else if (dowAny) {
    dayGapDays = minDayOfMonthGap(daysOfMonth);
  } else {
    dayGapDays = minDayOfWeekGap(daysOfWeek);
  }

  const times = [
    ...new Set(hours.flatMap((hour) => minutes.map((minute) => hour * 60 + minute))),
  ].sort((a, b) => a - b);
  // The smallest gap is either between two times on one firing day or ACROSS the
  // day boundary: 23:59 -> 00:00 is one minute, which no per-field check notices.
  const acrossDays = dayGapDays * MINUTES_PER_DAY - times[times.length - 1] + times[0];
  const withinDay = minStep(times);
  return withinDay === null ? acrossDays : Math.min(withinDay, acrossDays);
}

/** The shortest gap this cadence can ever produce, in whole minutes. */
export function crawlCadenceMinGapMinutes(cadence: CrawlCadence): number {
  return cadence.kind === "interval" ? cadence.minutes : cronMinGapMinutes(cadence.expression);
}

/**
 * Why this cadence cannot be saved, in the words of someone who does not read
 * cron — or null when it is fine.
 *
 * Refuses; never clamps. Quietly rounding a 10-minute schedule up to 15 would
 * leave the user believing they configured something they did not.
 */
export function crawlCadenceRefusal(cadence: CrawlCadence): string | null {
  let gap: number;
  try {
    gap = crawlCadenceMinGapMinutes(cadence);
  } catch (error) {
    return error instanceof CrawlCadenceRefused
      ? error.message
      : "This schedule could not be read.";
  }
  if (gap < MIN_CRAWL_INTERVAL_MINUTES) {
    return (
      `This would crawl the site every ${formatMinutes(gap)} — more often than the ` +
      `${formatMinutes(MIN_CRAWL_INTERVAL_MINUTES)} minimum. Crawling is expensive for us ` +
      "and for the site, so this is not allowed. Choose a longer gap."
    );
  }
  return null;
}

/** Throw `crawlCadenceRefusal`'s message, for a write path that must not proceed. */
export function assertCrawlCadenceAllowed(cadence: CrawlCadence): void {
  const refusal = crawlCadenceRefusal(cadence);
  if (refusal) throw new CrawlCadenceRefused(refusal);
}

export interface CrawlCadenceForm {
  frequency: CrawlFrequency;
  hour: number;
}

/**
 * Hydrate the form from a stored cadence, or null when the cadence is valid but
 * not one this UI can represent (a hand-written cron like `*\/20 9-17 * * 1-5`).
 * Null means "show it, don't offer to edit it" — never "reset it".
 */
export function crawlCadenceForm(
  cadence: CrawlCadence | null,
): CrawlCadenceForm | null {
  if (!cadence) return null;
  if (cadence.kind === "interval") {
    if (cadence.minutes === 6 * 60) return { frequency: "every_6_hours", hour: 3 };
    if (cadence.minutes === 12 * 60) return { frequency: "every_12_hours", hour: 3 };
    return null;
  }
  const match = /^0 (\d{1,2}) (\*|1) (\*) (\*|1)$/.exec(cadence.expression.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  const dayOfMonth = match[2];
  const dayOfWeek = match[4];
  if (dayOfMonth === "1" && dayOfWeek === "*") return { frequency: "monthly", hour };
  if (dayOfMonth === "*" && dayOfWeek === "1") return { frequency: "weekly", hour };
  if (dayOfMonth === "*" && dayOfWeek === "*") return { frequency: "daily", hour };
  return null;
}

/** Plain-language description of a cadence, for someone who does not read cron. */
export function describeCrawlCadence(
  cadence: CrawlCadence | null,
  timezone: string,
): string {
  const form = crawlCadenceForm(cadence);
  if (!form) {
    if (!cadence) return "Custom schedule";
    return cadence.kind === "cron"
      ? `Custom schedule (${cadence.expression}, ${timezone})`
      : `Every ${formatMinutes(cadence.minutes)}`;
  }
  if (!frequencyHasTimeOfDay(form.frequency)) {
    return CRAWL_FREQUENCY_LABELS[form.frequency];
  }
  return `${CRAWL_FREQUENCY_LABELS[form.frequency]} at ${formatHour(form.hour)} (${timezone})`;
}

export function formatHour(hour: number): string {
  const normalized = clampHour(hour);
  const suffix = normalized < 12 ? "am" : "pm";
  const display = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${display}${suffix}`;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return minutes === 1 ? "minute" : `${minutes} minutes`;
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? "day" : `${days} days`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "hour" : `${hours} hours`;
  }
  return `${minutes} minutes`;
}

/** The 24 hour options, labelled the way a non-technical user reads a clock. */
export const CRAWL_HOUR_OPTIONS: ReadonlyArray<{ value: number; label: string }> =
  Array.from({ length: 24 }, (_unused, hour) => ({
    value: hour,
    label: formatHour(hour),
  }));

/**
 * The browser's IANA timezone, which is what the user means by "3am". Falls
 * back to UTC only when the runtime cannot report one — the same default the
 * table's column carries.
 */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
