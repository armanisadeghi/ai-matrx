"use client";

/**
 * ONE COMPLETED RUN, ONE CALLBACK — the class fix behind the four ingest
 * dialogs' "tell the page behind me" effect.
 *
 * THE DEFECT (Bugbot, PR #222, 2026-09-12): each dialog fired its `onIngested`
 * from `useEffect(..., [run.result, onIngested])`. Every host passes a NEW
 * inline arrow every render (`onIngested={() => void reloadRulebook()}`), so
 * once a result existed the effect re-fired on every re-render — including the
 * re-render caused by the reload the callback itself had just started. A
 * finished distillation reloaded the Rulebook in a loop for as long as the
 * dialog stayed mounted.
 *
 * So the firing key is the RUN, never the callback: a given (runId, result)
 * pair tells the host exactly once, whatever the host's callback identity does.
 * A genuinely new result — a second run, or a rejoin that settled a different
 * document — is a different pair and fires again.
 */

import { useEffect, useRef } from "react";

interface CompletedRunLike<TResult> {
  result: TResult | null;
  runId: string | null;
}

export function useRunResultOnce<TResult>(
  run: CompletedRunLike<TResult>,
  onComplete: ((result: TResult) => void) | undefined,
): void {
  const firedFor = useRef<{ runId: string | null; result: unknown } | null>(
    null,
  );
  useEffect(() => {
    if (!run.result) return;
    const fired = firedFor.current;
    if (fired && fired.runId === run.runId && fired.result === run.result) {
      return;
    }
    firedFor.current = { runId: run.runId, result: run.result };
    onComplete?.(run.result);
  }, [onComplete, run.result, run.runId]);
}
