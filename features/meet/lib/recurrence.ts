// features/meet/lib/recurrence.ts
//
// THE REPEAT EDITOR'S MODEL ⇄ an RFC 5545 RRULE, in the subset the database
// expands (`communication.meet_rrule_parse`): FREQ=DAILY|WEEKLY|MONTHLY,
// INTERVAL, BYDAY (optionally numbered: 2TU, -1FR), BYMONTHDAY, COUNT, UNTIL.
// One series row, one durable link; the server computes every occurrence and
// holds the wall clock across DST. This file only writes and reads the rule, and
// says it in a sentence. Pure — tested without a DOM.

import type { ZonedParts } from "@/features/meet/lib/zoned-time";

export type RepeatFrequency = "none" | "daily" | "weekly" | "monthly";
export type Weekday = "SU" | "MO" | "TU" | "WE" | "TH" | "FR" | "SA";
export type MonthlyMode = "day-of-month" | "weekday-of-month";
export type RepeatEnd =
  | { readonly kind: "never" }
  | { readonly kind: "on"; readonly date: string }
  | { readonly kind: "after"; readonly count: number };

export interface RecurrenceSpec {
  readonly frequency: RepeatFrequency;
  /** Every N days / weeks / months. */
  readonly interval: number;
  /** Weekly only. Empty = the start's own weekday. */
  readonly weekdays: readonly Weekday[];
  /** Monthly only: "on day 6" or "on the first Tuesday". */
  readonly monthlyMode: MonthlyMode;
  readonly ends: RepeatEnd;
}

/** Sunday-first, the order `Date#getDay` and the chips use. */
export const WEEKDAYS: readonly Weekday[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

export const WEEKDAY_NAMES: Record<Weekday, string> = {
  SU: "Sunday",
  MO: "Monday",
  TU: "Tuesday",
  WE: "Wednesday",
  TH: "Thursday",
  FR: "Friday",
  SA: "Saturday",
};

export const WEEKDAY_CHIPS: Record<Weekday, string> = {
  SU: "S",
  MO: "M",
  TU: "T",
  WE: "W",
  TH: "T",
  FR: "F",
  SA: "S",
};

const ORDINAL_WORDS: Record<number, string> = {
  1: "first",
  2: "second",
  3: "third",
  4: "fourth",
  5: "fifth",
  [-1]: "last",
};

export const NO_REPEAT: RecurrenceSpec = {
  frequency: "none",
  interval: 1,
  weekdays: [],
  monthlyMode: "day-of-month",
  ends: { kind: "never" },
};

/** Which week of its month a day falls in: 1…5, or -1 when it is the last one. */
export function weekOfMonth(start: Pick<ZonedParts, "date" | "day">): number {
  const [y, m] = start.date.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  if (start.day + 7 > daysInMonth) return -1;
  return Math.ceil(start.day / 7);
}

/**
 * The rule for a spec, anchored on the meeting's start as read in its own zone
 * (the weekday of a 5 PM Monday in Los Angeles is Monday, even though it is
 * Tuesday in UTC). `null` = does not repeat.
 */
export function buildRrule(spec: RecurrenceSpec, start: ZonedParts): string | null {
  if (spec.frequency === "none") return null;
  const interval = Math.max(1, Math.min(999, Math.round(spec.interval || 1)));
  const parts: string[] = [`FREQ=${spec.frequency.toUpperCase()}`];
  if (interval > 1) parts.push(`INTERVAL=${interval}`);

  if (spec.frequency === "weekly") {
    const chosen = spec.weekdays.length > 0 ? spec.weekdays : [WEEKDAYS[start.weekday]!];
    const ordered = WEEKDAYS.filter((day) => chosen.includes(day));
    // Monday-first in the rule, the way calendars write it.
    const mondayFirst = [...ordered.filter((d) => d !== "SU"), ...ordered.filter((d) => d === "SU")];
    parts.push(`BYDAY=${mondayFirst.join(",")}`);
  } else if (spec.frequency === "monthly") {
    if (spec.monthlyMode === "weekday-of-month") {
      parts.push(`BYDAY=${weekOfMonth(start)}${WEEKDAYS[start.weekday]!}`);
    } else {
      parts.push(`BYMONTHDAY=${start.day}`);
    }
  }

  if (spec.ends.kind === "after") {
    parts.push(`COUNT=${Math.max(1, Math.min(1000, Math.round(spec.ends.count)))}`);
  } else if (spec.ends.kind === "on") {
    // A date-only UNTIL: the last day the series may happen on, inclusive.
    parts.push(`UNTIL=${spec.ends.date.replace(/-/g, "")}`);
  }
  return parts.join(";");
}

function ruleParts(rule: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of rule.trim().toUpperCase().replace(/^RRULE:/, "").split(";")) {
    const at = part.indexOf("=");
    if (at > 0) map.set(part.slice(0, at), part.slice(at + 1));
  }
  return map;
}

/** A stored rule back into the editor's model. An unknown shape reads as the nearest spec. */
export function parseRrule(rule: string | null | undefined): RecurrenceSpec {
  if (!rule || rule.trim() === "") return NO_REPEAT;
  const parts = ruleParts(rule);
  const freq = parts.get("FREQ");
  const frequency: RepeatFrequency =
    freq === "DAILY" ? "daily" : freq === "WEEKLY" ? "weekly" : freq === "MONTHLY" ? "monthly" : "none";
  const interval = Number(parts.get("INTERVAL") ?? "1") || 1;
  const byday = (parts.get("BYDAY") ?? "").split(",").filter(Boolean);
  const weekdays = byday
    .map((item) => item.slice(-2) as Weekday)
    .filter((day) => WEEKDAYS.includes(day));
  const monthlyMode: MonthlyMode =
    frequency === "monthly" && byday.length > 0 ? "weekday-of-month" : "day-of-month";
  const count = parts.get("COUNT");
  const until = parts.get("UNTIL");
  const ends: RepeatEnd = count
    ? { kind: "after", count: Number(count) }
    : until
      ? { kind: "on", date: `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}` }
      : { kind: "never" };
  return {
    frequency,
    interval,
    weekdays: frequency === "weekly" ? weekdays : [],
    monthlyMode,
    ends,
  };
}

function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

function formatUntil(date: string, locale?: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(locale ?? "en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * The rule in a sentence, the same words the invitation email uses
 * (aidream `invitations.describe_rule`): "Every Tuesday", "Every 2 weeks on
 * Monday and Wednesday", "Monthly on the first Tuesday, 10 times".
 */
export function describeRecurrence(rule: string | null | undefined, locale?: string): string {
  if (!rule || rule.trim() === "") return "Does not repeat";
  const parts = ruleParts(rule);
  const spec = parseRrule(rule);
  const every = spec.interval > 1;
  let head: string;
  if (spec.frequency === "daily") {
    head = every ? `Every ${spec.interval} days` : "Daily";
  } else if (spec.frequency === "weekly") {
    const names = spec.weekdays.map((d) => WEEKDAY_NAMES[d]);
    const weekdaysOnly =
      spec.weekdays.length === 5 && !spec.weekdays.includes("SA") && !spec.weekdays.includes("SU");
    if (weekdaysOnly && !every) head = "Every weekday";
    else if (every) head = `Every ${spec.interval} weeks${names.length ? ` on ${joinWords(names)}` : ""}`;
    else head = names.length ? `Every ${joinWords(names)}` : "Weekly";
  } else if (spec.frequency === "monthly") {
    const base = every ? `Every ${spec.interval} months` : "Monthly";
    const byday = (parts.get("BYDAY") ?? "").split(",").filter(Boolean);
    if (byday.length > 0) {
      const described = byday.map((item) => {
        const ordinal = Number(item.slice(0, -2));
        const name = WEEKDAY_NAMES[item.slice(-2) as Weekday] ?? item;
        return item.length > 2 ? `the ${ORDINAL_WORDS[ordinal] ?? ordinal} ${name}` : `every ${name}`;
      });
      head = `${base} on ${joinWords(described)}`;
    } else if (parts.get("BYMONTHDAY")) {
      head = `${base} on day ${parts.get("BYMONTHDAY")}`;
    } else {
      head = base;
    }
  } else {
    return "Repeats";
  }
  if (spec.ends.kind === "after") return `${head}, ${spec.ends.count} times`;
  if (spec.ends.kind === "on") return `${head}, until ${formatUntil(spec.ends.date, locale)}`;
  return head;
}

/** The quick choices a repeat menu offers for a given start, Google Calendar style. */
export function repeatPresets(start: ZonedParts): { label: string; spec: RecurrenceSpec }[] {
  const weekday = WEEKDAYS[start.weekday]!;
  const name = WEEKDAY_NAMES[weekday];
  const ordinal = ORDINAL_WORDS[weekOfMonth(start)] ?? "";
  const base = { interval: 1, ends: { kind: "never" } as RepeatEnd };
  return [
    { label: "Does not repeat", spec: NO_REPEAT },
    { label: "Daily", spec: { ...base, frequency: "daily", weekdays: [], monthlyMode: "day-of-month" } },
    {
      label: `Weekly on ${name}`,
      spec: { ...base, frequency: "weekly", weekdays: [weekday], monthlyMode: "day-of-month" },
    },
    {
      label: "Every weekday (Monday to Friday)",
      spec: {
        ...base,
        frequency: "weekly",
        weekdays: ["MO", "TU", "WE", "TH", "FR"],
        monthlyMode: "day-of-month",
      },
    },
    {
      label: `Monthly on the ${ordinal} ${name}`,
      spec: { ...base, frequency: "monthly", weekdays: [], monthlyMode: "weekday-of-month" },
    },
    {
      label: `Monthly on day ${start.day}`,
      spec: { ...base, frequency: "monthly", weekdays: [], monthlyMode: "day-of-month" },
    },
  ];
}
