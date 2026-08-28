/**
 * The runs lists, parsed — census #39.
 *
 * `GET /runs` (global, the caller's own runs plus what their access kernel
 * makes discoverable) and `GET /workflows/{id}/runs` (one workflow's history)
 * answer with the same `RunRecord` shape, so ONE parser serves both lists.
 *
 * 🚨 **The timestamps are extras, and that is the server's contract, not a
 * gap.** `RunRecord` is an `_AllowExtra` pydantic model over the `workflow.run`
 * row: `created_at` / `started_at` / `completed_at` reach the wire but are not
 * declared in the OpenAPI schema, so the generated type does not carry them.
 * Reading them off the raw row (defensively, exactly like `RunRow` in
 * `../types.ts` already does) is the honest read — inventing a second server
 * type or a hand-mirrored interface would be the drift this repo keeps paying
 * for. Every field is optional here because every field genuinely can be
 * absent.
 *
 * Pure — no React, no Redux, no fetch.
 */

import type { WorkflowRunStatus } from "@/types/python-generated/workflow-events";
import { TERMINAL_RUN_STATUSES } from "@/types/python-generated/workflow-events";

/** One row of a runs list. */
export interface RunListRow {
  runId: string;
  definitionId: string | null;
  status: string;
  /** When the ENGINE started, falling back to when the row was created. */
  startedAt: string | null;
  completedAt: string | null;
  /** Set for a durable child run (a fan-out item, a subgraph call). */
  parentRunId: string | null;
  /** The kind this run's primary deliverable settled as, when it declared one. */
  deliverableKind: string | null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * The run's own `run_result` wrapper names the kind of each terminal node's
 * output. The PRIMARY deliverable is the first outcome that declares a kind —
 * the wrapper preserves the server's order, and re-sorting it here to guess a
 * "best" one would be inventing an answer the contract did not give.
 *
 * A run with no result, no outcomes, or no declared kinds returns null, which
 * the column renders as "—". A workflow's PROMISE (what it will produce before
 * it produces it) is a different question with a different endpoint —
 * `useResultSchema` — and belongs to the run page, not a history list.
 */
export function primaryDeliverableKind(result: unknown): string | null {
  const wrapper = record(result);
  if (!wrapper) return null;
  const outputs = wrapper.outputs;
  const entries = Array.isArray(outputs)
    ? outputs
    : Object.values(record(outputs) ?? {});
  for (const entry of entries) {
    const outcome = record(entry);
    if (!outcome) continue;
    const kind =
      text(outcome.output_kind) ??
      text(outcome.kind) ??
      text(record(outcome.output)?.__kind);
    if (kind) return kind;
  }
  return null;
}

/** One wire row → one render row, or null when it carries no run id. */
export function parseRunListRow(raw: unknown): RunListRow | null {
  const row = record(raw);
  if (!row) return null;
  const runId = text(row.id);
  if (!runId) return null;
  return {
    runId,
    definitionId: text(row.definition_id),
    status: text(row.status) ?? "",
    startedAt: text(row.started_at) ?? text(row.created_at),
    completedAt: text(row.completed_at),
    parentRunId: text(row.parent_run_id),
    deliverableKind: primaryDeliverableKind(row.result),
  };
}

/** The whole list response, in the server's order (newest first). */
export function parseRunListRows(raw: unknown): RunListRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: RunListRow[] = [];
  for (const item of raw) {
    const row = parseRunListRow(item);
    if (row) rows.push(row);
  }
  return rows;
}

/**
 * How long the run took, in ms — or null when we cannot say honestly.
 *
 * A run still in flight has no duration yet (the run page's live elapsed clock
 * is the surface for that); a finished run with no start instant cannot be
 * measured. Both return null rather than a plausible-looking number.
 */
export function runDurationMs(row: RunListRow, now: number = Date.now()): number | null {
  if (!row.startedAt) return null;
  const start = Date.parse(row.startedAt);
  if (!Number.isFinite(start)) return null;
  const end = row.completedAt ? Date.parse(row.completedAt) : now;
  if (!Number.isFinite(end) || end < start) return null;
  return end - start;
}

/** True once the run is finished forever — no resume, no recovery. */
export function isTerminalStatus(status: string): boolean {
  return TERMINAL_RUN_STATUSES.has(status as WorkflowRunStatus);
}

/** THE DOOR LAW: every row opens its run at the run's permalink. */
export function runHref(row: RunListRow): string {
  return `/workflows/runs/${row.runId}`;
}

/**
 * Fold one `/runs/stream` announcement into a list.
 *
 * The announce channel is EPHEMERAL and carries no row — only "run X is now
 * Y". So a status change patches the row in place (no refetch, no flicker),
 * and a run this list has never seen returns `needsRefresh`, because the only
 * way to learn a new run's timestamps is to read them.
 *
 * Returns the SAME array reference when nothing changed, so a list that is not
 * affected by an announcement does not re-render.
 */
export function applyAnnouncement(
  rows: RunListRow[],
  announce: { run_id: string; status: string },
): { rows: RunListRow[]; needsRefresh: boolean } {
  const index = rows.findIndex((row) => row.runId === announce.run_id);
  if (index === -1) return { rows, needsRefresh: true };
  const existing = rows[index];
  if (existing.status === announce.status) return { rows, needsRefresh: false };
  const patched = rows.slice();
  patched[index] = {
    ...existing,
    status: announce.status,
    // A run that just reached a terminal status stops accruing duration at
    // THIS instant. The server's own completed_at arrives with the next read;
    // until then an unstamped terminal row would measure to `now` forever.
    completedAt:
      existing.completedAt ??
      (isTerminalStatus(announce.status) ? new Date().toISOString() : null),
  };
  return { rows: patched, needsRefresh: false };
}
