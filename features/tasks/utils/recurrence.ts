/**
 * Task recurrence — a deliberate SUBSET of RFC 5545 RRULE stored in
 * workspace.tasks.recurrence_rule, e.g.:
 *
 *   FREQ=DAILY
 *   FREQ=WEEKLY;INTERVAL=2
 *   FREQ=WEEKLY;BYDAY=MO,WE,FR
 *   FREQ=MONTHLY;INTERVAL=3
 *   FREQ=YEARLY
 *
 * Storing the standard grammar keeps us forward-compatible with a full RRULE
 * engine later; this module only implements what the picker can author.
 * Completing a recurring task rolls its due date to the next occurrence and
 * reopens it (Todoist semantics) — see taskService.completeTask.
 */

export interface RecurrenceRule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  /** RRULE two-letter day codes, WEEKLY only. */
  byDay?: ("MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU")[];
}

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

export function parseRecurrenceRule(
  rule: string | null | undefined,
): RecurrenceRule | null {
  if (!rule || !rule.trim()) return null;
  const parts = new Map<string, string>();
  for (const seg of rule.trim().split(";")) {
    const [k, v] = seg.split("=");
    if (k && v) parts.set(k.toUpperCase(), v.toUpperCase());
  }
  const freq = parts.get("FREQ");
  if (
    freq !== "DAILY" &&
    freq !== "WEEKLY" &&
    freq !== "MONTHLY" &&
    freq !== "YEARLY"
  ) {
    return null;
  }
  const interval = Math.max(1, parseInt(parts.get("INTERVAL") ?? "1", 10) || 1);
  type DayCode = (typeof DAY_CODES)[number];
  const byDayRaw = parts.get("BYDAY");
  const byDay = byDayRaw
    ? byDayRaw
        .split(",")
        .filter((d): d is DayCode =>
          (DAY_CODES as readonly string[]).includes(d),
        )
    : undefined;
  return { freq, interval, byDay: byDay?.length ? byDay : undefined };
}

export function formatRecurrenceRule(rule: RecurrenceRule): string {
  const parts = [`FREQ=${rule.freq}`];
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.byDay?.length) parts.push(`BYDAY=${rule.byDay.join(",")}`);
  return parts.join(";");
}

export function describeRecurrenceRule(
  rule: string | null | undefined,
): string | null {
  const r = parseRecurrenceRule(rule);
  if (!r) return null;
  const every = (unit: string) =>
    r.interval === 1 ? `Every ${unit}` : `Every ${r.interval} ${unit}s`;
  switch (r.freq) {
    case "DAILY":
      return every("day");
    case "WEEKLY": {
      const base = every("week");
      if (!r.byDay?.length) return base;
      const names: Record<string, string> = {
        MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu",
        FR: "Fri", SA: "Sat", SU: "Sun",
      };
      return `${base} on ${r.byDay.map((d) => names[d]).join(", ")}`;
    }
    case "MONTHLY":
      return every("month");
    case "YEARLY":
      return every("year");
  }
}

// yyyy-mm-dd helpers, no timezone shift (mirrors @/utils/dateOnly semantics)
function parseDateOnlyLocal(s: string): Date {
  const [y, m, d] = s.split("-").map((n) => parseInt(n, 10));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function toDateOnlyStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Next occurrence strictly AFTER `fromDate` (yyyy-mm-dd). Anchored on the
 * task's due date. Returns null when the rule can't be parsed.
 * Never returns a date in the past: when the task is completed late, the next
 * occurrence is advanced until it lands after today.
 */
export function nextOccurrence(
  rule: string | null | undefined,
  fromDate: string,
  todayStr?: string,
): string | null {
  const r = parseRecurrenceRule(rule);
  if (!r || !fromDate) return null;
  const floor = todayStr && todayStr > fromDate ? todayStr : fromDate;
  let cursor = parseDateOnlyLocal(fromDate);
  const floorDate = parseDateOnlyLocal(floor);

  // Hard cap prevents infinite loops on degenerate input.
  for (let i = 0; i < 1000; i++) {
    switch (r.freq) {
      case "DAILY":
        cursor.setDate(cursor.getDate() + r.interval);
        break;
      case "WEEKLY": {
        if (r.byDay?.length) {
          // Advance day-by-day to the next allowed weekday (respecting the
          // interval when wrapping past the anchor week).
          const allowed = new Set(r.byDay);
          const next = new Date(cursor);
          for (let step = 1; step <= 7 * r.interval + 7; step++) {
            next.setDate(next.getDate() + 1);
            // On wrap into a new week beyond interval boundaries, weeks not on
            // the interval are skipped implicitly by continuing the scan.
            if (allowed.has(DAY_CODES[next.getDay()])) break;
          }
          cursor = next;
        } else {
          cursor.setDate(cursor.getDate() + 7 * r.interval);
        }
        break;
      }
      case "MONTHLY":
        cursor.setMonth(cursor.getMonth() + r.interval);
        break;
      case "YEARLY":
        cursor.setFullYear(cursor.getFullYear() + r.interval);
        break;
    }
    if (cursor > floorDate) return toDateOnlyStr(cursor);
  }
  return null;
}
