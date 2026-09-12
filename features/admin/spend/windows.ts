// features/admin/spend/windows.ts
//
// The time windows the explorer can look at, and how a window + its drill-down
// filters travel in the URL so a view can be reloaded or handed to someone.
//
// WHY "yesterday" IS A FIRST-CLASS WINDOW (Arman, 2026-09-12): "since it's
// after midnight, I can't easily see the information for 'yesterday' anymore".
// A dashboard that only shows today is worthless one minute past midnight.
//
// Day boundaries are LOCAL midnight in the viewer's zone. The RPC receives
// absolute instants; the zone only decides where the local days are cut when
// it buckets the series.
//
// Doc: features/admin/spend/FEATURE.md

import { SPEND_DIMENSIONS, type SpendDimension, type SpendFilters } from "./types";

export type SpendWindowPreset =
  | "today"
  | "yesterday"
  | "last24h"
  | "last7d"
  | "last30d"
  | "custom";

export interface SpendWindow {
  preset: SpendWindowPreset;
  /** Inclusive start, absolute. */
  from: Date;
  /** Exclusive end, absolute. */
  to: Date;
}

export const WINDOW_PRESETS: ReadonlyArray<{ value: SpendWindowPreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last24h", label: "Last 24h" },
  { value: "last7d", label: "Last 7 days" },
  { value: "last30d", label: "Last 30 days" },
  { value: "custom", label: "Custom" },
];

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** `YYYY-MM-DD` in the viewer's local zone. */
export function localDateString(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parses `YYYY-MM-DD` as LOCAL midnight; null for anything else. */
export function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Resolve a preset to absolute instants. For `custom`, `fromDay`/`toDay` are
 * local calendar days and the window is [fromDay 00:00, toDay+1 00:00) — the
 * end day is INCLUSIVE because that is what a person means by "the 10th to
 * the 11th".
 */
export function resolveWindow(
  preset: SpendWindowPreset,
  now: Date = new Date(),
  fromDay?: Date | null,
  toDay?: Date | null,
): SpendWindow {
  const today = startOfLocalDay(now);
  switch (preset) {
    case "today":
      return { preset, from: today, to: addDays(today, 1) };
    case "yesterday":
      return { preset, from: addDays(today, -1), to: today };
    case "last24h":
      return { preset, from: new Date(now.getTime() - 24 * 3_600_000), to: now };
    case "last7d":
      return { preset, from: addDays(today, -6), to: addDays(today, 1) };
    case "last30d":
      return { preset, from: addDays(today, -29), to: addDays(today, 1) };
    case "custom": {
      const start = fromDay ?? addDays(today, -1);
      const endDay = toDay ?? start;
      const end = addDays(endDay < start ? start : endDay, 1);
      return { preset, from: start, to: end };
    }
  }
}

/** A person-readable name for the window, with its dates when they matter. */
export function describeWindow(w: SpendWindow): string {
  const lastDay = addDays(w.to, -1);
  switch (w.preset) {
    case "today":
      return `Today, ${localDateString(w.from)}`;
    case "yesterday":
      return `Yesterday, ${localDateString(w.from)}`;
    case "last24h":
      return "The last 24 hours";
    case "last7d":
      return `${localDateString(w.from)} to ${localDateString(lastDay)} (7 days)`;
    case "last30d":
      return `${localDateString(w.from)} to ${localDateString(lastDay)} (30 days)`;
    case "custom":
      return localDateString(w.from) === localDateString(lastDay)
        ? localDateString(w.from)
        : `${localDateString(w.from)} to ${localDateString(lastDay)}`;
  }
}

// ── URL state ─────────────────────────────────────────────────────────────────
//
//   ?win=yesterday
//   ?win=custom&from=2026-09-10&to=2026-09-11
//   &f.agent=<uuid>&f.user=<uuid>          (drill-down filters)

const WIN_PARAM = "win";
const FROM_PARAM = "from";
const TO_PARAM = "to";
const FILTER_PREFIX = "f.";

const PRESET_VALUES = new Set<string>(WINDOW_PRESETS.map((p) => p.value));

export interface ExplorerUrlState {
  preset: SpendWindowPreset;
  fromDay: Date | null;
  toDay: Date | null;
  filters: SpendFilters;
}

export function readExplorerUrlState(params: URLSearchParams): ExplorerUrlState {
  const rawPreset = params.get(WIN_PARAM) ?? "";
  const preset: SpendWindowPreset = PRESET_VALUES.has(rawPreset)
    ? (rawPreset as SpendWindowPreset)
    : "yesterday";
  const filters: SpendFilters = {};
  for (const dim of SPEND_DIMENSIONS) {
    const v = params.get(`${FILTER_PREFIX}${dim}`);
    if (v) filters[dim] = v;
  }
  return {
    preset,
    fromDay: parseLocalDate(params.get(FROM_PARAM)),
    toDay: parseLocalDate(params.get(TO_PARAM)),
    filters,
  };
}

/**
 * Writes the explorer state over an existing query string, leaving every
 * parameter it does not own (the tables' own sort/filter state) untouched.
 */
export function writeExplorerUrlState(
  current: URLSearchParams,
  state: ExplorerUrlState,
): URLSearchParams {
  const next = new URLSearchParams(current.toString());
  next.set(WIN_PARAM, state.preset);
  if (state.preset === "custom" && state.fromDay) {
    next.set(FROM_PARAM, localDateString(state.fromDay));
    next.set(TO_PARAM, localDateString(state.toDay ?? state.fromDay));
  } else {
    next.delete(FROM_PARAM);
    next.delete(TO_PARAM);
  }
  for (const dim of SPEND_DIMENSIONS) {
    const key = `${FILTER_PREFIX}${dim}`;
    const v = state.filters[dim];
    if (v) next.set(key, v);
    else next.delete(key);
  }
  return next;
}

export function isSpendDimension(value: string): value is SpendDimension {
  return (SPEND_DIMENSIONS as readonly string[]).includes(value);
}
