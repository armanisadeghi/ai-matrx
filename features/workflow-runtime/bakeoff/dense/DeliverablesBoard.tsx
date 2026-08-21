"use client";

/**
 * DeliverablesBoard — the finished goods, plus everything the workflow
 * deliberately showed along the way.
 *
 * Every step that declares an `output_kind` gets a panel HERE FROM FRAME ZERO
 * — first as a dashed "coming up" ghost, then as its real kind component when
 * it lands (`InvocationBody prefer="persisted"`, the canonical resolution).
 * The panel set is fixed from the definition, so nothing on this board ever
 * moves; panels only fill in. Mid-run emissions append below through the ONE
 * emit renderer (`DbEmitRenderer` — never anything deeper from that feature;
 * its `next/dynamic` boundary keeps Babel out of this bundle).
 */

import { MonitorUp, Package } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import { DbEmitRenderer } from "@/features/workflow-emit/DbEmitRenderer";
import type { EmitMode } from "@/features/workflow-emit/types";
import { cn } from "@/lib/utils";

import {
  selectNodeAggregate,
  selectRunEmissions,
} from "../../redux/workflow-runs.selectors";
import {
  InvocationBody,
  PHASE_LABEL,
  PhaseIcon,
} from "../../components/readout-parts";
import type { WorkflowRunEmission } from "../../redux/workflow-runs.slice";
import {
  humanizeIdentifier,
  humanizeKind,
  type RunStepPresentation,
} from "../../components/run/node-presentation";

const EMIT_MODES: readonly EmitMode[] = [
  "confirmation",
  "summary",
  "full",
  "restructured",
];

function asEmitMode(mode: string): EmitMode {
  return (EMIT_MODES as readonly string[]).includes(mode)
    ? (mode as EmitMode)
    : "full";
}

/** The durable seq is THE stable identity across refolds; the ring index
 * shifts when the cap drops from the head. */
function emissionKey(emission: WorkflowRunEmission, index: number): string {
  return emission.seq !== null
    ? `seq:${emission.seq}`
    : `${emission.nodeId}:${emission.ts}:${index}`;
}

function DeliverablePanel({
  runId,
  step,
}: {
  runId: string;
  step: RunStepPresentation;
}) {
  const aggregate = useAppSelector(selectNodeAggregate(runId, step.nodeId));
  const name = step.outputKind ? humanizeKind(step.outputKind) : step.label;
  const ghost = aggregate.invocations.length === 0;
  const busy =
    aggregate.phase === "running" || aggregate.phase === "retrying";

  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border bg-card",
        ghost ? "border-dashed border-border" : "border-border",
      )}
    >
      <header className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <Package
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            ghost
              ? "text-muted-foreground"
              : "text-emerald-600 dark:text-emerald-400",
          )}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {name}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          from &ldquo;{step.label}&rdquo;
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
          <PhaseIcon phase={aggregate.phase} />
          {PHASE_LABEL[aggregate.phase] ?? aggregate.phase}
        </span>
      </header>
      <div className="p-3">
        {ghost ? (
          <p className="text-xs text-muted-foreground">
            Coming up — it lands here the moment it&apos;s ready.
          </p>
        ) : (
          <div className="space-y-3">
            {aggregate.invocations.map((invocation, index) => (
              <div key={invocation.invocationKey}>
                {aggregate.invocations.length > 1 ? (
                  <div className="mb-1 text-[11px] text-muted-foreground">
                    Part {index + 1} of{" "}
                    {Math.max(
                      aggregate.expectedCount,
                      aggregate.invocations.length,
                    )}
                  </div>
                ) : null}
                <InvocationBody
                  runId={runId}
                  invocation={invocation}
                  prefer="persisted"
                />
              </div>
            ))}
            {busy ? (
              <p className="text-[11px] text-muted-foreground">
                Still being made — it fills in as it goes.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

export function DeliverablesBoard({
  runId,
  deliverables,
  labels,
}: {
  runId: string;
  deliverables: RunStepPresentation[];
  labels: Record<string, string>;
}) {
  const emissions = useAppSelector(selectRunEmissions(runId));

  if (deliverables.length === 0 && emissions.length === 0) return null;

  return (
    <div className="space-y-3">
      {deliverables.length > 0 ? (
        <>
          <h2 className="pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            What you&apos;re getting
          </h2>
          {deliverables.map((step) => (
            <DeliverablePanel key={step.nodeId} runId={runId} step={step} />
          ))}
        </>
      ) : null}

      {emissions.length > 0 ? (
        <>
          <h2 className="pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Shown along the way
          </h2>
          {emissions.map((emission, index) => (
            <section
              key={emissionKey(emission, index)}
              className="overflow-hidden rounded-xl border border-border bg-card"
            >
              <header className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
                <MonitorUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate text-[11px] font-medium text-muted-foreground">
                  {labels[emission.nodeId] ??
                    humanizeIdentifier(emission.nodeId)}
                </span>
              </header>
              <div className="p-3">
                <DbEmitRenderer
                  componentRef={emission.componentRef}
                  mode={asEmitMode(emission.mode)}
                  payload={emission.payload}
                  title={emission.title}
                  nodeId={emission.nodeId}
                  runId={runId}
                  seq={emission.seq ?? index}
                  isPersisted={emission.persisted}
                />
              </div>
            </section>
          ))}
        </>
      ) : null}
    </div>
  );
}
