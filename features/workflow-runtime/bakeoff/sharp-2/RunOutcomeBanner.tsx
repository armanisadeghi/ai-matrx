"use client";

/**
 * RunOutcomeBanner — the honest edge for a terminal run, in the reader's words.
 *
 * The canonical `RunErrorCard` prints the engine's raw `error.message`, which
 * for a real failed run is a pydantic ValidationError with a stack-trace URL
 * (measured on run 85fb1d51 — a non-technical reader was shown
 * "unregistered source_feature 'hopkins_copy_desk_v1'"). This banner is the
 * same facts through the SHARED explanation primitive (`explainRunFailure` —
 * copy lives there, never here), plus the thing a person actually needs after
 * a failure: what WAS delivered and what wasn't. Technical detail stays one
 * tap away for us.
 */

import { useState } from "react";
import { AlertTriangle, CheckCircle2, PartyPopper } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectRunError,
  selectRunStatus,
  selectRunStickyFacts,
  type NodeAggregatePhase,
} from "../../redux/workflow-runs.selectors";
import { explainRunFailure } from "../../run-failure-explanation";
import { humanizeKind, type RunStepPresentation } from "../../components/run/node-presentation";

export function RunOutcomeBanner({
  runId,
  stepLabels,
  deliverables,
  phases,
  focusNodeId,
}: {
  runId: string;
  stepLabels: Record<string, string>;
  deliverables: RunStepPresentation[];
  phases: Record<string, NodeAggregatePhase>;
  /** The step the focus window is showing — it carries its own explanation. */
  focusNodeId: string | null;
}) {
  const status = useAppSelector(selectRunStatus(runId));
  const error = useAppSelector(selectRunError(runId));
  const sticky = useAppSelector(selectRunStickyFacts(runId));
  const [showTechnical, setShowTechnical] = useState(false);

  const failed =
    status === "failed" || status === "errored" || status === "cancelled";
  const completed = status === "completed";
  if (!failed && !completed) return null;

  const delivered = deliverables.filter(
    (step) => phases[step.nodeId] === "settled",
  );
  const missing = deliverables.filter(
    (step) => phases[step.nodeId] !== "settled",
  );

  if (completed) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
        <PartyPopper className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">
            {delivered.length > 0
              ? "Finished — everything you were promised is ready below."
              : "Finished — the last step's result is above."}
          </p>
          {delivered.length > 0 ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Delivered:{" "}
              {delivered
                .map((step) => humanizeKind(step.outputKind ?? step.label))
                .join(", ")}
              .
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  const rawMessage =
    error && typeof error.message === "string" && error.message
      ? error.message
      : null;
  const failedNames = Object.keys(sticky.failedNodes).map(
    (nodeId) => stepLabels[nodeId] ?? nodeId,
  );
  const at = failedNames.length > 0 ? failedNames.join("”, “") : null;
  const stepExplainsItself =
    focusNodeId !== null && sticky.failedNodes[focusNodeId] === true;
  const explanation = explainRunFailure(
    rawMessage,
    at ? `“${at}”` : "This run",
  );

  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-destructive">
            {status === "cancelled"
              ? "This run was stopped"
              : at
                ? `This run stopped at “${at}”`
                : "This run stopped before it could finish"}
          </p>
          {/* The focused step's own body already carries the explanation and
              its technical detail when the failing step is on screen. Saying
              it twice is clutter, so the banner keeps the run-level verdict,
              the delivery ledger, and the one way forward. */}
          {stepExplainsItself ? null : (
            <p className="mt-0.5 text-xs text-foreground/90">
              {explanation.headline}
            </p>
          )}

          {deliverables.length > 0 ? (
            <div className="mt-2 space-y-0.5">
              {delivered.length > 0 ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                  You still got:{" "}
                  {delivered
                    .map((step) => humanizeKind(step.outputKind ?? step.label))
                    .join(", ")}
                </p>
              ) : null}
              {missing.length > 0 ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                  Not delivered:{" "}
                  {missing
                    .map((step) => humanizeKind(step.outputKind ?? step.label))
                    .join(", ")}
                </p>
              ) : null}
            </div>
          ) : null}

          {explanation.action ? (
            <a
              href={explanation.action.href}
              className="mt-2 inline-block rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              {explanation.action.label}
            </a>
          ) : null}

          {explanation.technical && !stepExplainsItself ? (
            <>
              <button
                type="button"
                onClick={() => setShowTechnical((v) => !v)}
                aria-expanded={showTechnical}
                className="mt-2 block text-[11px] text-muted-foreground underline-offset-2 hover:underline"
              >
                {showTechnical ? "Hide technical detail" : "Technical detail"}
              </button>
              {showTechnical ? (
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/70 p-2 text-[11px] text-muted-foreground">
                  {explanation.technical}
                </pre>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
