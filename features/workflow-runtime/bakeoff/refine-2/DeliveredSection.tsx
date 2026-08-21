"use client";

/**
 * DeliveredSection — the promise kept. Every step that declares an
 * `output_kind` gets a card here from frame zero ("Coming up: …"), which
 * becomes the real delivered artifact — rendered by its canonical kind
 * component via `InvocationBody prefer="persisted"` — the moment the step
 * settles. Mid-run "Show on Screen" emissions render through the canonical
 * `DbEmitRenderer`. Cards only ever fill in; nothing moves.
 */

import { Package, PackageCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import DbEmitRenderer from "@/features/workflow-emit/DbEmitRenderer";
import type { EmitMode } from "@/features/workflow-emit/types";

import {
  humanizeKind,
  type RunStepPresentation,
} from "../../components/run/node-presentation";
import { InvocationBody } from "../../components/readout-parts";
import {
  selectNodeAggregate,
  selectRunEmissions,
} from "../../redux/workflow-runs.selectors";

function DeliverableCard({
  runId,
  step,
}: {
  runId: string;
  step: RunStepPresentation;
}) {
  const aggregate = useAppSelector(selectNodeAggregate(runId, step.nodeId));
  const promise = humanizeKind(step.outputKind ?? "");
  const delivered =
    aggregate.phase === "settled" &&
    aggregate.invocations.some(
      (inv) => inv.output !== null && Object.keys(inv.output).length > 0,
    );

  if (!delivered) {
    return (
      <div className="flex min-h-[5.5rem] items-center gap-3 rounded-xl border border-dashed border-border px-4">
        <Package className="h-5 w-5 shrink-0 text-muted-foreground/70" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{promise}</p>
          <p className="text-xs text-muted-foreground/80">
            {aggregate.phase === "running" || aggregate.phase === "retrying"
              ? `Being made now by “${step.label}”.`
              : aggregate.phase === "failed"
                ? `“${step.label}” ran into a problem — this wasn't delivered.`
                : `Coming up — made by “${step.label}”.`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <header className="flex h-10 items-center gap-2 border-b border-border px-4">
        <PackageCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
        <h3 className="truncate text-sm font-semibold text-foreground">
          {promise}
        </h3>
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
          from “{step.label}”
        </span>
      </header>
      <div className="space-y-4 p-4">
        {aggregate.invocations.map((invocation) => (
          <InvocationBody
            key={invocation.invocationKey}
            runId={runId}
            invocation={invocation}
            prefer="persisted"
          />
        ))}
      </div>
    </div>
  );
}

export function DeliveredSection({
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
    <section aria-label="Deliverables" className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">
        What you&apos;re getting
        <span className={cn("ml-2 text-xs font-normal text-muted-foreground")}>
          {deliverables.length > 0
            ? `${deliverables.length} promised`
            : "shown as the run shares it"}
        </span>
      </h2>
      {emissions.map((emission) => (
        <div
          key={`${emission.nodeId}:${emission.seq ?? emission.ts}`}
          className="rounded-xl border border-border bg-card p-4"
        >
          <DbEmitRenderer
            mode={emission.mode as EmitMode}
            payload={emission.payload}
            title={emission.title}
            nodeId={emission.nodeId}
            runId={runId}
            seq={emission.seq ?? 0}
            isPersisted={emission.persisted || runOver}
            componentRef={emission.componentRef}
          />
        </div>
      ))}
      {deliverables.map((step) => (
        <DeliverableCard key={step.nodeId} runId={runId} step={step} />
      ))}
    </section>
  );
}
