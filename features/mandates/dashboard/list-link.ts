// features/mandates/dashboard/list-link.ts
//
// Every dashboard number that names a set of mandates opens the new list
// (/administration/mandates/list-preview) pre-filtered to that set.
//
// Encoding: lib/entity-list/urlQuery.ts — one `filters` JSON param keyed by
// COLUMN ID, each value an EntityFilterValue. The ids and values below are the
// list's own (features/mandates/admin-list/fields.ts FIELDS + rows.ts) and
// this is the ONE place the dashboard names them.

import { ENTITY_LIST_URL_PARAMS } from "@/lib/entity-list/urlQuery";
import type { EntityFilters } from "@/lib/entity-list/types";

export const MANDATE_LIST_PATH = "/administration/mandates/list-preview";

export const MANDATE_LIST_COLUMN = {
  /** "code" | "soft" */
  origin: "origin",
  /** featureLabelOf(key, module) */
  feature: "featureLabel",
  /** "green" | "orange" | "red" | "unknown" */
  coverage: "coverage",
  /** boolean */
  enabled: "isEnabled",
  /** "Latest" | "v3" | "None" — the default holder only */
  pin: "pinText",
  /** org names | "Personal" | "Global" | "Default" */
  customizedBy: "customizedBy",
  /** "declared" | "import_failed" | "not_in_code" | "unknown" */
  codeState: "codeState",
  /** agent name | "Workflow" */
  holder: "agentName",
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
