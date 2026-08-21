"use client";

/**
 * The Chapters — the delivered work, in the Commission's center column below
 * the focus window. Declared geometry: every deliverable the definition
 * promises gets its chapter card from frame zero ("Coming up: Flashcards"),
 * which becomes the REAL kind component the moment the step settles — the
 * same promise the manifest names, kept in the same place.
 *
 * Mid-run emissions ("Show on Screen" steps) render in arrival order through
 * the canonical `DbEmitRenderer` — never a hand-rolled body.
 */

import { PackageCheck, Sparkle } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { DbEmitRenderer } from "@/features/workflow-emit/DbEmitRenderer";
import type { EmitMode } from "@/features/workflow-emit/types";

import {
  selectNodeAggregate,
  selectRunEmissions,
} from "../../redux/workflow-runs.selectors";
import {
  humanizeKind,
  type RunStepPresentation,
} from "../../components/run/node-presentation";
import { InvocationBody } from "../../components/readout-parts";

/** The slice stores the wire's mode as a string; narrow it honestly. */
function toEmitMode(raw: string): EmitMode {
  return raw === "confirmation" || raw === "summary" || raw === "restructured"
    ? raw
    : "full";
}

function Chapter({
  runId,
  step,
}: {
  runId: string;
  step: RunStepPresentation;
}) {
  const aggregate = useAppSelector(selectNodeAggregate(runId, step.nodeId));
  const name = step.outputKind ? humanizeKind(step.outputKind) : step.label;
  const settled = aggregate.phase === "settled";
  const working =
    aggregate.phase === "running" || aggregate.phase === "retrying";

  return (
    <article
      className={cn(
        "rounded-2xl border p-4",
        settled
          ? "border-emerald-500/30 bg-card shadow-sm"
          : "border-dashed border-border bg-card/60",
      )}
    >
      <header className="mb-2 flex items-center gap-2">
        <PackageCheck
          className={cn(
            "h-4 w-4 shrink-0",
            settled
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-muted-foreground",
          )}
        />
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {name}
        </h3>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {settled ? "Delivered" : working ? "Being made now" : "Coming up"}
        </span>
      </header>
      {settled ? (
        <div className="space-y-3">
          {aggregate.invocations
            .filter((inv) => inv.phase === "settled")
            .map((inv) => (
              <InvocationBody
                key={inv.invocationKey}
                runId={runId}
                invocation={inv}
                prefer="persisted"
              />
            ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {working
            ? `The workflow is making your ${name.toLowerCase()} right now — watch it in the window above.`
            : `Promised by “${step.label}”. It will appear here, in this exact spot.`}
        </p>
      )}
    </article>
  );
}

export function Chapters({
  runId,
  deliverables,
}: {
  runId: string;
  deliverables: RunStepPresentation[];
}) {
  const emissions = useAppSelector(selectRunEmissions(runId));
  if (deliverables.length === 0 && emissions.length === 0) return null;

  return (
    <div className="space-y-3">
      {emissions.length > 0 ? (
        <article className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <header className="mb-2 flex items-center gap-2">
            <Sparkle className="h-4 w-4 shrink-0 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Shown along the way
            </h3>
          </header>
          <div className="space-y-3">
            {emissions.map((emission, index) => (
              <DbEmitRenderer
                key={emission.seq ?? `i${index}`}
                componentRef={emission.componentRef}
                mode={toEmitMode(emission.mode)}
                payload={emission.payload}
                title={emission.title}
                nodeId={emission.nodeId}
                runId={runId}
                seq={emission.seq ?? index}
                isPersisted={emission.persisted}
              />
            ))}
          </div>
        </article>
      ) : null}
      {deliverables.map((step) => (
        <Chapter key={step.nodeId} runId={runId} step={step} />
      ))}
    </div>
  );
}
