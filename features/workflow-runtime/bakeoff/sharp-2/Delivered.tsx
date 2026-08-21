"use client";

/**
 * The promise thread — from "you will get X" to "here is X".
 *
 * `PromiseStrip` names every deliverable from frame zero (chips derived from
 * the DEFINITION's output_kind declarations); each chip is a door to its card
 * in `Delivered`, where the same promise starts as a ghost placeholder and
 * becomes the real artifact, rendered by its canonical kind component
 * (`InvocationBody` prefer="persisted"). Mid-run "Show on Screen" emissions
 * render below through the canonical `DbEmitRenderer`. Placeholders exist
 * from the first frame, so nothing on this page ever shifts — it only fills.
 */

import { Gift, Hourglass, MonitorUp, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import DbEmitRenderer from "@/features/workflow-emit/DbEmitRenderer";
import type { EmitMode } from "@/features/workflow-emit/types";
import {
  selectNodeAggregate,
  selectRunEmissions,
  type NodeAggregatePhase,
} from "../../redux/workflow-runs.selectors";
import { InvocationBody, PhaseIcon } from "../../components/readout-parts";
import {
  humanizeKind,
  type RunStepPresentation,
} from "../../components/run/node-presentation";

const EMIT_MODES: ReadonlySet<string> = new Set([
  "confirmation",
  "summary",
  "full",
  "restructured",
]);

export function promiseAnchor(nodeId: string): string {
  return `sharp2-promise-${nodeId}`;
}

export function PromiseStrip({
  deliverables,
  phases,
  runOver,
}: {
  deliverables: RunStepPresentation[];
  phases: Record<string, NodeAggregatePhase>;
  runOver: boolean;
}) {
  if (deliverables.length === 0) return null;
  return (
    <div className="flex min-w-0 items-center gap-2 overflow-x-auto scrollbar-hide">
      <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        You&apos;ll get
      </span>
      {deliverables.map((step) => {
        const phase = phases[step.nodeId] ?? "idle";
        const done = phase === "settled";
        const failed = phase === "failed" || (runOver && !done);
        return (
          <a
            key={step.nodeId}
            href={`#${promiseAnchor(step.nodeId)}`}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              done
                ? "border-primary/40 bg-primary/10 text-primary"
                : failed
                  ? "border-destructive/40 bg-destructive/5 text-destructive"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <PhaseIcon phase={done ? "settled" : failed ? "failed" : phase} />
            {humanizeKind(step.outputKind ?? step.label)}
          </a>
        );
      })}
    </div>
  );
}

function DeliverableCard({
  runId,
  step,
  runOver,
}: {
  runId: string;
  step: RunStepPresentation;
  runOver: boolean;
}) {
  const aggregate = useAppSelector(selectNodeAggregate(runId, step.nodeId));
  const settled = aggregate.invocations.filter(
    (invocation) => invocation.phase === "settled",
  );
  const missed = runOver && settled.length === 0;
  const title = humanizeKind(step.outputKind ?? step.label);

  return (
    <section
      id={promiseAnchor(step.nodeId)}
      aria-label={title}
      className="scroll-mt-16 rounded-xl border border-border bg-card"
    >
      <header className="flex h-9 items-center gap-2 border-b border-border px-3">
        <Gift className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">{title}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          from “{step.label}”
        </span>
      </header>
      <div className="p-3">
        {settled.length > 0 ? (
          <div className="space-y-3">
            {settled.map((invocation) => (
              <InvocationBody
                key={invocation.invocationKey}
                runId={runId}
                invocation={invocation}
                prefer="persisted"
              />
            ))}
          </div>
        ) : missed ? (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <XCircle className="h-3.5 w-3.5 shrink-0" />
            This wasn&apos;t delivered — the run ended before “{step.label}”
            could finish.
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Hourglass className="h-3.5 w-3.5 shrink-0" />
            Coming up — this fills in the moment “{step.label}” finishes.
          </p>
        )}
      </div>
    </section>
  );
}

export function Delivered({
  runId,
  deliverables,
  runOver,
}: {
  runId: string;
  deliverables: RunStepPresentation[];
  runOver: boolean;
}) {
  const emissions = useAppSelector(selectRunEmissions(runId));
  if (deliverables.length === 0 && emissions.length === 0) return null;
  return (
    <div className="space-y-3">
      {deliverables.length > 0 ? (
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          What you get
        </h2>
      ) : null}
      {deliverables.map((step) => (
        <DeliverableCard
          key={step.nodeId}
          runId={runId}
          step={step}
          runOver={runOver}
        />
      ))}
      {emissions.length > 0 ? (
        <>
          <h2 className="flex items-center gap-1.5 pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <MonitorUp className="h-3.5 w-3.5" />
            Shown along the way
          </h2>
          {emissions.map((emission) => (
            <div
              key={emission.seq ?? `${emission.nodeId}:${emission.ts}`}
              className="rounded-xl border border-border bg-card p-3"
            >
              <DbEmitRenderer
                mode={
                  EMIT_MODES.has(emission.mode)
                    ? (emission.mode as EmitMode)
                    : "full"
                }
                payload={emission.payload}
                title={emission.title}
                nodeId={emission.nodeId}
                runId={runId}
                seq={emission.seq ?? 0}
                isPersisted={emission.persisted}
                componentRef={emission.componentRef}
              />
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}
