"use client";

// features/masterwork/components/RunStages.tsx
//
// THE ONE PROGRESS SURFACE FOR EVERY MASTERWORK LANE THAT RUNS A LONG JOB.
//
// ## Round one (cold walk 8, 2026-09-17) — the server's account reaches the screen
//
// The Meeting Scavenger completed a run that added nothing, and said so with a
// box styled `border-primary/40 bg-primary/5` — the success box — carrying one
// summary line. The Expert read a green tick over an empty Rulebook. The server
// was not silent: `meeting_ingest.py` emits a `nothing_found` step, a filter
// census and an already-distilled note, all three riding into `run.stages`, and
// the dialog never referenced `run.stages` at all. SEVEN dialogs rendered no
// stages; NINE hand-rolled the same twelve lines of JSX. So the shape was
// lifted here once.
//
// ## Round two (acquisition-frontier §7.3, 2026-09-17) — and it has to MOVE
//
// A paid, correct, 8-minute ingest still looked frozen, and an independent
// verifier concluded the platform was broken. Two things were wrong and both
// were in this shape:
//
//   1. The wait line was `run.waitMessage` beside a `LoadingSpinner` — one
//      sentence, no clock. At second 1 and at second 160 the screen said the
//      same words. The estimate inside that sentence came from a per-LANE
//      constant, so one 558 KB EPUB and a pile of nineteen files were both
//      promised "about 2 minutes" for runs that took 8m11s.
//   2. `run.stages` is a flat list of strings. 7,412 of a 151s run's 7,414
//      stream events were raw model tokens; the typed per-resource events that
//      DO arrive (`resource_started`/`resource_done`, rule totals, chunk
//      counts) were flattened into that list and could not be rendered as
//      states, so nothing between the first and last line ever changed.
//
// So this component now shows, for every lane at once:
//
//   * `WorkingNotice` — the server's own current sentence, a clock that moves
//     every second, and a promise that stops promising once it is overtaken
//     (`lib/progress/elapsed.ts`). Never a bare spinner.
//   * the per-resource list with real states, off `run.progress`
//     (`features/masterwork/durable-run/ingestProgress.ts`).
//   * the counts the server sent — sources read, parts distilled, rules so far.
//   * the server's own LABOURING sentence when its heartbeat cannot land
//     (`masterwork_run_labouring`, aidream 513ad71c3d), in place of the stage
//     line — because "the server is busy and cannot check in" is a fact, and a
//     spinner over it is not.
//
// It writes no sentence of its own about the work and invents no percentage:
// nothing on this path knows a fraction, and a fabricated bar is a lie told
// slowly.
//
// Guards: `features/masterwork/__tests__/a-run-that-found-nothing-never-reads-
// as-success.test.tsx`, `zero-is-never-a-clean-success.test.ts`, and
// `features/masterwork/__tests__/a-working-run-never-looks-frozen.test.tsx`.

import * as React from "react";
import { AlertTriangle, Check, Circle, Loader2 } from "lucide-react";

import { DEFAULT_EXPECTED_MS } from "@/lib/durable-run/useDurableRun";
import { WorkingNotice } from "@/lib/progress/WorkingNotice";
import { honestProgressSummary } from "@/lib/progress/honestSummary";
import { cn } from "@/lib/utils";

import type { IngestProgress } from "../durable-run/ingestProgress";
import {
  EMPTY_INGEST_PROGRESS,
  progressHeadline,
} from "../durable-run/ingestProgress";

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
  /** The latest server stage line, rendered verbatim as the wait's headline. */
  stage?: string | null;
  /** When this run began, epoch ms — the clock's origin. */
  startedAt?: number | null;
  /** The promise this run is allowed to make, measured from its real size. */
  expectedMs?: number | null;
  /** The typed per-resource progress. Absent for a lane with no run yet. */
  progress?: IngestProgress | null;
}

/** A resource row's state, as an icon that is legible without its label. */
function StateIcon({ status }: { status: string }) {
  if (status === "completed") {
    return <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />;
  }
  if (status === "failed") {
    return <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />;
  }
  if (status === "running") {
    return <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary" />;
  }
  return <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/40" />;
}

/**
 * The per-resource list. One row per thing the person handed over, present
 * from the first event so the size of what is still to come is visible rather
 * than implied.
 */
function ResourceList({ progress }: { progress: IngestProgress }) {
  if (progress.resources.length === 0) return null;
  return (
    <ul className="space-y-1 rounded-md border border-border bg-card p-2">
      {progress.resources.map((row) => (
        <li key={row.id} className="flex items-start gap-2 text-xs">
          <StateIcon status={row.status} />
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "truncate",
                row.status === "waiting"
                  ? "text-muted-foreground/70"
                  : "text-foreground",
              )}
              title={row.label}
            >
              {row.label}
            </p>
            {/* 🚨 THE SERVER'S OWN SENTENCE, WHOLE.
                This line was `truncate`, so the copy-protection refusal —
                which names the scheme AND the four lawful ways in (a DRM-free
                copy, photos of the pages, a highlights export, the audiobook)
                — reached the person as its first six words and an ellipsis.
                A refusal that hides its remedy is a dead end wearing a
                sentence (VERIFICATION.md §9.6, 2026-09-18). The label above
                still truncates; the account of what happened never does. */}
            {row.detail ? (
              <p className="whitespace-pre-line break-words text-muted-foreground">
                {row.detail}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * The steps the server reported, as they arrive — and, while it is running, a
 * wait that moves.
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
  /** Shown as the wait's headline when the run has not named its own step. */
  waitingMessage?: string;
  className?: string;
}) {
  const stages = run.stages ?? [];
  const progress = run.progress ?? EMPTY_INGEST_PROGRESS;

  // 🚨 THE CLOCK NEEDS AN ORIGIN, AND THIS COMPONENT REFUSES TO INVENT ONE.
  //
  // `useDurableRun` supplies `startedAt` for every moment its run is in
  // flight. The one window it cannot cover is the upload that happens BEFORE
  // the run exists — nothing is paid for yet and there is no row. A lane with
  // such a window hands over its own `startedAt` (see `IngestSourceDialog` and
  // `BodyOfWorkDialog`), because only the lane knows when its upload began.
  // Manufacturing one here from the first render would restart the clock on
  // every remount and quietly under-report a long wait.
  const startedAt = run.startedAt ?? null;

  if (!run.running && stages.length === 0 && progress.resources.length === 0) {
    return null;
  }

  const headline = progressHeadline(progress);

  // What the wait line SAYS. Order matters and it is not cosmetic:
  //   1. a failed resource outranks everything — `honestProgressSummary` is
  //      the platform rule that a reassurance may never contradict a red row.
  //      It is told `fan_out`, because that is what this list IS: every
  //      resource in a dump is launched beside its neighbours, so one refused
  //      book costs one row. Under the old default this printed "Stopped —
  //      nothing after it will run" over a seventeen-source run that ran all
  //      seventeen and completed (VERIFICATION.md §9.1/§9.6, 2026-09-18);
  //   2. the server's labouring sentence outranks its stage line, because the
  //      stage line is now stale by definition — the server is telling us it
  //      cannot check in;
  //   3. otherwise the server's own latest step, verbatim.
  const doing =
    honestProgressSummary({
      steps: progress.resources,
      shape: "fan_out",
      description:
        progress.labouring ??
        run.stage ??
        run.waitMessage ??
        waitingMessage ??
        "Working…",
    }) ?? "Working…";

  return (
    <div className={cn("space-y-2", className)}>
      {run.running ? (
        startedAt !== null ? (
          <WorkingNotice
            doing={doing}
            startedAt={startedAt}
            usualMs={run.expectedMs ?? DEFAULT_EXPECTED_MS}
            keepsGoingWithoutYou
          />
        ) : (
          // No origin for a clock, so no clock — and the sentence still says
          // what is happening rather than sitting under a bare spinner.
          <div
            role="status"
            aria-live="polite"
            className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground"
          >
            <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
            <p className="min-w-0 flex-1 text-foreground">{doing}</p>
          </div>
        )
      ) : null}
      {headline ? (
        <p className="px-1 text-xs tabular-nums text-muted-foreground">
          {headline}
        </p>
      ) : null}
      <ResourceList progress={progress} />
      {stages.length > 0 ? (
        <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/40 p-3">
          {stages.map((line, index) => (
            <p key={index} className="text-xs text-muted-foreground">
              {line}
            </p>
          ))}
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
