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
 * Mirrors `schedules.MIN_INTERVAL_MINUTES`. A crawl is expensive; anything
 * under this is a mistake, not a preference. The server re-checks it, so a
 * drift here is a rejected write, never a runaway crawl.
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
 * coercing an unrecognised cadence into the nearest preset would let opening a
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
