/**
 * THE PERSON'S TIME ZONE — pure rules, no React, no Redux.
 *
 * One saved zone (`userPreferences.display.timeZone`, IANA name) answers every
 * "today / now for this person" in the app, and the database's
 * `custom.day_zone` reads the same saved value first. The browser's zone is
 * only the way the saved value gets filled in while the person has not pinned
 * one (`display.timeZoneFollowsDevice`, default on).
 */

/** A real IANA zone the runtime can format in. */
export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || !zone.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** This device's zone, or null when the runtime cannot say. */
export function readDeviceTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}

export interface PersonTimeZoneInput {
  saved: string | null | undefined;
  followsDevice: boolean | null | undefined;
  device: string | null | undefined;
}

/**
 * The zone to read this person's day in. Following the device (the default)
 * the device wins over a stale saved value; pinned, the saved value wins.
 * Nothing known → UTC, the same last step the database takes.
 */
export function resolvePersonTimeZone({ saved, followsDevice, device }: PersonTimeZoneInput): string {
  const savedOk = isValidTimeZone(saved) ? saved : null;
  const deviceOk = isValidTimeZone(device) ? device : null;
  if (followsDevice === false) return savedOk ?? deviceOk ?? "UTC";
  return deviceOk ?? savedOk ?? "UTC";
}

/**
 * What to write to the saved zone, or null for "leave it". Writes only while
 * the person has not pinned a zone, and only when the device's differs.
 */
export function zoneToCapture({ saved, followsDevice, device }: PersonTimeZoneInput): string | null {
  if (followsDevice === false) return null;
  if (!isValidTimeZone(device)) return null;
  return saved === device ? null : device;
}

/** `YYYY-MM-DD` of `at` as read on a wall calendar in `zone`. */
export function dayKeyInZone(zone: string, at: Date = new Date()): string {
  const safe = isValidTimeZone(zone) ? zone : "UTC";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: safe,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Wall-clock `{year, month(1-12), day, hour, minute}` of `at` in `zone`. */
export function wallClockInZone(zone: string, at: Date = new Date()) {
  const safe = isValidTimeZone(zone) ? zone : "UTC";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: safe,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: n("year"), month: n("month"), day: n("day"), hour: n("hour"), minute: n("minute") };
}
