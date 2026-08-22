"use client";

/**
 * RunFailureCard — failure as a first-class state, in the reader's language.
 *
 * A run that stops is not an error string. It is: what was being made, WHICH
 * step stopped (by its author's name, never a graph id), what went wrong in
 * plain words, and the ONE thing to do next — with the door attached when the
 * cause has one (a product gate like the COPPA age check routes straight to
 * the page that clears it). The technical cause is never the headline and
 * never hidden — it rides along, one tap away, so it can be handed to us
 * verbatim.
 *
 * The explanation itself comes from `explainRunFailure` (the shared no-bare-
 * error primitive) — this component adds no bespoke copy of its own, so a
 * pattern added there improves every surface at once.
 */

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  RotateCcw,
} from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";

import {
  selectNodeAggregatePhases,
  selectRunCostTotal,
  selectRunError,
  selectRunStatus,
  selectRunStickyFacts,
} from "../../redux/workflow-runs.selectors";
import { explainRunFailure } from "../../run-failure-explanation";
import {
  workflowFailureAgentInput,
  workflowFailureHuman,
  workflowFailureInvestigationPrompt,
} from "./run-copy";

const STOPPED_STATUSES = new Set(["failed", "errored", "cancelled"]);

/**
 * A cancelled run has no recorded error, so there is nothing for the shared
 * primitive to read. Hand it the one fact we do have.
 *
 * Everything else passes the WHOLE `workflow.run.error` record through — the
 * server writes the structured failure there (cause/step_label/field/expected/
 * technical), and reducing it to one string is the exact information loss this
 * card used to paper over.
 */
const CANCELLED_FAILURE = { cause: "cancelled" } as const;

export function RunFailureCard({
  runId,
  /** nodeId → the author's human step name. */
  stepLabels,
  /** What the reader thinks they pressed Run on, sentence-initial. */
  whatItRan = "This run",
  /** Wired to the same Run verb the surface already owns, when there is one. */
  onRetry,
}: {
  runId: string;
  stepLabels: Record<string, string>;
  whatItRan?: string;
  onRetry?: () => void;
}) {
  const status = useAppSelector(selectRunStatus(runId));
  const error = useAppSelector(selectRunError(runId));
  const sticky = useAppSelector(selectRunStickyFacts(runId));
  const phases = useAppSelector(selectNodeAggregatePhases(runId));
  const costUsd = useAppSelector(selectRunCostTotal(runId));
  const [showTechnical, setShowTechnical] = useState(false);

  if (status === null || !STOPPED_STATUSES.has(status)) return null;

  const cancelled = status === "cancelled";
  // Status is authoritative over anything the row recorded: a run cancelled
  // after a step had already errored must still read as cancelled. The
  // recorded technical line is kept either way — never dropped.
  const explanation = explainRunFailure(
    cancelled ? { ...(error ?? {}), ...CANCELLED_FAILURE } : error,
    whatItRan,
  );

  // The sticky facts are the live-stream record of which nodes failed. On a
  // COLD load (open a failed run from the runs list, never having watched it)
  // there are none — and the contract says a failure must always name what was
  // being run. The engine now records the author's name for the failing step on
  // the row itself, so fall back to that rather than to nothing.
  const failedSteps = Object.keys(sticky.failedNodes).map(
    (nodeId) => stepLabels[nodeId] ?? nodeId,
  );
  const recordedStep =
    typeof error?.step_label === "string" && error.step_label.trim()
      ? error.step_label
      : null;
  const namedSteps = failedSteps.length > 0 ? failedSteps : recordedStep ? [recordedStep] : [];
  const totalSteps = Object.keys(stepLabels).length;
  const completedSteps = Object.values(phases).filter(
    (phase) => phase === "settled" || phase === "skipped",
  ).length;
  const failureView = () => ({
    kind: "run" as const,
    headline: explanation.headline,
    technical: explanation.technical,
    nextStep: explanation.nextStep,
    runId,
    workflowName: whatItRan,
    status,
    stepLabel: recordedStep,
    failedSteps: namedSteps,
    completedSteps,
    totalSteps,
    costUsd,
  });

  return (
    <section
      className={cn(
        "rounded-2xl border p-4",
        cancelled
          ? "border-border bg-muted/40"
          : "border-destructive/40 bg-destructive/5",
      )}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle
          className={cn(
            "mt-0.5 h-4.5 w-4.5 shrink-0",
            cancelled ? "text-muted-foreground" : "text-destructive",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h2 className="min-w-0 flex-1 text-sm font-semibold text-foreground">
              {explanation.headline}
            </h2>
            <CopyButtons
              size="icon"
              label="Workflow run failure"
              human={() => workflowFailureHuman(failureView())}
              agent={() => workflowFailureAgentInput(failureView())}
              json={() => error}
              agentVariant={{
                id: "error",
                label: "Error",
                hint: "The failure exactly as rendered, with run context",
                position: "first",
              }}
              aiVariants={[
                {
                  id: "error-with-prompt",
                  label: "Error with prompt",
                  hint: "Add a root-cause investigation brief",
                  build: () =>
                    workflowFailureInvestigationPrompt(failureView()),
                },
              ]}
            />
          </div>
          {namedSteps.length > 0 ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              It stopped at{" "}
              <span className="font-medium text-foreground">
                {namedSteps.join(", ")}
              </span>
              .
            </p>
          ) : null}
          <p className="mt-2 text-sm leading-relaxed text-foreground/90">
            {explanation.nextStep}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {explanation.action ? (
              <Link
                href={explanation.action.href}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                {explanation.action.label}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors",
                  explanation.action
                    ? "border border-border text-foreground hover:bg-accent"
                    : "bg-primary text-primary-foreground hover:opacity-90",
                )}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Run it again
              </button>
            ) : null}
            {explanation.technical ? (
              <button
                type="button"
                onClick={() => setShowTechnical((value) => !value)}
                aria-expanded={showTechnical}
                className="inline-flex min-h-9 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Technical detail
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    showTechnical && "rotate-180",
                  )}
                />
              </button>
            ) : null}
          </div>

          {showTechnical && explanation.technical ? (
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/70 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
              {explanation.technical}
            </pre>
          ) : null}
        </div>
      </div>
    </section>
  );
}
