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
type DayCode = (typeof DAY_CODES)[number];

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

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Add whole months while preserving the anchor day-of-month, clamping to the
 * end of shorter months (Jan 31 + 1 month = Feb 28/29, NOT Mar 3). The anchor
 * day is passed separately so repeated rolls never drift off month-end.
 */
function addMonthsClamped(d: Date, months: number, anchorDay: number): Date {
  const total = d.getMonth() + months;
  const year = d.getFullYear() + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const day = Math.min(anchorDay, daysInMonth(year, month));
  return new Date(year, month, day);
}

/**
 * Next occurrence strictly AFTER `fromDate` (yyyy-mm-dd). Anchored on the
 * task's due date. Returns null when the rule can't be parsed.
 * Never returns a date in the past: when the task is completed late, the
 * next occurrence advances until it lands after `todayStr`.
 */
export function nextOccurrence(
  rule: string | null | undefined,
  fromDate: string,
  todayStr?: string,
): string | null {
  const r = parseRecurrenceRule(rule);
  if (!r || !fromDate) return null;
  const floor = todayStr && todayStr > fromDate ? todayStr : fromDate;
  const anchor = parseDateOnlyLocal(fromDate);
  const anchorDay = anchor.getDate();
  const floorDate = parseDateOnlyLocal(floor);
  let cursor = new Date(anchor);

  // For long-overdue DAILY/WEEKLY tasks, fast-forward near the floor first so
  // the iteration cap below can never strip a valid rule of its recurrence.
  if (cursor < floorDate && (r.freq === "DAILY" || r.freq === "WEEKLY")) {
    const stepDays = r.freq === "DAILY" ? r.interval : 7 * r.interval;
    const behindDays = Math.floor(
      (floorDate.getTime() - cursor.getTime()) / 86400000,
    );
    const steps = Math.floor(behindDays / stepDays);
    if (steps > 1) cursor.setDate(cursor.getDate() + (steps - 1) * stepDays);
  }

  // Hard cap prevents infinite loops on degenerate input; with the
  // fast-forward above it is never reached by a valid rule.
  for (let i = 0; i < 5000; i++) {
    switch (r.freq) {
      case "DAILY":
        cursor.setDate(cursor.getDate() + r.interval);
        break;
      case "WEEKLY": {
        if (r.byDay?.length) {
          const allowed = new Set<DayCode>(r.byDay);
          // Week windows are anchored on the ORIGINAL due date's week
          // (weeks start Monday, RRULE default WKST=MO). Only weeks whose
          // index from the anchor week is a multiple of `interval` count.
          const weekStart = (d: Date) => {
            const w = new Date(d);
            const dow = (w.getDay() + 6) % 7; // Mon=0
            w.setDate(w.getDate() - dow);
            w.setHours(0, 0, 0, 0);
            return w;
          };
          const anchorWeek = weekStart(anchor).getTime();
          const next = new Date(cursor);
          for (let step = 1; step <= 7 * r.interval + 7; step++) {
            next.setDate(next.getDate() + 1);
            const weekIndex = Math.round(
              (weekStart(next).getTime() - anchorWeek) / (7 * 86400000),
            );
            if (
              weekIndex % r.interval === 0 &&
              allowed.has(DAY_CODES[next.getDay()])
            ) {
              break;
            }
          }
          cursor = next;
        } else {
          cursor.setDate(cursor.getDate() + 7 * r.interval);
        }
        break;
      }
      case "MONTHLY":
        cursor = addMonthsClamped(cursor, r.interval, anchorDay);
        break;
      case "YEARLY":
        cursor = addMonthsClamped(cursor, 12 * r.interval, anchorDay);
        break;
    }
    if (cursor > floorDate) return toDateOnlyStr(cursor);
  }
  return null;
}
