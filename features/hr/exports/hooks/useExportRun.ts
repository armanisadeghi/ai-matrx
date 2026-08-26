"use client";

/**
 * useExportRun — follow one async export run (E-20 generate, E-21 timesheet, E-26 supersede).
 *
 * All three answer `202` with the §1.5 runtime reference rather than with the export, so the
 * surface follows the RUNTIME SPINE, not a second HR-specific status endpoint:
 * `GET /runtime/operations/{request_id}` — which is a LIVE path in
 * `types/python-generated/api-types.ts`, so it is reached through `apiGet`/`buildPath` from the
 * generic typed client, never through the HR stub client.
 *
 * 🚨 WHAT THE POLL DOES *NOT* CARRY, AND WHAT THAT MEANS FOR THE SURFACE.
 * `OperationView` reports status, terminality, cost, meters and error — it carries **no `result`
 * member**. So the export's own payload (`export_id`, `export_version`, `artifact_file_id`, …)
 * is not reachable from this poll. That is fine and it is deliberate: the durable record is the
 * `hr.payroll_export` row, so when a run reaches a terminal state the surface REFRESHES THE
 * HISTORY and reads the truth from the reader. That is also the recovery path for a browser
 * refresh mid-run — the run is a server row, not a browser session, and closing the tab loses
 * nothing.
 *
 * MOCK MODE IS HONEST ABOUT ITS LIMIT. `NEXT_PUBLIC_HR_MOCK=1` swaps the HR transport only; the
 * runtime spine is a live path with no fixtures. Rather than poll a server that is not there —
 * or spin forever, which is the same failure wearing a nicer hat — the hook reports
 * `not_observable` and the surface says so in words.
 */

import { useEffect, useState } from "react";
import { apiGet, buildPath } from "@/lib/api/typed-client";
import { HR_MOCK_ENABLED } from "@/features/hr/mock/transport";
import { toExportFailure, type ExportFailure } from "../errors";
import type { AsyncAccepted } from "../types";

/** How often the spine is asked. The runs this follows are seconds-to-minutes, not hours. */
const POLL_INTERVAL_MS = 2000;
/** A run that has not settled by here has stopped being a spinner and become a question. */
const POLL_CEILING_MS = 5 * 60 * 1000;

export type ExportRunPhase =
  | "idle"
  | "running"
  | "succeeded"
  | "failed"
  /** Accepted by the server, but this environment cannot observe the run (mock mode). */
  | "not_observable"
  /** Still running past the ceiling — the surface offers a manual refresh, never a forever spinner. */
  | "timed_out";

export interface UseExportRunResult {
  phase: ExportRunPhase;
  /** The reference the 202 carried, or null when nothing is in flight. */
  accepted: AsyncAccepted | null;
  /** The runtime's own status string while running/settled. */
  status: string | null;
  failure: ExportFailure | null;
  /** Begin following a run. Replaces whatever was being followed. */
  follow: (accepted: AsyncAccepted) => void;
  /** Drop the current run from the surface (does not cancel it server-side). */
  clear: () => void;
}

export function useExportRun(options?: {
  /** Called once when a run reaches a terminal state — refresh the history here. */
  onSettled?: (phase: "succeeded" | "failed") => void;
}): UseExportRunResult {
  const onSettled = options?.onSettled;
  const [accepted, setAccepted] = useState<AsyncAccepted | null>(null);
  const [phase, setPhase] = useState<ExportRunPhase>("idle");
  const [status, setStatus] = useState<string | null>(null);
  const [failure, setFailure] = useState<ExportFailure | null>(null);

  useEffect(() => {
    if (!accepted || HR_MOCK_ENABLED) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();
    const settle = (next: "succeeded" | "failed") => {
      setPhase(next);
      onSettled?.(next);
    };

    const poll = async () => {
      try {
        const { data } = await apiGet(
          buildPath("/runtime/operations/{request_id}", {
            request_id: accepted.request_id,
          }),
        );
        if (cancelled) return;
        const view = data.operations[0];
        if (!view) {
          // The spine has not registered the operation yet — keep waiting, do not declare failure.
          setStatus("queued");
        } else {
          setStatus(view.status);
          if (view.is_terminal) {
            if (view.status === "completed") {
              settle("succeeded");
            } else {
              setFailure(
                toExportFailure(
                  new Error(
                    typeof view.error?.message === "string"
                      ? view.error.message
                      : `The export run ended as "${view.status}".`,
                  ),
                ),
              );
              settle("failed");
            }
            return;
          }
        }
        if (Date.now() - startedAt > POLL_CEILING_MS) {
          setPhase("timed_out");
          return;
        }
        timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
      } catch (err: unknown) {
        if (cancelled) return;
        setFailure(toExportFailure(err));
        settle("failed");
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [accepted, onSettled]);

  return {
    phase,
    accepted,
    status,
    failure,
    follow: (next: AsyncAccepted) => {
      setPhase(HR_MOCK_ENABLED ? "not_observable" : "running");
      setStatus(HR_MOCK_ENABLED ? next.status : null);
      setFailure(null);
      setAccepted(next);
    },
    clear: () => {
      setAccepted(null);
      setPhase("idle");
      setStatus(null);
      setFailure(null);
    },
  };
}
