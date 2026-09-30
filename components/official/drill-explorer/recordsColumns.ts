// components/official/drill-explorer/recordsColumns.ts — THE RECORDS TABLE'S WORDS
// (lane DRILL-WAVE1-FIXES, VERIFY-DRILL-WAVE1 F4; program DRILL-FINISH decision 14).
//
// A records column is one of the relation's column names (`user_id`, `model`, `bucket`). Its header
// is the definition's declared word for it (`records.labels`: "Request's top model", "Request tokens
// (on its first call)") — a request-level column must never pass for the call's own — then the
// Dimension it feeds, then the name in plain words. An id column reads its name through the
// Dimension whose column it is (`person` reads `user_id`), not only when the names coincide.

import type { DrillDefinition } from "@ai-matrx/records";

import type { DrillRecordsDeclaration } from "./types";

/** The Dimension a records column feeds: the one keyed by it, or the one read `from` it. */
export function recordsColumnDimension(def: Pick<DrillDefinition, "dimensions">, column: string): string | null {
  const dims = def.dimensions ?? [];
  return (dims.find((d) => d.key === column) ?? dims.find((d) => (d as { from?: string }).from === column))?.key ?? null;
}

/** The words a records column's header reads. */
export function recordsColumnHeader(def: Pick<DrillDefinition, "dimensions">, records: DrillRecordsDeclaration, column: string): string {
  const declared = records.labels?.[column];
  if (declared) return declared;
  const dim = recordsColumnDimension(def, column);
  const label = dim ? def.dimensions.find((d) => d.key === dim)?.label : null;
  return label ?? column.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** An id cell's name, read through the Dimension the column feeds; null when it has none. */
export function recordsCellName(
  def: Pick<DrillDefinition, "dimensions">,
  names: Record<string, Record<string, string>>,
  column: string,
  value: string,
): string | null {
  const dim = recordsColumnDimension(def, column);
  return (dim ? names[dim]?.[value] : undefined) ?? names[column]?.[value] ?? null;
}
