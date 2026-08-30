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
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🚨 THIS COMPONENT IS SCHEDULED FOR DELETION AND IS NOT CANONICAL.
 *
 * UI-CENSUS #35 marks it `delete` in Phase 5.1: its controls moved to census
 * #34, `run/RunControlBar.tsx`, which shipped and is a strict superset of the
 * pause/resume/stop this board carries (it adds graceful-vs-immediate cancel
 * and disabled-with-reason states). The board itself is a SECOND run
 * presentation, and the program's no-legacy rule says a second presentation
 * dies when the first one lands.
 *
 * It is still here, and the 2026-08-30 closing wave DECLINED to force the
 * deletion, because the replacement pair does not cover the two live call
 * sites. The exact, verified delta — the only thing that has to be built
 * before this file can go:
 *
 *   1. DEFINITION-FREE RENDERING. This board needs a `runId` and nothing
 *      else; its node list comes from `selectRunNodeOrder` (live redux).
 *      `RunStage` requires `definitionId` + a resolved `WorkflowDefinitionLike`
 *      as non-nullable props and calls `describeWorkflowSteps(definition)` in
 *      render. Both call sites are precisely the no-definition case.
 *   2. RECURSIVE CHILD RUNS. This is the only consumer of `selectChildRunIds`
 *      in the repo; it renders ITSELF, indented, per sub-workflow run.
 *      `RunStage`/`RunControlBar` reference that selector nowhere.
 *   3. A NARROW, NESTABLE LAYOUT. `RunStage` is a full-page dashboard
 *      (`max-w-[1500px]`, two-column grid, sticky aside). Both call sites
 *      embed a board inside a 26rem column or an indented disclosure.
 *
 * Do NOT add a third consumer. Adding one is what turned a scheduled deletion
 * into a growing dependency (PHASE8-CROSSCHECK D2) — the defect this banner
 * exists to stop from repeating.
 * ═══════════════════════════════════════════════════════════════════════════
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
import { RunEmissions } from "./run/RunEmissions";
import {
  InterruptCard,
  InvocationBody,
  PhaseIcon,
  PHASE_LABEL,
  RunErrorCard,
  RunResultCard,
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
        {/* Transport is a live-follow detail — meaningless (and misleading:
            "polling" forever) once the run is terminal. */}
        {status === "running" || status === "paused" ? (
          <span className="text-[11px] text-muted-foreground">{transport}</span>
        ) : null}
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

      <RunErrorCard runId={runId} />
      <InterruptCard runId={runId} />

      {nodeOrder.map((nodeId) => (
        <NodeRow key={nodeId} runId={runId} nodeId={nodeId} />
      ))}

      {/* The finished run as ONE `run_result` packet — provenance + one
          node_outcome per terminal node, each delegating its payload to the
          data kind's own component. The board declares no deliverables, so
          nothing else on this surface draws those payloads. */}
      <RunResultCard runId={runId} />

      {/* Mid-run `node_emitted` content, through the one emit renderer. The
          board has no definition to prefetch from and no author's labels — the
          node id is the honest label at Tier 0. */}
      <RunEmissions runId={runId} />

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
