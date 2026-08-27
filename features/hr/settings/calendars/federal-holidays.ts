// features/hr/settings/calendars/federal-holidays.ts
//
// The eleven US federal holidays for one year, with the OBSERVED date computed the
// way 5 U.S.C. §6103 says: a Saturday holiday is observed the preceding Friday, a
// Sunday holiday the following Monday.
//
// 🚨 `actual_on` AND `observed_on` ARE DIFFERENT FACTS AND BOTH ARE STORED.
// `hr.holiday` carries both columns precisely because they diverge: the fourth of
// July is always the fourth of July, and in 2026 it is observed on Friday the third.
// A calendar that only stored the observed date could not answer "was this person
// working on Independence Day?" — and holiday pay rules are written against one, and
// closure rules against the other.
//
// This is a STARTING SET, not the law. Federal holidays bind federal employers;
// everybody else adopts them by choice, so nothing here is applied automatically.

export type FederalHolidaySeed = {
  name: string;
  /** The date the statute names. */
  actualOn: string;
  /** The date it is observed when the actual date falls on a weekend. */
  observedOn: string;
};

function day(y: number, m: number, d: number): string {
  const mm = `${m}`.padStart(2, "0");
  const dd = `${d}`.padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function dow(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d).getDay();
}

/** The `n`th `weekday` of a month — third Monday in January, and so on. */
function nthWeekday(y: number, m: number, weekday: number, n: number): number {
  const first = dow(y, m, 1);
  const offset = (weekday - first + 7) % 7;
  return 1 + offset + (n - 1) * 7;
}

/** The LAST `weekday` of a month — Memorial Day's rule. */
function lastWeekday(y: number, m: number, weekday: number): number {
  const daysInMonth = new Date(y, m, 0).getDate();
  const last = dow(y, m, daysInMonth);
  return daysInMonth - ((last - weekday + 7) % 7);
}

/** 5 U.S.C. §6103's weekend rule: Saturday → the Friday before, Sunday → the Monday after. */
function observed(y: number, m: number, d: number): string {
  const weekday = dow(y, m, d);
  if (weekday === 6) {
    const shifted = new Date(y, m - 1, d - 1);
    return day(shifted.getFullYear(), shifted.getMonth() + 1, shifted.getDate());
  }
  if (weekday === 0) {
    const shifted = new Date(y, m - 1, d + 1);
    return day(shifted.getFullYear(), shifted.getMonth() + 1, shifted.getDate());
  }
  return day(y, m, d);
}

export function federalHolidays(year: number): FederalHolidaySeed[] {
  const fixed = (name: string, m: number, d: number): FederalHolidaySeed => ({
    name,
    actualOn: day(year, m, d),
    observedOn: observed(year, m, d),
  });
  const floating = (name: string, m: number, d: number): FederalHolidaySeed => ({
    name,
    actualOn: day(year, m, d),
    // A floating holiday is defined as a weekday, so it never needs shifting.
    observedOn: day(year, m, d),
  });

  return [
    fixed("New Year's Day", 1, 1),
    floating("Birthday of Martin Luther King, Jr.", 1, nthWeekday(year, 1, 1, 3)),
    floating("Washington's Birthday", 2, nthWeekday(year, 2, 1, 3)),
    floating("Memorial Day", 5, lastWeekday(year, 5, 1)),
    fixed("Juneteenth National Independence Day", 6, 19),
    fixed("Independence Day", 7, 4),
    floating("Labor Day", 9, nthWeekday(year, 9, 1, 1)),
    floating("Columbus Day", 10, nthWeekday(year, 10, 1, 2)),
    fixed("Veterans Day", 11, 11),
    floating("Thanksgiving Day", 11, nthWeekday(year, 11, 4, 4)),
    fixed("Christmas Day", 12, 25),
  ];
}

/** Shift one calendar's holidays forward a year, recomputing the observed date. */
export function shiftYearForward(
  holidays: Array<{ name: string; observed_on: string; actual_on: string | null }>,
): FederalHolidaySeed[] {
  return holidays.map((holiday) => {
    const source = holiday.actual_on ?? holiday.observed_on;
    const [y, m, d] = source.split("-").map(Number);
    return {
      name: holiday.name,
      actualOn: day(y + 1, m, d),
      observedOn: observed(y + 1, m, d),
    };
  });
}
