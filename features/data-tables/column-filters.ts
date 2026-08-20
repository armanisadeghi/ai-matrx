/**
 * Column filter model for user data tables.
 *
 * A filter used to be one substring per column, which meant you had to already
 * know what was in a column to filter it — stray values and typos stayed
 * invisible, and there was no way to ask for "empty" or "not this". A filter is
 * now a structured object with a mode, which is also what makes it possible to
 * put filters in the URL and save them as a named view later. Never go back to
 * a bare string.
 *
 * Pure module on purpose: no React, no Supabase. `applyColumnFilters` is the
 * ONE place a row is tested against a filter, so the grid, the copy/export row
 * source, and anything added later can never disagree about what "matching"
 * means.
 */

/** Pick specific values (the common case once a column's values are known). */
export type ValuesFilter = {
  mode: "values";
  /** Selected values, compared case-insensitively against the cell. */
  values: string[];
  /** Also match rows whose cell is null or whitespace-only. */
  includeBlank: boolean;
  /** Invert: match everything EXCEPT the selection. */
  negate: boolean;
};

/** Free-text substring — always available, whatever the column holds. */
export type TextFilter = {
  mode: "text";
  text: string;
};

/** Numeric or date range. Either bound may be omitted for an open range. */
export type RangeFilter = {
  mode: "range";
  min: string;
  max: string;
};

export type ColumnFilter = ValuesFilter | TextFilter | RangeFilter;

export type ColumnFilterMap = Record<string, ColumnFilter>;

/**
 * Is this filter actually narrowing anything?
 *
 * An empty filter must be treated as ABSENT rather than as "matches nothing" —
 * an unticked checklist that hid every row would look like data loss.
 */
export function isActiveFilter(filter: ColumnFilter | undefined): boolean {
  if (!filter) return false;
  switch (filter.mode) {
    case "text":
      return filter.text.trim() !== "";
    case "values":
      return filter.values.length > 0 || filter.includeBlank;
    case "range":
      return filter.min.trim() !== "" || filter.max.trim() !== "";
  }
}

export function activeFilterEntries(
  filters: ColumnFilterMap,
): [string, ColumnFilter][] {
  return Object.entries(filters).filter(([, f]) => isActiveFilter(f));
}

export function hasAnyActiveFilter(filters: ColumnFilterMap): boolean {
  return activeFilterEntries(filters).length > 0;
}

/** The cell as comparable text. Objects/arrays stringify so JSON is searchable. */
function cellText(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "object") {
    try {
      return JSON.stringify(raw);
    } catch {
      return String(raw);
    }
  }
  return String(raw);
}

function toNumeric(text: string): number | null {
  const cleaned = text.replace(/[,\s$%]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  if (Number.isFinite(n)) return n;
  // Dates compare correctly as timestamps, which is what makes ONE range
  // filter work for both a number column and a date column.
  const t = Date.parse(text);
  return Number.isFinite(t) ? t : null;
}

/** Does one cell satisfy one filter? */
export function matchesFilter(raw: unknown, filter: ColumnFilter): boolean {
  const text = cellText(raw);
  const trimmed = text.trim();

  switch (filter.mode) {
    case "text": {
      const needle = filter.text.trim().toLowerCase();
      if (needle === "") return true;
      return text.toLowerCase().includes(needle);
    }

    case "values": {
      const blank = trimmed === "";
      const selected = filter.values.some(
        (v) => v.trim().toLowerCase() === trimmed.toLowerCase(),
      );
      const hit = (blank && filter.includeBlank) || (!blank && selected);
      return filter.negate ? !hit : hit;
    }

    case "range": {
      // A range never silently drops the rows it cannot compare — a blank or
      // unparseable cell is excluded only because it genuinely is not in the
      // range, and that is the same answer a spreadsheet gives.
      const value = toNumeric(trimmed);
      if (value === null) return false;
      const min = filter.min.trim() === "" ? null : toNumeric(filter.min);
      const max = filter.max.trim() === "" ? null : toNumeric(filter.max);
      if (min !== null && value < min) return false;
      if (max !== null && value > max) return false;
      return true;
    }
  }
}

/**
 * Filter a row set. Columns AND together; values within one column OR together
 * — the behaviour every spreadsheet and every BI tool has, so it needs no
 * explanation in the UI.
 */
export function applyColumnFilters<
  T extends { data?: Record<string, unknown> | null },
>(rows: T[], filters: ColumnFilterMap): T[] {
  const active = activeFilterEntries(filters);
  if (active.length === 0) return rows;
  return rows.filter((row) =>
    active.every(([fieldName, filter]) =>
      matchesFilter(row?.data?.[fieldName], filter),
    ),
  );
}

/** A short human summary for a filter chip. */
export function describeFilter(filter: ColumnFilter): string {
  switch (filter.mode) {
    case "text":
      return `contains "${filter.text.trim()}"`;
    case "values": {
      const parts: string[] = [];
      if (filter.values.length === 1) parts.push(filter.values[0]);
      else if (filter.values.length > 1) parts.push(`${filter.values.length} values`);
      if (filter.includeBlank) parts.push("empty");
      const joined = parts.join(" or ");
      return filter.negate ? `is not ${joined}` : `is ${joined}`;
    }
    case "range": {
      const min = filter.min.trim();
      const max = filter.max.trim();
      if (min && max) return `${min} to ${max}`;
      if (min) return `at least ${min}`;
      return `at most ${max}`;
    }
  }
}

/** The empty filter for a mode — what a freshly-opened control starts from. */
export function emptyFilter(mode: ColumnFilter["mode"]): ColumnFilter {
  switch (mode) {
    case "text":
      return { mode: "text", text: "" };
    case "values":
      return { mode: "values", values: [], includeBlank: false, negate: false };
    case "range":
      return { mode: "range", min: "", max: "" };
  }
}

/**
 * Which control should a column open with?
 *
 * A checklist only helps when the values are few enough to scan and short
 * enough to read; anything else gets the text box it always had. Numbers and
 * dates prefer a range, but ONLY once they have more distinct values than a
 * checklist would comfortably show — a status column storing 1/2/3 is far
 * better picked than ranged.
 */
export function defaultFilterMode(args: {
  dataType: string;
  distinctCount: number;
  maxLength: number;
}): ColumnFilter["mode"] {
  const { dataType, distinctCount, maxLength } = args;
  const listable = distinctCount > 0 && distinctCount <= 40 && maxLength <= 120;
  const numeric =
    dataType === "number" ||
    dataType === "integer" ||
    dataType === "date" ||
    dataType === "datetime";
  if (listable) return "values";
  if (numeric) return "range";
  return "text";
}
