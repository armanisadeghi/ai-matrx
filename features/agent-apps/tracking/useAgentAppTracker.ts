"use client";

import { useCallback, useRef } from "react";
import { useApiAuth } from "@/hooks/useApiAuth";

/**
 * Non-blocking execution tracker for the agent-app public renderer.
 *
 * Posts to `/api/agent-apps/[id]/track` with `keepalive: true` so the
 * request survives navigation/close. Every send is fire-and-forget — it
 * never throws and never returns a promise, so no callsite can
 * accidentally `await` it and stall the run.
 *
 * Lifecycle:
 *   - `trackVisit()`        — call once on mount
 *   - `startRun(variables)` — call right before `dispatch(launchAgentExecution)`.
 *                             Returns a `RunTracker` whose `complete()` /
 *                             `error()` fire the matching update.
 *
 * If neither `complete()` nor `error()` is called (user aborted, tab
 * closed mid-stream), the run row stays with `success = NULL`. That's
 * the intended in-flight signal — analytics treat it as abandoned.
 */

export interface RunTracker {
  /** Reused as the `task_id` column for the run row. */
  taskId: string;
  /** Mark the run as success; pass an explicit ms duration to override. */
  complete: (executionTimeMs?: number) => void;
  /** Mark the run as failed. */
  error: (info: { errorType?: string; errorMessage?: string }) => void;
}

function makeTaskId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Last-resort fallback for environments without crypto.randomUUID
  // (we don't expect this in modern browsers, but the column is NOT NULL).
  return `${Date.now().toString(16)}-${Math.random().toString(36).slice(2, 14)}`;
}

export function useAgentAppTracker(appId: string) {
  const { fingerprintId } = useApiAuth();
  const fingerprintRef = useRef<string | null>(fingerprintId);
  fingerprintRef.current = fingerprintId;

  const post = useCallback(
    (body: Record<string, unknown>) => {
      try {
        const url = `/api/agent-apps/${appId}/track`;
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (fingerprintRef.current) {
          headers["X-Fingerprint-ID"] = fingerprintRef.current;
        }
        void fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          keepalive: true,
        }).catch(() => undefined);
      } catch {
        // tracking must never throw
      }
    },
    [appId],
  );

  const trackVisit = useCallback(() => {
    post({ event: "visit" });
  }, [post]);

  const startRun = useCallback(
    (variables?: Record<string, unknown>): RunTracker => {
      const taskId = makeTaskId();
      const startedAt =
        typeof performance !== "undefined" ? performance.now() : Date.now();

      post({ event: "run_start", taskId, variables });

      return {
        taskId,
        complete(executionTimeMs) {
          const ms =
            typeof executionTimeMs === "number"
              ? executionTimeMs
              : Math.round(
                  (typeof performance !== "undefined"
                    ? performance.now()
                    : Date.now()) - startedAt,
                );
          post({ event: "run_complete", taskId, executionTimeMs: ms });
        },
        error(info) {
          const ms = Math.round(
            (typeof performance !== "undefined"
              ? performance.now()
              : Date.now()) - startedAt,
          );
          post({
            event: "run_error",
            taskId,
            executionTimeMs: ms,
            errorType: info.errorType ?? "execution_error",
            errorMessage: info.errorMessage ?? "Unknown error",
          });
        },
      };
    },
    [post],
  );

  return { trackVisit, startRun };
}
