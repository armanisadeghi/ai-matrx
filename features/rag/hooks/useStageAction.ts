"use client";

/**
 * useStageAction — run one stage (extract / clean / chunk / embed / run-all)
 * and surface live progress to the component layer.
 *
 * Returns a single object with a `running` flag, the latest progress
 * frame, the final result, and an `error` if the stream failed. Calling
 * `start()` opens the streaming connection; `cancel()` aborts it.
 */

import { useCallback, useRef, useState } from "react";
import {
  runStageStream,
  type StageName,
  type StagePhase,
  type StageStreamEvent,
} from "@/features/knowledge/api/stages";

export interface StageProgressFrame {
  stage: StageName;
  phase: StagePhase;
  message: string;
  current: number;
  total: number;
  extra: Record<string, unknown>;
  /** Receipt of activity — last update time, in ms since epoch. */
  lastUpdate: number;
}

export interface UseStageDirectiveState {
  running: boolean;
  progress: StageProgressFrame | null;
  result: Record<string, unknown> | null;
  error: string | null;
}

export interface UseStageAction extends UseStageDirectiveState {
  start: () => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

export function useStageAction(
  processedDocumentId: string | null,
  stage: StageName,
  opts: { onComplete?: () => void } = {},
): UseStageAction {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<StageProgressFrame | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onCompleteRef = useRef<typeof opts.onComplete>(opts.onComplete);
  onCompleteRef.current = opts.onComplete;

  const reset = useCallback(() => {
    setProgress(null);
    setResult(null);
    setError(null);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const start = useCallback(async () => {
    if (!processedDocumentId || running) return;
    reset();
    setRunning(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      for await (const ev of runStageStream(processedDocumentId, stage, {
        signal: ctrl.signal,
      })) {
        if (ctrl.signal.aborted) break;
        switch (ev.event) {
          case "stage.progress": {
            setProgress({
              stage: ev.data.stage,
              phase: ev.data.phase,
              message: ev.data.message,
              current: ev.data.current,
              total: ev.data.total,
              extra: ev.data.extra,
              lastUpdate: Date.now(),
            });
            break;
          }
          case "stage.result": {
            setResult(ev.data as Record<string, unknown>);
            break;
          }
          case "stage.error": {
            setError(ev.data.message ?? "Stage failed");
            break;
          }
          case "stage.end": {
            // Server signals completion. Loop will drain, then exit.
            break;
          }
        }
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
      onCompleteRef.current?.();
    }
  }, [processedDocumentId, stage, running, reset]);

  return { running, progress, result, error, start, cancel, reset };
}
