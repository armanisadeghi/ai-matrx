// features/meet/lib/zoned-time.ts
//
// WALL-CLOCK TIME IN A NAMED ZONE — the arithmetic a meeting form and an agenda
// need and `Date` does not have. A meeting is authored as "Tuesday 10:00 in
// America/Los_Angeles" (the server holds that wall clock across DST); the
// database stores the instant. These pure functions convert between the two with
// `Intl` only — no date library, no network — and are tested in any TZ.

/** `YYYY-MM-DD` + `HH:MM` as read on a clock in `zone`. */
export interface ZonedParts {
  readonly date: string;
  readonly time: string;
  /** 0 = Sunday … 6 = Saturday, in the zone. */
  readonly weekday: number;
  /** Day of the month, in the zone. */
  readonly day: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(zone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatters.set(zone, formatter);
  }
  return formatter;
}

function partsOf(ms: number, zone: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of formatterFor(zone).formatToParts(new Date(ms))) {
    out[part.type] = part.value;
  }
  return out;
}

/** The browser's own zone, or UTC when the runtime cannot say. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Every IANA zone this runtime knows, with the given zone guaranteed present. */
export function timeZoneOptions(ensure: string): string[] {
  let zones: string[] = [];
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf;
    zones = supported ? supported("timeZone") : [];
  } catch {
    zones = [];
  }
  const all = new Set(zones.length > 0 ? zones : ["UTC"]);
  all.add(ensure);
  all.add("UTC");
  return [...all].sort();
}

/** True when `zone` is an IANA zone this runtime can format in. */
export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The zone's offset from UTC at `ms`, in minutes (Los Angeles in summer = -420). */
export function zoneOffsetMinutes(ms: number, zone: string): number {
  const p = partsOf(ms, zone);
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
}

/**
 * "2026-10-06" + "10:00" on a clock in `zone` → the ISO instant. A wall time
 * that does not exist (the hour skipped by a DST change) resolves forward, the
 * way every calendar does.
 */
export function zonedToUtcIso(date: string, time: string, zone: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  if ([y, m, d, hh, mm].some((n) => n === undefined || Number.isNaN(n))) {
    throw new Error(`"${date} ${time}" is not a date and time.`);
  }
  const wall = Date.UTC(y!, m! - 1, d!, hh!, mm!);
  let guess = wall - zoneOffsetMinutes(wall, zone) * 60_000;
  // Once more at the guess: the offset can differ across a DST boundary.
  guess = wall - zoneOffsetMinutes(guess, zone) * 60_000;
  return new Date(guess).toISOString();
}

/** An instant, as read on a clock in `zone`. */
export function utcToZoned(iso: string, zone: string): ZonedParts {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) throw new Error(`"${iso}" is not a time.`);
  const p = partsOf(ms, zone);
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
    weekday: WEEKDAY_INDEX[p.weekday ?? "Sun"] ?? 0,
    day: Number(p.day),
  };
}

/** "PDT" / "GMT+2" — the short name of `zone` at `iso`. */
export function zoneAbbreviation(iso: string, zone: string, locale?: string): string {
  const part = new Intl.DateTimeFormat(locale ?? "en-US", {
    timeZone: zone,
    timeZoneName: "short",
  })
    .formatToParts(new Date(iso))
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? zone;
}

/** "10:00 AM" in `zone`. */
export function formatClock(iso: string, zone: string, locale?: string): string {
  return new Date(iso).toLocaleTimeString(locale ?? "en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "10:00 – 10:30 AM PDT" in `zone` (end omitted when there is no duration). */
export function formatTimeRange(
  startIso: string,
  durationMinutes: number | null,
  zone: string,
  locale?: string,
): string {
  const start = formatClock(startIso, zone, locale);
  const abbreviation = zoneAbbreviation(startIso, zone, locale);
  if (durationMinutes === null || durationMinutes <= 0) return `${start} ${abbreviation}`;
  const endIso = new Date(new Date(startIso).getTime() + durationMinutes * 60_000).toISOString();
  return `${start} – ${formatClock(endIso, zone, locale)} ${abbreviation}`;
}

/** "Tuesday, October 6, 2026" in `zone`. */
export function formatLongDate(iso: string, zone: string, locale?: string): string {
  return new Date(iso).toLocaleDateString(locale ?? "en-US", {
    timeZone: zone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** A readable zone label: "America/Los_Angeles" → "Los Angeles (PDT)". */
export function zoneLabel(zone: string, at: string = new Date().toISOString()): string {
  const city = zone.split("/").pop()?.replace(/_/g, " ") ?? zone;
  return `${city} (${zoneAbbreviation(at, zone)})`;
}
