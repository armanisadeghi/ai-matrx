"use client";

// features/masterwork/components/RunStages.tsx
//
// THE SERVER'S OWN ACCOUNT OF A RUN REACHES THE SCREEN — IN EVERY LANE.
//
// ## The class this closes (cold walk 8, 2026-09-17)
//
// The Meeting Scavenger completed a run that added nothing, and said so with a
// box styled `border-primary/40 bg-primary/5` — the success box — carrying one
// summary line. The Expert read a green tick over an empty Rulebook.
//
// The server was not silent. `meeting_ingest.py` emits a `nothing_found` step
// ("We read N moment(s) of yours from these meetings and none of them was a
// judgment call…"), a filter census naming what was skipped and why, and an
// already-distilled note. All three ride `MasterworkIngestProgressData` into
// `run.stages` — and `MeetingScavengerDialog.tsx` never referenced `run.stages`
// at all. The one sentence explaining what was found and why nothing qualified
// was emitted, streamed, received, and dropped on the floor.
//
// The census behind this file: SEVEN dialogs rendered no stages at all
// (Meeting Scavenger, Daily Drip, Bad-Example Probe, Teach-Back, Compare Two,
// Unfolding Audition, Run the Bench) while NINE rendered them by hand-rolling
// the same twelve lines of JSX. So the shape is lifted here once, the seven
// adopt it, and a new lane inherits it instead of re-deciding it.
//
// Guards: `features/masterwork/__tests__/a-run-that-found-nothing-never-reads-
// as-success.test.tsx` (this component's two directions) and
// `zero-is-never-a-clean-success.test.ts` (the sentence itself).

import * as React from "react";

import LoadingSpinner from "@/components/ui/loading-spinner";
import { cn } from "@/lib/utils";

/**
 * Everything a lane needs off its durable run to account for itself. Declared
 * structurally rather than imported so this component stays usable by every
 * lane's differently-typed `useMasterworkRun<T>`.
 */
export interface RunAccount {
  /**
   * Optional on purpose. A lane may hand this component a run that has not
   * reported any step yet, and a shared component that throws on a missing
   * array takes the whole screen down with it — the opposite of the law it
   * exists to serve. Absent and empty mean the same thing here: nothing to
   * account for yet.
   */
  stages?: string[] | null;
  running: boolean;
  waitMessage?: string | null;
}

/**
 * The steps the server reported, as they arrive.
 *
 * Renders nothing when there is nothing to report and nothing is running —
 * an empty bordered box is chrome pretending to be information.
 */
export function RunStages({
  run,
  waitingMessage,
  className,
}: {
  run: RunAccount;
  /** Shown beside the spinner when the run has not named its own wait. */
  waitingMessage?: string;
  className?: string;
}) {
  const stages = run.stages ?? [];
  if (!run.running && stages.length === 0) return null;
  return (
    <div className={cn("space-y-2", className)}>
      {stages.length > 0 ? (
        <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/40 p-3">
          {stages.map((line, index) => (
            <p key={index} className="text-xs text-muted-foreground">
              {line}
            </p>
          ))}
        </div>
      ) : null}
      {run.running ? (
        <div className="flex items-start gap-2">
          <LoadingSpinner size="sm" />
          <p className="text-xs text-muted-foreground">
            {run.waitMessage ?? waitingMessage ?? "Working…"}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A finished run's outcome, in the tone the outcome actually earned.
 *
 * 🚨 A SUCCESS THAT ADDED NOTHING MUST NEVER READ AS SUCCESS. When `added` is
 * zero this is NOT the primary-tinted success box: it is a notice, headed with
 * what did not happen, carrying the summary sentence — which `describeIngest`
 * already writes honestly, including what was found and what to try instead —
 * and the stage lines that say what the server actually saw.
 *
 * The sentence is NOT written here. `describeIngest` is the one summary every
 * lane prints and it already answers the zero case; a second explanation path
 * would be a second thing to keep true.
 */
export function IngestOutcome({
  summary,
  added,
  run,
  children,
}: {
  /** The sentence from `describeIngest` — never composed in this file. */
  summary: string;
  /** How many rules the run actually added. Zero changes the whole tone. */
  added: number;
  run: RunAccount;
  /** The lane's own next-step controls. */
  children?: React.ReactNode;
}) {
  const nothingAdded = added === 0;
  return (
    <div className="space-y-3">
      <div
        className={cn(
          "rounded-md border p-3 text-sm",
          nothingAdded
            ? "border-amber-500/40 bg-amber-500/5"
            : "border-primary/40 bg-primary/5",
        )}
      >
        {nothingAdded ? (
          <p className="mb-1 font-medium text-foreground">
            Nothing was added to your Rulebook
          </p>
        ) : null}
        <p className="text-foreground">{summary}</p>
      </div>
      {/* What the server actually saw, kept on screen after the run ends —
          this is where `nothing_found`, the filter census and the
          already-distilled note live, and they are the only account of WHY
          the number above is what it is. */}
      <RunStages run={{ ...run, running: false }} />
      {children}
    </div>
  );
}
