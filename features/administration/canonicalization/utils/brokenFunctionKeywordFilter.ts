// features/administration/canonicalization/utils/brokenFunctionKeywordFilter.ts

import type { BrokenFunctionRow } from "../types";

export interface KeywordTagFilterState {
  /** Show rows matching at least one include keyword (when non-empty). */
  include: string[];
  /** Hide rows matching any exclude keyword. */
  exclude: string[];
}

export const EMPTY_KEYWORD_TAG_FILTER: KeywordTagFilterState = {
  include: [],
  exclude: [],
};

/** Searchable text for a broken-function row — all string fields. */
export function brokenFunctionHaystack(row: BrokenFunctionRow): string {
  return [
    row.schema_name,
    row.function_name,
    row.signature,
    row.message,
    row.context,
    row.sqlstate,
    row.level,
    row.lineno != null ? String(row.lineno) : null,
  ]
    .filter((v): v is string => v != null && v !== "")
    .join(" ")
    .toLowerCase();
}

export function keywordTagFilterActive(state: KeywordTagFilterState): boolean {
  return state.include.length > 0 || state.exclude.length > 0;
}

export function filterBrokenFunctionsByKeywords(
  rows: BrokenFunctionRow[],
  state: KeywordTagFilterState,
): BrokenFunctionRow[] {
  const include = state.include
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  const exclude = state.exclude
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);

  if (include.length === 0 && exclude.length === 0) return rows;

  return rows.filter((row) => {
    const hay = brokenFunctionHaystack(row);
    if (include.length > 0 && !include.some((k) => hay.includes(k))) {
      return false;
    }
    if (exclude.length > 0 && exclude.some((k) => hay.includes(k))) {
      return false;
    }
    return true;
  });
}
