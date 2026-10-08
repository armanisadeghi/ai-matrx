// features/spaces/data/view-spec.ts — the ONE builder of a Spaces grid's saved-view spec. The browser's
// grid (DatabaseBlock) and the server's first page (page/space-page-seed.server.ts, `askTablePageSeed({ view })`)
// both call `viewSpec`, so the page the server asks for is the page the grid asks for. No "use client": the
// server imports it.

import type { RuleExpression } from "@ai-matrx/records";
import type { Field } from "@ai-matrx/records/react";
import type { SavedViewSpec } from "@ai-matrx/records-ui";

import type { SpaceDbView } from "./sources";

/** The field's parity type when the store sends it (the memory store does), else its behavior word. */
export function kindOf(f: Field): string {
  const parity: unknown = (f as unknown as Record<string, unknown>)["parity_type"];
  return typeof parity === "string" ? parity : String(f.type);
}

/** A custom table's view filter: its "is" filters (lists are a built-in source's "any of"). */
export function scalarFilters(f: SpaceDbView["filters"]): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(f ?? {})) if (!Array.isArray(v)) out[k] = v;
  return out;
}

/** Notion's default date is "Full date" (January 1, 2026): every date column of an inline grid. */
function longDates(fields: Field[]): Record<string, { id: "date"; options: { dateStyle: "long" } }> {
  const out: Record<string, { id: "date"; options: { dateStyle: "long" } }> = {};
  for (const f of fields) if (kindOf(f) === "date" || kindOf(f) === "datetime") out[f.key] = { id: "date", options: { dateStyle: "long" } };
  return out;
}

/**
 * N6 — the calculation row: the footer measure each column shows (Count all, Sum, Average…), picked on
 * the table's own footer and saved with the block's view (`summaries`, a key the stored view carries
 * through; records-ui's summary bar draws and computes it).
 */
export type ViewWithSummaries = SpaceDbView & { summaries?: Record<string, string> };

export function viewSpec(tableId: string, view: ViewWithSummaries, fields: Field[] = []): SavedViewSpec {
  const layout = view.layout === "chart" ? "grid" : view.layout;
  const formats = longDates(fields);
  const hasFormats = Object.keys(formats).length > 0;
  return {
    name: view.name,
    subject: tableId,
    layout,
    groupField: view.groupField ?? null,
    dateField: view.dateField ?? null,
    startField: view.dateField ?? null,
    sorts: view.sorts ?? [],
    filters: scalarFilters(view.filters),
    ...(view.where ? { where: view.where as unknown as RuleExpression } : {}),
    // Notion's inline table: columns at their natural width, one line each, the table scrolling sideways
    // inside the block when it is wider than the column it sits in (screenshot 1) — never squeezed to "…".
    presentation: { fit: "scroll", wrap: false, ...(view.hiddenFields?.length ? { hiddenFields: view.hiddenFields } : {}), ...(hasFormats ? { formats } : {}), ...(view.summaries && Object.keys(view.summaries).length ? { summaries: view.summaries } : {}), ...(view.widths && Object.keys(view.widths).length ? { widths: view.widths } : {}), ...(view.columnOrder?.length ? { columnOrder: view.columnOrder } : {}), ...(view.wrapColumns?.length ? { wrapColumns: view.wrapColumns } : {}) },
  };
}
