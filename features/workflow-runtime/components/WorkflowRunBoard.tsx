"use client";

/**
 * WorkflowRunBoard — the Phase 1 exit-test surface: every node of a live
 * workflow run as a tracked row, streamed lanes rendering through the
 * canonical pipeline, surviving refresh mid-run.
 *
 * This is deliberately the ZERO-CONFIG presentation (PLAN.md Tier 0 —
 * summarize, don't mirror): a status board over all nodes + full lanes for
 * the streamed ones. The authored Run Surface (grids, readouts, trigger
 * points) composes the same selectors in Phase 2/3 — nothing here is layout.
 *
 * Rendering law compliance: streamed content renders ONLY via
 * `LiveRunDisplay` (→ MarkdownStream requestId), settled kind-checked output
 * via `KindInstanceRender`. No hand-parsed stream anywhere.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";

import { useWorkflowRun } from "../hooks/useWorkflowRun";
import { useWorkflowRunControls } from "../hooks/useWorkflowRunControls";
import {
  selectChildRunIds,
  selectNodeAggregate,
  selectRunCostTotal,
  selectRunNodeOrder,
  selectRunStatus,
  selectRunTransportMode,
} from "../redux/workflow-runs.selectors";
import {
  InterruptCard,
  InvocationBody,
  PhaseIcon,
  PHASE_LABEL,
} from "./readout-parts";

function NodeRow({ runId, nodeId }: { runId: string; nodeId: string }) {
  const aggregate = useAppSelector(selectNodeAggregate(runId, nodeId));
  const [open, setOpen] = useState(true);
  if (!aggregate) return null;
  const { phase, invocations, specType, expectedCount } = aggregate;
  const hasBody = invocations.some(
    (inv) =>
      inv.laneRequestId !== null ||
      inv.textTail.length > 0 ||
      inv.output !== null ||
      inv.error !== null,
  );
  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        {hasBody ? (
          open ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )
        ) : (
          <span className="w-3.5" />
        )}
        <PhaseIcon phase={phase} />
        <span className="truncate text-sm font-medium">{nodeId}</span>
        {specType ? (
          <span className="truncate text-xs text-muted-foreground">{specType}</span>
        ) : null}
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {invocations.length > 1 || expectedCount > 1
            ? `${invocations.filter((i) => i.phase === "settled").length}/${Math.max(expectedCount, invocations.length)} · `
            : ""}
          {PHASE_LABEL[phase] ?? phase}
        </span>
      </button>
      {open && hasBody ? (
        <div className="space-y-2 border-t border-border px-3 py-2">
          {invocations.map((inv) => (
            <div key={inv.invocationKey}>
              {invocations.length > 1 ? (
                <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <PhaseIcon phase={inv.phase} />
                  Item {inv.itemIndex + 1}
                  {inv.iteration !== null ? ` · pass ${inv.iteration + 1}` : ""}
                </div>
              ) : null}
              <InvocationBody runId={runId} invocation={inv} />
              {inv.progress?.message ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {inv.progress.message}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function WorkflowRunBoard({
  runId,
  adopt = true,
}: {
  runId: string;
  /**
   * The parent adapter already follows child runs (subgraph_run_linked), so a
   * nested board must NOT adopt again — pass false for child boards.
   */
  adopt?: boolean;
}) {
  useWorkflowRun(adopt ? runId : null);
  const status = useAppSelector(selectRunStatus(runId));
  const nodeOrder = useAppSelector(selectRunNodeOrder(runId));
  const costTotal = useAppSelector(selectRunCostTotal(runId));
  const transport = useAppSelector(selectRunTransportMode(runId));
  const childRunIds = useAppSelector(selectChildRunIds(runId));
  const { pause, resumePaused, cancel } = useWorkflowRunControls();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
        <span className="text-sm font-medium">{PHASE_LABEL[status ?? ""] ?? status ?? "…"}</span>
        {costTotal > 0 ? (
          <span className="text-xs text-muted-foreground">
            ${costTotal.toFixed(4)}
          </span>
        ) : null}
        <span className="text-[11px] text-muted-foreground">{transport}</span>
        <span className="ml-auto flex gap-1.5">
          {status === "running" ? (
            <>
              <button
                type="button"
                onClick={() => void pause(runId)}
                className="rounded-md border border-border px-2 py-1 text-xs"
              >
                Pause
              </button>
              <button
                type="button"
                onClick={() => void cancel(runId)}
                className="rounded-md border border-border px-2 py-1 text-xs"
              >
                Stop
              </button>
            </>
          ) : null}
          {status === "paused" ? (
            <button
              type="button"
              onClick={() => void resumePaused(runId)}
              className="rounded-md border border-border px-2 py-1 text-xs"
            >
              Resume
            </button>
          ) : null}
        </span>
      </div>

      <InterruptCard runId={runId} />

      {nodeOrder.map((nodeId) => (
        <NodeRow key={nodeId} runId={runId} nodeId={nodeId} />
      ))}

      {childRunIds.map((childId) => (
        <div key={childId} className="ml-4 border-l border-border pl-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Sub-workflow
          </p>
          <WorkflowRunBoard runId={childId} adopt={false} />
        </div>
      ))}
    </div>
  );
}
