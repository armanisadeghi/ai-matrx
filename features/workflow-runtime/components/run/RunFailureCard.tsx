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

import {
  selectRunError,
  selectRunStatus,
  selectRunStickyFacts,
} from "../../redux/workflow-runs.selectors";
import { explainRunFailure } from "../../run-failure-explanation";

const STOPPED_STATUSES = new Set(["failed", "errored", "cancelled"]);

function errorMessage(error: Record<string, unknown> | null): string | null {
  if (!error) return null;
  for (const key of ["message", "error_message", "detail", "reason", "type"]) {
    const value = error[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

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
  const [showTechnical, setShowTechnical] = useState(false);

  if (status === null || !STOPPED_STATUSES.has(status)) return null;

  const cancelled = status === "cancelled";
  const raw = errorMessage(error);
  const explanation = explainRunFailure(
    cancelled ? (raw ?? "cancelled") : raw,
    whatItRan,
  );

  const failedSteps = Object.keys(sticky.failedNodes).map(
    (nodeId) => stepLabels[nodeId] ?? nodeId,
  );

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
          <h2 className="text-sm font-semibold text-foreground">
            {explanation.headline}
          </h2>
          {failedSteps.length > 0 ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              It stopped at{" "}
              <span className="font-medium text-foreground">
                {failedSteps.join(", ")}
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
