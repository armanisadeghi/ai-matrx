"use client";

/**
 * FocusPane — the ONE place a step's internals render at full fidelity.
 * It auto-follows the freshest work; the reader can aim it at any step; one
 * button returns it to following. This is also how the streaming budget is
 * honored: only the focused step is promoted to a live lane (ensureLane);
 * everything else stays in the cheap tracked tier.
 *
 * All content renders through the canonical pipeline: InvocationBody
 * (LiveRunDisplay / KindInstanceRender / the platform floor) — zero bespoke
 * stream rendering. Mid-run emissions render below through DbEmitRenderer.
 */

import { useEffect } from "react";
import { Crosshair, LocateFixed } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import IconResolver from "@/components/official/icons/IconResolver";
import { formatElapsed } from "@/components/official-candidate/elapsed-time/ElapsedTime";
import { DbEmitRenderer } from "@/features/workflow-emit/DbEmitRenderer";
import type { EmitMode } from "@/features/workflow-emit/types";

import {
  InvocationBody,
  PhaseIcon,
  PHASE_LABEL,
} from "../../components/readout-parts";
import {
  FAMILY_ICON,
  FAMILY_STYLE,
  familyNoun,
  humanizeKind,
} from "../../components/run/node-presentation";
import { selectRunEmissions } from "../../redux/workflow-runs.selectors";
import type { UseWorkflowRunResult } from "../../hooks/useWorkflowRun";
import type { LedgerRow } from "./model";

const EMIT_MODES: ReadonlySet<string> = new Set([
  "confirmation",
  "summary",
  "full",
  "restructured",
]);

export function FocusPane({
  runId,
  row,
  following,
  onFollow,
  ensureLane,
}: {
  runId: string;
  row: LedgerRow | null;
  following: boolean;
  onFollow: () => void;
  ensureLane: UseWorkflowRunResult["ensureLane"];
}) {
  // Promote ONLY the focused step to a streaming lane — single-invocation
  // running nodes without one yet, seeded with the tracked tail so promotion
  // keeps the visible history. Fan-out stays tracked-tier by adapter law.
  const invocation =
    row && row.invocations.length === 1 && row.expectedCount <= 1
      ? row.invocations[0]
      : null;
  const wantsLane =
    invocation !== null &&
    (invocation.phase === "running" || invocation.phase === "retrying") &&
    invocation.laneRequestId === null;
  const invocationKey = invocation?.invocationKey ?? null;
  const seedText = invocation?.textTail ?? undefined;
  useEffect(() => {
    if (wantsLane && invocationKey) {
      ensureLane(runId, invocationKey, seedText);
    }
  }, [wantsLane, invocationKey, seedText, runId, ensureLane]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
        {row ? (
          <>
            <IconResolver
              iconName={row.step.iconName ?? FAMILY_ICON[row.step.family]}
              className={`h-4 w-4 shrink-0 ${FAMILY_STYLE[row.step.family].text}`}
            />
            <span className="min-w-0 truncate text-sm font-medium text-foreground">
              {row.step.label}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {familyNoun(row.step.family)}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              <PhaseIcon phase={row.phase} />
              {PHASE_LABEL[row.phase]}
              {row.durationMs !== null
                ? ` · ${formatElapsed(row.durationMs)}`
                : ""}
            </span>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">
            Waiting for the first step
          </span>
        )}
        <span className="flex-1" />
        {following ? (
          <span className="flex shrink-0 items-center gap-1 text-xs text-primary">
            <Crosshair className="h-3.5 w-3.5" />
            Following the work
          </span>
        ) : (
          <button
            type="button"
            onClick={onFollow}
            className="flex shrink-0 items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/15"
          >
            <LocateFixed className="h-3.5 w-3.5" />
            Back to the action
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-3">
        {row === null ? null : row.invocations.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-3">
            <p className="text-sm text-muted-foreground">
              {row.phase === "idle"
                ? "This step hasn't started yet."
                : "Queued — it starts as soon as the steps before it finish."}
            </p>
            {row.step.outputKind ? (
              <p className="mt-1 text-xs text-muted-foreground">
                It will deliver: {humanizeKind(row.step.outputKind)}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            {row.invocations.map((inv, index) => (
              <div key={inv.invocationKey}>
                {row.invocations.length > 1 ? (
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <PhaseIcon phase={inv.phase} />
                    Part {index + 1} of {row.expectedCount || row.invocations.length}
                    {inv.durationMs !== null
                      ? ` · ${formatElapsed(inv.durationMs)}`
                      : ""}
                  </p>
                ) : null}
                <InvocationBody runId={runId} invocation={inv} />
              </div>
            ))}
          </div>
        )}
        <EmissionsSection runId={runId} />
      </div>
    </div>
  );
}

/**
 * What the workflow deliberately put on screen while it kept working
 * ("Show on Screen" steps), in arrival order, via the canonical emit renderer.
 */
function EmissionsSection({ runId }: { runId: string }) {
  const emissions = useAppSelector(selectRunEmissions(runId));
  if (emissions.length === 0) return null;
  return (
    <div className="mt-4 border-t border-border pt-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Shown along the way
      </p>
      <div className="space-y-3">
        {emissions.map((emission) => (
          <div
            key={emission.seq ?? `${emission.nodeId}:${emission.ts}`}
            className="rounded-md border border-border p-2.5"
          >
            {emission.title ? (
              <p className="mb-1.5 text-sm font-medium text-foreground">
                {emission.title}
              </p>
            ) : null}
            <DbEmitRenderer
              componentRef={emission.componentRef}
              mode={
                (EMIT_MODES.has(emission.mode)
                  ? emission.mode
                  : "full") as EmitMode
              }
              payload={emission.payload}
              title={emission.title}
              nodeId={emission.nodeId}
              runId={runId}
              seq={emission.seq ?? 0}
              isPersisted={emission.persisted}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
