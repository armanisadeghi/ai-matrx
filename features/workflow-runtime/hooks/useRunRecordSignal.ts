"use client";

/**
 * useRunRecordSignal — the consumer half of the Phase 3 signal→refetch pump.
 *
 * The adapter parses `record_update` / `resource_changed` node_stream frames
 * into bounded per-run signals and bumps revisions in the workflowRuns slice
 * (the pump — it NEVER refetches). A surface displaying data a workflow run
 * writes subscribes here and refetches itself when the revision moves — the
 * side effect stays colocated with the consumer that needs it (the same
 * pattern as the chat pipeline's skills pump).
 *
 *   // any list/record view that a running workflow may be writing to:
 *   useRunRecordSignal(runId, { table: "note" }, () => void refetchNotes());
 *
 * `table` narrows to record_update signals for one matrx-orm table; omit it
 * to fire on EVERY signal (resource_changed included — an unparseable delta
 * still bumps the coarse revision, so nothing is ever silently dropped).
 *
 * The callback is held in a ref (an unstable identity must not re-arm the
 * subscription), and the initial revision never fires — only CHANGES do.
 */

import { useEffect, useRef } from "react";

import { useAppSelector } from "@/lib/redux/hooks";

import {
  selectRunSignalRevision,
  selectRunSignalRevisionForTable,
  selectRunSignals,
} from "../redux/workflow-runs.selectors";
import type { RunRecordSignal } from "../types";

export function useRunRecordSignal(
  runId: string | null,
  options: { table?: string },
  onSignal: (latest: RunRecordSignal | null) => void,
): void {
  const table = options.table;
  const revision = useAppSelector(
    table
      ? selectRunSignalRevisionForTable(runId ?? "", table)
      : selectRunSignalRevision(runId ?? ""),
  );
  const signals = useAppSelector(selectRunSignals(runId ?? ""));

  const onSignalRef = useRef(onSignal);
  useEffect(() => {
    onSignalRef.current = onSignal;
  });
  const lastFiredRef = useRef<number | null>(null);

  useEffect(() => {
    if (!runId) return;
    if (lastFiredRef.current === null) {
      // Arm on first observation — the existing revision is history, not an
      // edge; a surface refetching on mount already has the current data.
      lastFiredRef.current = revision;
      return;
    }
    if (revision === lastFiredRef.current) return;
    lastFiredRef.current = revision;
    const latest = table
      ? [...signals].reverse().find((s) => s.table === table) ?? null
      : signals[signals.length - 1] ?? null;
    onSignalRef.current(latest);
  }, [runId, revision, signals, table]);
}
