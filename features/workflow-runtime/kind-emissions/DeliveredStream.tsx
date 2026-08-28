"use client";

/**
 * THE DELIVERED STREAM — declared deliverable slots, then the emissions that
 * no slot claimed. One component, because the two halves are one rule.
 *
 * SPEC-workflow-ui-contract §3, the dedupe: "A node that is BOTH an `output.*`
 * deliverable and fires `node_emitted` renders **once** — dedupe key
 * `(node_id, kind)`, the deliverable slot wins, the emission is suppressed
 * rather than duplicated into a second card."
 *
 * Splitting these into two components a caller composes is how the rule gets
 * broken: someone renders the stream without the deliverables (or the other
 * way) and the same payload appears twice, or vanishes. Here the suppression
 * and the settlement are computed from the SAME pair of inputs, in one place,
 * so "renders once" is structural rather than a discipline.
 *
 * ─── Where a slot's content comes from ──────────────────────────────────────
 * Two sources, in this order:
 *   1. THE CLAIMED EMISSION. For an `output.to_frontend` deliverable this is
 *      the only honest content: the node's own settled output is the untouched
 *      PASS-THROUGH payload (the whole incoming dict), not the shaped,
 *      kind-verified thing the author chose to show.
 *   2. The node's settled output + verified kind, for a deliverable that
 *      produces rather than shows.
 * Neither present → the reserved KindSlot silhouette, from first paint.
 */

import React from "react";
import { AlertTriangle } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import { KindSlot, kindSlotPhase } from "@/features/content-ir/react/slot/KindSlot";
import { cn } from "@/lib/utils";

import { selectNodeAggregate } from "../redux/workflow-runs.selectors";
import type { NodeInvocationState } from "../redux/workflow-runs.slice";

import {
  emissionsByDeliverable,
  suppressClaimedEmissions,
} from "./emission-routing";
import { EmissionRender, emissionKey, type RenderableEmission } from "./EmissionRender";
import type { DeclaredDeliverable } from "./result-schema";

/** The latest invocation that actually produced something renderable. */
function settledOutput(
  invocations: readonly NodeInvocationState[],
): NodeInvocationState | null {
  for (let i = invocations.length - 1; i >= 0; i -= 1) {
    const invocation = invocations[i];
    if (
      invocation.phase === "settled" &&
      invocation.output !== null &&
      invocation.outputKind
    ) {
      return invocation;
    }
  }
  return null;
}

export interface DeliveredStreamProps {
  runId: string;
  /** Panel-presentation declared deliverables, from `/result-schema`. */
  declared: readonly DeclaredDeliverable[];
  /** Panel emissions, arrival order (the showcase is already split off). */
  emissions: readonly RenderableEmission[];
  /** Shown when there is genuinely nothing to promise and nothing to show. */
  emptyMessage?: React.ReactNode;
}

export function DeliveredStream({
  runId,
  declared,
  emissions,
  emptyMessage,
}: DeliveredStreamProps) {
  // ONE computation of the dedupe, feeding BOTH halves — the claimed emissions
  // settle their slots and are removed from the stream in the same breath.
  const claimed = emissionsByDeliverable(emissions, declared);
  const unclaimed = suppressClaimedEmissions(emissions, declared);

  if (declared.length === 0 && unclaimed.length === 0) {
    return emptyMessage ? <>{emptyMessage}</> : null;
  }

  return (
    <div className="space-y-3" data-delivered-stream={runId}>
      {declared.map((deliverable) => (
        <DeliverableSlotCard
          key={deliverable.nodeId}
          runId={runId}
          deliverable={deliverable}
          emission={claimed[deliverable.nodeId] ?? null}
        />
      ))}
      {unclaimed.map((emission, index) => (
        <section
          key={emissionKey(emission, index)}
          data-emission-node={emission.nodeId}
          data-emission-route={emission.kind ?? "kindless"}
          className="overflow-hidden rounded-xl border border-border bg-card"
        >
          <header className="border-b border-border/60 px-3 py-2">
            <span className="min-w-0 truncate text-[11px] font-medium text-muted-foreground">
              {emission.title ?? emission.nodeId}
            </span>
          </header>
          <div className="p-3">
            <EmissionRender
              runId={runId}
              emission={emission}
              index={index}
              variant="bare"
            />
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * ONE declared deliverable, from reserved silhouette to settled content,
 * without the card ever changing size around the reader.
 */
function DeliverableSlotCard({
  runId,
  deliverable,
  emission,
}: {
  runId: string;
  deliverable: DeclaredDeliverable;
  emission: RenderableEmission | null;
}) {
  const aggregate = useAppSelector(selectNodeAggregate(runId, deliverable.nodeId));
  const produced = settledOutput(aggregate.invocations);
  const settled = emission !== null || produced !== null;
  const phase = kindSlotPhase({
    started: aggregate.phase !== "idle" && aggregate.phase !== "waiting",
    settled,
    failed: !settled && aggregate.phase === "failed",
  });

  // The kind actually on screen: the emission's verified kind first (it is the
  // shaped thing the author chose), then the node's settled output kind, then
  // the declaration — which is null for every dynamic-output node.
  const liveKind =
    emission?.kind ?? produced?.outputKind ?? deliverable.outputKind ?? null;

  return (
    <section
      data-deliverable-node={deliverable.nodeId}
      data-deliverable-settled={settled ? "true" : "false"}
      data-deliverable-source={
        emission ? "emission" : produced ? "output" : "none"
      }
      className={cn(
        "overflow-hidden rounded-xl border bg-card",
        settled ? "border-border" : "border-dashed border-border/70",
      )}
    >
      <header className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground">
          {emission?.title ?? deliverable.title}
        </span>
        {deliverable.isPrimary ? (
          <span className="shrink-0 rounded-full bg-primary/10 px-1.5 text-[10px] font-medium text-primary">
            primary
          </span>
        ) : null}
        {!settled ? (
          <span className="shrink-0 text-[10px] text-muted-foreground/80">
            {phase === "arriving"
              ? "being made"
              : phase === "failed"
                ? "hit a problem"
                : "coming up"}
          </span>
        ) : null}
      </header>
      <div className="p-3">
        <KindSlot
          slotKey={`${runId}:${deliverable.nodeId}`}
          kind={liveKind}
          phase={phase}
          chrome="bare"
          error={
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              This one didn&apos;t get made — see the step for what to do.
            </p>
          }
        >
          {emission ? (
            <EmissionRender runId={runId} emission={emission} variant="bare" />
          ) : produced && produced.outputKind ? (
            <KindInstanceRender
              kind={produced.outputKind}
              value={produced.output}
              showRoutingNote={false}
              variant="bare"
            />
          ) : null}
        </KindSlot>
      </div>
    </section>
  );
}

export default DeliveredStream;
