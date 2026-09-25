// features/mandates/dashboard/list-link.ts
//
// Every dashboard number that names a set of mandates opens the new list
// (/administration/mandates/list-preview) pre-filtered to that set.
//
// Encoding: lib/entity-list/urlQuery.ts — one `filters` JSON param keyed by
// COLUMN ID, each value an EntityFilterValue. The column ids below are the
// ONE place this dashboard names the list's columns; when the list's own
// column ids land (features/mandates/admin-list/), align them here.

import { ENTITY_LIST_URL_PARAMS } from "@/lib/entity-list/urlQuery";
import type { EntityFilters } from "@/lib/entity-list/types";

export const MANDATE_LIST_PATH = "/administration/mandates/list-preview";

export const MANDATE_LIST_COLUMN = {
  origin: "origin",
  feature: "feature",
  coverage: "coverage",
  enabled: "is_enabled",
  pinning: "pinning",
  customizedBy: "customized_by",
  drift: "drift",
} as const;

type Column = (typeof MANDATE_LIST_COLUMN)[keyof typeof MANDATE_LIST_COLUMN];

export function mandateListHref(
  filters: Partial<Record<Column, string | boolean>> = {},
): string {
  const bag: EntityFilters = {};
  for (const [column, value] of Object.entries(filters)) {
    if (value === undefined) continue;
    bag[column] =
      typeof value === "boolean"
        ? { kind: "boolean", value }
        : { kind: "select", values: [value] };
  }
  if (Object.keys(bag).length === 0) return MANDATE_LIST_PATH;
  const params = new URLSearchParams({
    [ENTITY_LIST_URL_PARAMS.filters]: JSON.stringify(bag),
  });
  return `${MANDATE_LIST_PATH}?${params.toString()}`;
}
