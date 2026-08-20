"use client";

/**
 * RunEmissions — what the workflow deliberately PUT ON THE SCREEN mid-run.
 *
 * A `output.to_frontend` step ("Show on Screen") fires a `node_emitted` event
 * while the run keeps going: a confirmation line, a summary, a restructured
 * shape, or the whole payload — optionally bound to a custom, agent-authored
 * component by `component_ref`. The slice has folded those into
 * `run.emissions` since the runtime shipped, and the activity feed has logged
 * a "delivered" line for each one, but the CONTENT had nowhere to land. This
 * is where it lands, through `features/workflow-emit` — the renderer family
 * built for exactly this event and never mounted until now.
 *
 * Three laws it obeys:
 *
 *  - **One renderer, no fork.** Every emission goes through `DbEmitRenderer`,
 *    which resolves the custom component and falls back to the generic body.
 *    Nothing here inspects a payload shape or draws a second viewer.
 *  - **The surface only grows.** Emissions render in arrival order, newest at
 *    the bottom, and a new one never displaces what is already on screen.
 *  - **Emit is never load-bearing.** A missing renderer, a compile failure, or
 *    a thrown component degrades to the generic body (error boundary inside
 *    `DbEmitRenderer`) — it can never take the run surface down.
 *
 * Placement: ABOVE the deliverables. An emission is a mid-run aside; the
 * deliverables are the finished goods, and they stay last.
 *
 * 🚨 NEVER import `emitRendererCache` (or anything else under
 * `features/workflow-emit/` except `DbEmitRenderer` and `types`) FROM HERE.
 * `emitRendererCache` → `compileEmitRenderer` → the agent-apps compiler →
 * a STATIC `@babel/standalone`. `DbEmitRenderer`'s `next/dynamic` boundary is
 * the only thing keeping Babel out of the run-surface bundle, and a static
 * import here walks straight around it. That is the D115 shape — the import
 * edge that cost +14 GB peak build RSS and OOM'd 12 straight builds. Warming
 * the cache from the definition (`prefetchEmitRenderer`) is not worth that
 * trade: the generic body paints immediately and the custom component upgrades
 * it in place, so there is no flash to fix.
 */

import { MonitorUp } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import { DbEmitRenderer } from "@/features/workflow-emit/DbEmitRenderer";
import type { EmitMode } from "@/features/workflow-emit/types";

import { selectRunEmissions } from "../../redux/workflow-runs.selectors";
import type { WorkflowRunEmission } from "../../redux/workflow-runs.slice";

/** The four modes the backend can send; anything else renders as "full". */
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

/**
 * A stable React key. The durable `seq` is THE identity (it survives refolds
 * and refreshes); the ring index is not, because the `EMISSIONS_MAX` cap drops
 * from the head and would shift every key below it.
 */
function emissionKey(emission: WorkflowRunEmission, index: number): string {
  return emission.seq !== null
    ? `seq:${emission.seq}`
    : `${emission.nodeId}:${emission.ts}:${index}`;
}

function EmissionCard({
  runId,
  emission,
  index,
  stepLabel,
}: {
  runId: string;
  emission: WorkflowRunEmission;
  index: number;
  stepLabel: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <MonitorUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate text-[11px] font-medium text-muted-foreground">
          {stepLabel}
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
  );
}

export function RunEmissions({
  runId,
  /** Step id → the author's human name. A missing label falls back to the id. */
  stepLabels,
}: {
  runId: string;
  stepLabels?: Record<string, string>;
}) {
  const emissions = useAppSelector(selectRunEmissions(runId));

  if (emissions.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Shown along the way
      </h2>
      {emissions.map((emission, index) => (
        <EmissionCard
          key={emissionKey(emission, index)}
          runId={runId}
          emission={emission}
          index={index}
          stepLabel={stepLabels?.[emission.nodeId] ?? emission.nodeId}
        />
      ))}
    </section>
  );
}

export default RunEmissions;
