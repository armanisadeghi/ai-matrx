// features/hr/settings/pay-groups/period-preview.ts
//
// ROUTE 70'S SIX-PERIOD PREVIEW. Pure, local-calendar arithmetic — no Date-as-instant
// maths, because a pay period is a run of CALENDAR DAYS and a UTC round-trip moves
// its boundaries by a day for half the world.
//
// 🚨 THIS IS A PREVIEW, NOT AN AUTHORITY. `hr.pay_period` rows are cut server-side;
// nothing here writes one and nothing downstream reads these dates. Its whole job is
// to let an admin SEE the consequence of a frequency or a start date BEFORE saving —
// in particular the one that surprises people every time: a semimonthly period ends
// mid-workweek, so an overtime week is split across two pay periods.

export type PayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly";

export type PeriodPreviewRow = {
  index: number;
  startOn: string;
  endOn: string;
  /**
   * True when this period's FIRST day is not the workweek's first day — meaning the
   * boundary that opened it cut through a workweek. FLSA overtime is computed per
   * workweek, so a split week's overtime lands partly in each period.
   */
  splitsWorkweek: boolean;
};

function parseDay(day: string): { y: number; m: number; d: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [y, m, d] = day.split("-").map(Number);
  const probe = new Date(y, m - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) {
    return null;
  }
  return { y, m, d };
}

function toDay(y: number, m: number, d: number): string {
  const probe = new Date(y, m - 1, d);
  const mm = `${probe.getMonth() + 1}`.padStart(2, "0");
  const dd = `${probe.getDate()}`.padStart(2, "0");
  return `${probe.getFullYear()}-${mm}-${dd}`;
}

function addDays(day: string, days: number): string {
  const parsed = parseDay(day);
  if (!parsed) return day;
  return toDay(parsed.y, parsed.m, parsed.d + days);
}

function dayOfWeek(day: string): number {
  const parsed = parseDay(day);
  if (!parsed) return 0;
  return new Date(parsed.y, parsed.m - 1, parsed.d).getDay();
}

function endOfMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

/** The weekday names, indexed the way Postgres's `extract(dow)` counts: 0 = Sunday. */
export const WORKWEEK_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * The next six period boundaries for one pay group.
 *
 * @param firstPeriodStartOn The pay group's anchor day. Every weekly/biweekly period
 *   is counted from it, so moving it moves every future boundary.
 * @param workweekStartDow 0–6, Sunday-first — the same convention the column uses.
 */
export function previewPeriods(args: {
  frequency: string;
  firstPeriodStartOn: string;
  workweekStartDow: number;
  count?: number;
  /** Preview from this day forward. Defaults to today. */
  from?: string;
}): PeriodPreviewRow[] {
  const count = args.count ?? 6;
  const anchor = parseDay(args.firstPeriodStartOn);
  if (!anchor) return [];

  const today = args.from ?? toDay(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    new Date().getDate(),
  );

  const rows: PeriodPreviewRow[] = [];

  const push = (startOn: string, endOn: string) => {
    rows.push({
      index: rows.length + 1,
      startOn,
      endOn,
      splitsWorkweek: dayOfWeek(startOn) !== args.workweekStartDow,
    });
  };

  if (args.frequency === "weekly" || args.frequency === "biweekly") {
    const stride = args.frequency === "weekly" ? 7 : 14;
    // Walk forward from the anchor to the period containing `today`, then take six.
    let start = args.firstPeriodStartOn;
    // A bounded walk: 400 strides covers >7 years of biweekly periods, and an
    // unbounded loop on a malformed anchor would hang the page.
    for (let guard = 0; guard < 400 && addDays(start, stride) <= today; guard += 1) {
      start = addDays(start, stride);
    }
    for (let index = 0; index < count; index += 1) {
      push(start, addDays(start, stride - 1));
      start = addDays(start, stride);
    }
    return rows;
  }

  if (args.frequency === "semimonthly") {
    const cursor = parseDay(today) ?? anchor;
    let { y, m } = cursor;
    let firstHalf = cursor.d <= 15;
    for (let index = 0; index < count; index += 1) {
      if (firstHalf) {
        push(toDay(y, m, 1), toDay(y, m, 15));
      } else {
        push(toDay(y, m, 16), toDay(y, m, endOfMonth(y, m)));
      }
      if (firstHalf) {
        firstHalf = false;
      } else {
        firstHalf = true;
        m += 1;
        if (m > 12) {
          m = 1;
          y += 1;
        }
      }
    }
    return rows;
  }

  if (args.frequency === "monthly") {
    const cursor = parseDay(today) ?? anchor;
    let { y, m } = cursor;
    for (let index = 0; index < count; index += 1) {
      push(toDay(y, m, 1), toDay(y, m, endOfMonth(y, m)));
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    return rows;
  }

  return rows;
}

/** "1 Oct 2026" — the same day format the rest of HR writes. */
export function formatPreviewDay(day: string): string {
  const parsed = parseDay(day);
  if (!parsed) return day;
  return new Date(parsed.y, parsed.m - 1, parsed.d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
