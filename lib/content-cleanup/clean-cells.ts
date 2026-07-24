// lib/content-cleanup/clean-cells.ts
//
// The value-cleanup orchestrator: run the enabled value operations over one
// value, or over a whole set of rows, and report exactly what would change.
//
// Pure and deterministic — same rows + same enabled set always produce the same
// report. Nothing here knows about Supabase, React, or user data tables; a
// consumer supplies rows and fields, gets back a report for review and a set of
// row patches to write through whatever its canonical write path is.
//
// Non-string values are never touched. A number, boolean, array, or object cell
// has no "markup wrapping" problem to solve, and coercing one to a string to
// clean it would be a data-type change wearing a cleanup's clothes.

import { VALUE_CLEANUP_OPERATIONS } from "./value-operations";
import type {
  CellChange,
  CellsCleanupReport,
  CleanableField,
  CleanableRow,
  RowPatch,
  ValueCleanupOperationId,
  ValueCleanupResult,
  ValueOperationOutcome,
} from "./value-types";

/**
 * Run the enabled operations over a single value, in canonical order.
 * Each op sees the output of the previous one, so `` `**x**` `` unwraps twice.
 */
export function cleanValue(
  value: string,
  enabledIds: Iterable<ValueCleanupOperationId>,
): ValueCleanupResult {
  const enabled = new Set(enabledIds);
  const appliedOps: ValueCleanupOperationId[] = [];
  let working = value;

  for (const op of VALUE_CLEANUP_OPERATIONS) {
    if (!enabled.has(op.id)) continue;
    const next = op.run(working);
    if (next !== null && next !== working) {
      working = next;
      appliedOps.push(op.id);
    }
  }

  return {
    before: value,
    after: working,
    changed: working !== value,
    appliedOps,
  };
}

/**
 * Scan `rows` × `fields` and report every cell the enabled operations would
 * rewrite. Read-only: computes the report, writes nothing.
 */
export function cleanCells(
  rows: readonly CleanableRow[],
  fields: readonly CleanableField[],
  enabledIds: Iterable<ValueCleanupOperationId>,
): CellsCleanupReport {
  const enabled = new Set(enabledIds);
  const changes: CellChange[] = [];
  const perOpCounts = new Map<ValueCleanupOperationId, number>();

  let cellsScanned = 0;
  let charsBefore = 0;
  let charsAfter = 0;
  const rowsTouched = new Set<string>();

  for (const row of rows) {
    for (const field of fields) {
      const raw = row.data[field.fieldName];
      // Only string cells participate — see the header note.
      if (typeof raw !== "string") continue;
      cellsScanned++;

      const result = cleanValue(raw, enabled);
      if (!result.changed) continue;

      charsBefore += result.before.length;
      charsAfter += result.after.length;
      rowsTouched.add(row.id);
      for (const id of result.appliedOps) {
        perOpCounts.set(id, (perOpCounts.get(id) ?? 0) + 1);
      }

      changes.push({
        rowId: row.id,
        fieldName: field.fieldName,
        fieldLabel: field.label,
        before: result.before,
        after: result.after,
        appliedOps: result.appliedOps,
      });
    }
  }

  const operations: ValueOperationOutcome[] = VALUE_CLEANUP_OPERATIONS.map(
    (op) => ({
      id: op.id,
      label: op.label,
      human: op.human,
      enabled: enabled.has(op.id),
      changes: perOpCounts.get(op.id) ?? 0,
    }),
  );

  return {
    changed: changes.length > 0,
    changes,
    operations,
    stats: {
      cellsScanned,
      cellsChanged: changes.length,
      rowsChanged: rowsTouched.size,
      charsBefore,
      charsAfter,
    },
  };
}

/**
 * Collapse a set of accepted cell changes into one patch per row — the shape a
 * bulk merge write wants. Only changed fields appear, so a merge write leaves
 * every other key on the row untouched.
 */
export function toRowPatches(changes: readonly CellChange[]): RowPatch[] {
  const byRow = new Map<string, Record<string, string>>();
  for (const change of changes) {
    const existing = byRow.get(change.rowId);
    if (existing) {
      existing[change.fieldName] = change.after;
    } else {
      byRow.set(change.rowId, { [change.fieldName]: change.after });
    }
  }
  return [...byRow.entries()].map(([rowId, data]) => ({ rowId, data }));
}

/**
 * Group changes by operation for the review UI — one card per KIND of change
 * ("Removed backticks wrapping the whole value"), with real examples. A cell
 * touched by two ops appears under both, which is the honest reading: both are
 * reasons that cell is changing.
 */
export interface ValueOperationCard {
  id: ValueCleanupOperationId;
  human: string;
  count: number;
  examples: CellChange[];
}

export function buildValueOperationCards(
  report: CellsCleanupReport,
  perOpLimit = 6,
): ValueOperationCard[] {
  const cards: ValueOperationCard[] = [];
  for (const op of VALUE_CLEANUP_OPERATIONS) {
    const outcome = report.operations.find((o) => o.id === op.id);
    if (!outcome?.enabled || outcome.changes === 0) continue;
    const examples = report.changes.filter((c) => c.appliedOps.includes(op.id));
    cards.push({
      id: op.id,
      human: op.human,
      count: examples.length,
      examples: examples.slice(0, perOpLimit),
    });
  }
  return cards;
}
