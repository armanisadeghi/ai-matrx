"use client";

/**
 * "A BUILD IS RUNNING RIGHT NOW" — said by the SERVER ROW, on mount, in any
 * browser (cold walk 7, finding 1, 2026-09-17).
 *
 * The Build keeps going without the person who started it, and the Build
 * window says so out loud. But every signal that one was in flight lived in
 * the tab that launched it: the durable receipt is a `localStorage` pointer,
 * and the progress is rendered by the window that owns the run. Close the
 * browser and come back — a real close-and-reopen, which is what a person who
 * "keeps working" actually does — and the Rulebook page said "0 Built, 0
 * outputs", identical to a Rulebook where nothing had ever been started, for
 * the whole ~40 seconds the build had left to run.
 *
 * Nothing was lost; the build finished correctly. What was missing was the
 * confidence signal, and a screen that looks like "nothing happened" over work
 * somebody paid for is the defect durability exists to prevent.
 *
 * So this asks `platform.masterwork_run` instead (`./buildInFlight.ts`), which
 * needs no pointer and no prior visit, and renders through the platform's ONE
 * waiting line (`<WorkingNotice>`) so the clock, the usual-length sentence and
 * the "this keeps going without you" promise are the same ones every other
 * lane makes. It never invents progress: a run whose heartbeat has gone quiet
 * is reported as exactly that, with what to do about it.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { WorkingNotice } from "@/lib/progress/WorkingNotice";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

import {
  BUILD_USUAL_MS,
  getBuildInFlight,
  type BuildInFlight,
} from "./buildInFlight";

/**
 * How often to re-ask while one is in flight. The Build's own expectation is
 * about a minute, so this is fast enough that the notice disappears within a
 * few seconds of the build landing, and slow enough to be a rounding error
 * against the run it is watching.
 */
const POLL_MS = 5_000;

export function BuildInFlightNotice({
  rulebookId,
  /** Called when a build this notice was watching is no longer in flight, so
   *  the host can re-read its Masterworks rather than leave a stale count. */
  onSettled,
}: {
  rulebookId: string;
  onSettled?: () => void;
}) {
  const [run, setRun] = useState<BuildInFlight | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let sawOne = false;

    const ask = async (): Promise<void> => {
      try {
        const next = await getBuildInFlight(rulebookId);
        if (cancelled) return;
        if (next) sawOne = true;
        else if (sawOne) {
          sawOne = false;
          onSettled?.();
        }
        setRun(next);
      } catch (error) {
        if (cancelled) return;
        // A failed read is not a reason to claim nothing is running — it is a
        // reason to say nothing and keep asking. It still reaches the Error
        // Inspector rather than being swallowed.
        captureError({
          source: "durable-run",
          relation: "platform.masterwork_run",
          message: error instanceof Error ? error.message : String(error),
          userMessage: "Could not check whether a Build is running.",
          raw: { rulebookId },
        });
      } finally {
        if (!cancelled) timer = setTimeout(() => void ask(), POLL_MS);
      }
    };

    void ask();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [rulebookId, onSettled]);

  if (!run) return null;

  if (run.liveness === "stalled") {
    return (
      <div
        role="status"
        className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm"
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="min-w-0 text-muted-foreground">
          <span className="text-foreground">
            {run.label ? `"${run.label}" ` : "A Build "}
            stopped reporting in.
          </span>{" "}
          It was started here and has gone quiet on the server — nothing you
          approved is affected. Start it again from{" "}
          <Link
            href={`/masterwork/${rulebookId}/masterworks`}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            your Masterworks
          </Link>
          , and if it goes quiet a second time tell us.
        </p>
      </div>
    );
  }

  return (
    <WorkingNotice
      className="mt-3"
      doing={
        run.label
          ? `Building "${run.label}" from your approved rules.`
          : "Building a Masterwork from your approved rules."
      }
      startedAt={run.startedAt}
      usualMs={BUILD_USUAL_MS}
      keepsGoingWithoutYou
    />
  );
}
