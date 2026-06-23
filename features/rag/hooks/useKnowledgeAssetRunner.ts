"use client";

/**
 * useKnowledgeAssetRunner — drives the Knowledge Asset Builder surface.
 *
 * Loads the derivation rollup (what representations the doc already has +
 * recent runs), then lets the user build / rebuild / cancel each of the six
 * premium derivations with live, per-item progress.
 *
 * State model (mirrors useStageAction / useProcessingRunner but multi-op):
 *   - `operations`: per-kind OpState — status / current / total / message /
 *     chunksWritten / runId / error / startedAt / endedAt. Updated on every
 *     stream event.
 *   - `abortMap`: Map<kind, AbortController> so cancel() can abort the live
 *     fetch (and we POST the cancel endpoint when we have a run_id, so the
 *     server stops the work cooperatively too).
 *
 * On each op's terminal result we refresh the rollup so the KPI tile counts
 * climb live as work lands.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelDeriveRun,
  DERIVE_KINDS,
  fetchDerivations,
  runDeriveStream,
  type DeriveKind,
  type DerivationRollup,
  type DerivationRun,
} from "@/features/rag/api/derivations";

export type OpStatus =
  | "idle"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface OpState {
  kind: DeriveKind;
  status: OpStatus;
  /** Latest progress numbers from the stream. */
  current: number;
  total: number;
  message: string;
  /** Units written by the last completed run (from the result event). */
  chunksWritten: number;
  /** Live run id (captured from the `started` event) — used for cancel. */
  runId: string | null;
  error: string | null;
  startedAt: number | null;
  endedAt: number | null;
}

function freshOp(kind: DeriveKind): OpState {
  return {
    kind,
    status: "idle",
    current: 0,
    total: 0,
    message: "",
    chunksWritten: 0,
    runId: null,
    error: null,
    startedAt: null,
    endedAt: null,
  };
}

function initialOps(): Record<DeriveKind, OpState> {
  return DERIVE_KINDS.reduce(
    (acc, kind) => {
      acc[kind] = freshOp(kind);
      return acc;
    },
    {} as Record<DeriveKind, OpState>,
  );
}

export interface UseKnowledgeAssetRunner {
  derivations: DerivationRollup[];
  runs: DerivationRun[];
  operations: Record<DeriveKind, OpState>;
  /** True while the initial rollup is loading and we have nothing yet. */
  loading: boolean;
  /** Rollup load error (never blocks running an op). */
  loadError: string | null;
  /** Any op currently running. */
  anyRunning: boolean;
  /** True while runAll() is walking the sequence. */
  buildingAll: boolean;
  run: (kind: DeriveKind) => Promise<OpStatus>;
  runAll: () => Promise<void>;
  cancel: (kind: DeriveKind) => void;
  refresh: () => Promise<void>;
}

export function useKnowledgeAssetRunner(
  processedDocumentId: string | null,
): UseKnowledgeAssetRunner {
  const [derivations, setDerivations] = useState<DerivationRollup[]>([]);
  const [runs, setRuns] = useState<DerivationRun[]>([]);
  const [operations, setOperations] = useState<Record<DeriveKind, OpState>>(
    initialOps,
  );
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [buildingAll, setBuildingAll] = useState(false);

  const abortMap = useRef<Map<DeriveKind, AbortController>>(new Map());
  const runIdMap = useRef<Map<DeriveKind, string>>(new Map());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const ac of abortMap.current.values()) ac.abort();
      abortMap.current.clear();
    };
  }, []);

  const patchOp = useCallback(
    (kind: DeriveKind, patch: Partial<OpState>) => {
      setOperations((prev) => ({
        ...prev,
        [kind]: { ...prev[kind], ...patch },
      }));
    },
    [],
  );

  // ----- rollup load -----------------------------------------------------

  const refresh = useCallback(async () => {
    if (!processedDocumentId) return;
    try {
      const res = await fetchDerivations(processedDocumentId);
      if (!mountedRef.current) return;
      setDerivations(res.derivations);
      setRuns(res.runs);
      setLoadError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setLoadError(err instanceof Error ? err.message : "Failed to load");
    }
  }, [processedDocumentId]);

  // Initial load + reset when the doc changes.
  useEffect(() => {
    // Reset op state when switching documents.
    setOperations(initialOps());
    setDerivations([]);
    setRuns([]);
    runIdMap.current.clear();
    if (!processedDocumentId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchDerivations(processedDocumentId)
      .then((res) => {
        if (cancelled) return;
        setDerivations(res.derivations);
        setRuns(res.runs);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [processedDocumentId]);

  // ----- run one op ------------------------------------------------------

  const run = useCallback(
    async (kind: DeriveKind): Promise<OpStatus> => {
      if (!processedDocumentId) return "idle";
      // Guard: don't double-run the same op.
      if (abortMap.current.has(kind)) return "running";

      const ac = new AbortController();
      abortMap.current.set(kind, ac);
      runIdMap.current.delete(kind);

      patchOp(kind, {
        status: "running",
        current: 0,
        total: 0,
        message: "Starting…",
        error: null,
        runId: null,
        startedAt: Date.now(),
        endedAt: null,
      });

      let sawResult = false;
      let resultOk = false;
      let resultChunks = 0;
      let cancelledByServer = false;
      let streamError: string | null = null;

      try {
        for await (const ev of runDeriveStream(processedDocumentId, kind, {
          signal: ac.signal,
        })) {
          if (ac.signal.aborted && ev.event !== "derive.cancelled") break;
          switch (ev.event) {
            case "derive.started": {
              if (ev.data.runId) runIdMap.current.set(kind, ev.data.runId);
              patchOp(kind, { runId: ev.data.runId });
              break;
            }
            case "derive.progress": {
              const msg = ev.data.message;
              setOperations((prev) => ({
                ...prev,
                [kind]: {
                  ...prev[kind],
                  current: ev.data.current,
                  total: ev.data.total,
                  message: msg || prev[kind]?.message || "",
                },
              }));
              break;
            }
            case "derive.result": {
              sawResult = true;
              resultOk = ev.data.ok;
              resultChunks = ev.data.chunksWritten;
              if (!ev.data.ok && ev.data.error) streamError = ev.data.error;
              if (ev.data.runId) runIdMap.current.set(kind, ev.data.runId);
              break;
            }
            case "derive.cancelled": {
              cancelledByServer = true;
              break;
            }
            case "derive.error": {
              streamError = ev.data.message;
              break;
            }
            case "derive.end":
              break;
          }
        }
      } catch (err) {
        if (!ac.signal.aborted) {
          streamError = err instanceof Error ? err.message : String(err);
        }
      } finally {
        abortMap.current.delete(kind);
        runIdMap.current.delete(kind);
      }

      // Settle terminal state.
      let terminal: OpStatus;
      if (cancelledByServer || ac.signal.aborted) {
        terminal = "cancelled";
        patchOp(kind, {
          status: "cancelled",
          message: "Cancelled",
          endedAt: Date.now(),
        });
      } else if (streamError || (sawResult && !resultOk)) {
        terminal = "failed";
        patchOp(kind, {
          status: "failed",
          error: streamError ?? "Derivation failed",
          message: "Failed",
          endedAt: Date.now(),
        });
      } else {
        terminal = "completed";
        patchOp(kind, {
          status: "completed",
          chunksWritten: resultChunks,
          message: "Done",
          endedAt: Date.now(),
        });
      }

      // Refresh the rollup so the KPI tile count climbs live (and recent
      // runs update). Best-effort — never throws into the UI.
      await refresh();
      return terminal;
    },
    [processedDocumentId, patchOp, refresh],
  );

  // ----- run all (sequential, canonical order) ---------------------------

  const runAll = useCallback(async () => {
    if (!processedDocumentId || buildingAll) return;
    setBuildingAll(true);
    try {
      for (const kind of DERIVE_KINDS) {
        if (!mountedRef.current) break;
        const result = await run(kind);
        // If the user cancelled this op, stop the whole sequence — they
        // asked it to stop, not just to skip one step.
        if (result === "cancelled") break;
      }
    } finally {
      if (mountedRef.current) setBuildingAll(false);
    }
  }, [processedDocumentId, buildingAll, run]);

  // ----- cancel ----------------------------------------------------------

  const cancel = useCallback((kind: DeriveKind) => {
    const ac = abortMap.current.get(kind);
    // Abort the local fetch immediately.
    if (ac) ac.abort();
    // POST the cancel endpoint so the server stops the work too (it may have
    // queued chunks the abort alone won't halt). Best-effort.
    const runId = runIdMap.current.get(kind);
    if (runId) {
      void cancelDeriveRun(runId).catch(() => {
        /* idempotent on the server; nothing to surface */
      });
    }
    setOperations((prev) =>
      prev[kind]?.status === "running"
        ? {
            ...prev,
            [kind]: {
              ...prev[kind],
              status: "cancelled",
              message: "Cancelling…",
              endedAt: Date.now(),
            },
          }
        : prev,
    );
  }, []);

  const anyRunning = Object.values(operations).some(
    (op) => op.status === "running",
  );

  return {
    derivations,
    runs,
    operations,
    loading,
    loadError,
    anyRunning,
    buildingAll,
    run,
    runAll,
    cancel,
    refresh,
  };
}
