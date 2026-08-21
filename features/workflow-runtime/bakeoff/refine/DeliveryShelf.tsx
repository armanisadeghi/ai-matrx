"use client";

/**
 * DeliveryShelf — the bottom of the page, the only part that grows.
 *
 * Two sections:
 *  - "Along the way" — what the workflow deliberately put on screen mid-run
 *    (output.to_frontend emissions), rendered through the canonical
 *    DbEmitRenderer in arrival order.
 *  - "What you asked for" — one card per promised deliverable, present as a
 *    named ghost from frame zero and becoming its REAL kind component the
 *    moment its step settles. A workflow that declares no deliverable still
 *    ends with its final steps' results here, named honestly.
 *
 * Everything appends downward; nothing above it ever moves.
 */

import { CircleDashed, Gift, Send } from "lucide-react";

import { cn } from "@/lib/utils";
import IconResolver from "@/components/official/icons/IconResolver";
import { DbEmitRenderer } from "@/features/workflow-emit/DbEmitRenderer";
import type { EmitMode } from "@/features/workflow-emit/types";

import { InvocationBody } from "../../components/readout-parts";
import {
  FAMILY_ICON,
  FAMILY_STYLE,
  humanizeKind,
} from "../../components/run/node-presentation";
import type { WorkflowRunEmission } from "../../redux/workflow-runs.slice";
import type { StepView } from "./plan-view";

const EMIT_MODES: ReadonlySet<string> = new Set([
  "confirmation",
  "summary",
  "full",
  "restructured",
]);

function toEmitMode(mode: string): EmitMode {
  return EMIT_MODES.has(mode) ? (mode as EmitMode) : "full";
}

export function EmissionRoll({
  runId,
  emissions,
  stepLabels,
}: {
  runId: string;
  emissions: WorkflowRunEmission[];
  stepLabels: Record<string, string>;
}) {
  if (emissions.length === 0) return null;
  return (
    <section aria-label="Along the way" className="space-y-2">
      <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Send className="h-3.5 w-3.5" />
        Along the way
      </h2>
      {emissions.map((emission, index) => (
        <article
          key={emission.seq ?? `${emission.nodeId}:${emission.ts}:${index}`}
          className="rounded-xl border border-border bg-card"
        >
          <header className="border-b border-border/60 px-3 py-1.5">
            <span className="text-xs font-medium text-foreground">
              {emission.title ??
                stepLabels[emission.nodeId] ??
                "A note from the run"}
            </span>
          </header>
          <div className="px-3 py-2">
            <DbEmitRenderer
              componentRef={emission.componentRef}
              mode={toEmitMode(emission.mode)}
              payload={emission.payload}
              title={emission.title}
              nodeId={emission.nodeId}
              runId={runId}
              seq={emission.seq ?? 0}
              isPersisted={emission.persisted}
            />
          </div>
        </article>
      ))}
    </section>
  );
}

function DeliverableCard({
  runId,
  view,
  promiseName,
  runOver,
}: {
  runId: string;
  view: StepView;
  promiseName: string;
  runOver: boolean;
}) {
  const { step, phase } = view;
  const style = FAMILY_STYLE[step.family];
  const settledInvocations = view.invocations.filter(
    (inv) => inv.phase === "settled",
  );
  const ready = settledInvocations.length > 0;

  return (
    <article
      className={cn(
        "rounded-xl border bg-card",
        ready ? "border-border" : "border-dashed border-border",
      )}
    >
      <header className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <span
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md",
            style.bg,
          )}
        >
          <IconResolver
            iconName={step.iconName ?? FAMILY_ICON[step.family]}
            className={cn("h-3.5 w-3.5", style.text)}
          />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-foreground">
            {promiseName}
          </h3>
          <p className="truncate text-[11px] text-muted-foreground">
            from “{step.label}”
          </p>
        </div>
        {!ready ? (
          <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />
        ) : null}
      </header>
      <div className="px-3 py-2.5">
        {ready ? (
          <div className="space-y-3">
            {settledInvocations.map((invocation) => (
              <InvocationBody
                key={invocation.invocationKey}
                runId={runId}
                invocation={invocation}
                prefer="persisted"
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {phase === "failed"
              ? "The step making this ran into a problem — see above."
              : phase === "skipped"
                ? "Not needed this time."
                : runOver
                  ? "The run ended before this was made."
                  : "Coming up — it appears here the moment it's ready."}
          </p>
        )}
      </div>
    </article>
  );
}

export function DeliveryShelf({
  runId,
  deliverables,
  fallbackFinals,
  runOver,
}: {
  runId: string;
  /** Steps that declared an output_kind — the promised deliverables. */
  deliverables: StepView[];
  /** Terminal steps used only when NOTHING declares an output_kind. */
  fallbackFinals: StepView[];
  runOver: boolean;
}) {
  const cards =
    deliverables.length > 0
      ? deliverables.map((view) => ({
          view,
          name: humanizeKind(view.step.outputKind ?? view.step.label),
        }))
      : fallbackFinals.map((view) => ({ view, name: view.step.label }));

  if (cards.length === 0) return null;

  return (
    <section aria-label="What you asked for" className="space-y-2">
      <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Gift className="h-3.5 w-3.5" />
        What you asked for
      </h2>
      <div className="space-y-3">
        {cards.map(({ view, name }) => (
          <DeliverableCard
            key={view.step.nodeId}
            runId={runId}
            view={view}
            promiseName={name}
            runOver={runOver}
          />
        ))}
      </div>
    </section>
  );
}
