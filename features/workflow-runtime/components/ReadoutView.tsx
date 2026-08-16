"use client";

/**
 * ReadoutView — renders ONE readout's content inside a Run Surface grid
 * cell. The cell FRAME (border/bg/title row) is drawn by the host
 * (RunSurfaceView); everything here renders bare (the wrapper law).
 *
 * Source kinds:
 * - "node"        — the node's invocations via the shared InvocationBody,
 *                   honoring the author-chosen multi-run mode (R8).
 * - "group"       — mini status line per member + bodies for members with
 *                   lanes/output.
 * - "childRun"    — the linked child run as a nested zero-config board (the
 *                   compact profile lands later).
 * - "progressRail"— ProgressRailReadout.
 * - "static"      — markdown via the canonical MarkdownStream (content mode).
 * - "action"      — Phase 4 stub: disabled button + readiness note.
 *
 * Rendering law compliance: all streamed/settled content flows through
 * InvocationBody (LiveRunDisplay / KindInstanceRender) or MarkdownStream —
 * nothing here parses a stream.
 */

import { useAppSelector } from "@/lib/redux/hooks";
import MarkdownStream from "@/components/MarkdownStream";

import type { Readout, ReadoutSource } from "../surface/config";
import {
  selectChildRunIdForNode,
  selectNodeAggregate,
} from "../redux/workflow-runs.selectors";
import type { NodeInvocationState } from "../redux/workflow-runs.slice";
import { InvocationBody, PhaseIcon, PHASE_LABEL } from "./readout-parts";
import { ProgressRailReadout } from "./ProgressRailReadout";
import { WorkflowRunBoard } from "./WorkflowRunBoard";

function invocationHasBody(inv: NodeInvocationState): boolean {
  return (
    inv.laneRequestId !== null ||
    inv.textTail.length > 0 ||
    inv.output !== null ||
    inv.error !== null
  );
}

/** One-line summary for the compact table mode — honest v1: the output kind
 * when declared, else the first 80 chars of the text tail / raw output. */
function invocationSummary(inv: NodeInvocationState): string {
  if (inv.outputKind) return inv.outputKind;
  const text =
    inv.textTail.length > 0
      ? inv.textTail
      : inv.output !== null
        ? JSON.stringify(inv.output)
        : inv.error?.message ?? "";
  if (!text) return PHASE_LABEL[inv.phase] ?? inv.phase;
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

function NodeReadout({
  runId,
  nodeId,
  multiRun,
  prefer,
}: {
  runId: string;
  nodeId: string;
  multiRun: "stack" | "latest" | "table";
  prefer: "live" | "persisted";
}) {
  const aggregate = useAppSelector(selectNodeAggregate(runId, nodeId));
  const { invocations, phase } = aggregate;

  if (invocations.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        {PHASE_LABEL[phase] ?? phase}
      </p>
    );
  }

  if (multiRun === "latest") {
    const latest = invocations[invocations.length - 1];
    return (
      <div className="space-y-1">
        {invocations.length > 1 ? (
          <p className="text-[11px] text-muted-foreground">
            {invocations.length} of {invocations.length} — showing the latest
          </p>
        ) : null}
        <InvocationBody runId={runId} invocation={latest} prefer={prefer} />
      </div>
    );
  }

  if (multiRun === "table") {
    // Honest v1: a compact row per invocation — icon + item index + a
    // one-line summary. Rich cells (kind-aware columns) land later.
    return (
      <div className="space-y-0.5">
        {invocations.map((inv) => (
          <div
            key={inv.invocationKey}
            className="flex min-w-0 items-center gap-1.5 text-[11px]"
          >
            <PhaseIcon phase={inv.phase} />
            <span className="shrink-0 text-muted-foreground">
              Item {inv.itemIndex + 1}
            </span>
            <span className="truncate text-foreground">
              {invocationSummary(inv)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  // "stack" — every invocation, full bodies.
  return (
    <div className="space-y-2">
      {invocations.map((inv) => (
        <div key={inv.invocationKey}>
          {invocations.length > 1 ? (
            <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <PhaseIcon phase={inv.phase} />
              Item {inv.itemIndex + 1}
              {inv.iteration !== null ? ` · pass ${inv.iteration + 1}` : ""}
            </div>
          ) : null}
          <InvocationBody runId={runId} invocation={inv} prefer={prefer} />
          {inv.progress?.message ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {inv.progress.message}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function GroupMemberReadout({
  runId,
  nodeId,
  prefer,
}: {
  runId: string;
  nodeId: string;
  prefer: "live" | "persisted";
}) {
  const aggregate = useAppSelector(selectNodeAggregate(runId, nodeId));
  const { phase, invocations, specType } = aggregate;
  const withBody = invocations.filter(invocationHasBody);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs">
        <PhaseIcon phase={phase} />
        <span className="truncate font-medium">
          {specType ?? "Workflow step"}
        </span>
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
          {PHASE_LABEL[phase] ?? phase}
        </span>
      </div>
      {withBody.map((inv) => (
        <InvocationBody
          key={inv.invocationKey}
          runId={runId}
          invocation={inv}
          prefer={prefer}
        />
      ))}
    </div>
  );
}

function ChildRunReadout({
  runId,
  nodeId,
}: {
  runId: string;
  nodeId: string;
}) {
  const childRunId = useAppSelector(selectChildRunIdForNode(runId, nodeId));
  if (!childRunId) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Starts when this step runs
      </p>
    );
  }
  // The parent adapter already follows linked children — never adopt again.
  // The compact child profile lands later; the zero-config board is honest.
  return <WorkflowRunBoard runId={childRunId} adopt={false} />;
}

function ActionReadout({ label }: { label: string }) {
  // Phase 4 wires execution; the stub keeps the authored surface honest.
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled
        className="rounded-md border border-border bg-muted px-3 py-1.5 text-xs text-muted-foreground opacity-60"
      >
        {label}
      </button>
      <p className="text-[11px] text-muted-foreground">
        Ready when its step can run
      </p>
    </div>
  );
}

export function ReadoutView({
  runId,
  readout,
}: {
  runId: string;
  readout: Readout;
}) {
  const source: ReadoutSource = readout.source;
  const prefer = readout.prefer ?? "live";
  switch (source.kind) {
    case "node":
      return (
        <NodeReadout
          runId={runId}
          nodeId={source.nodeId}
          multiRun={readout.multiRun ?? "stack"}
          prefer={prefer}
        />
      );
    case "group":
      return (
        <div className="space-y-2">
          {source.nodeIds.map((nodeId) => (
            <GroupMemberReadout
              key={nodeId}
              runId={runId}
              nodeId={nodeId}
              prefer={prefer}
            />
          ))}
        </div>
      );
    case "childRun":
      return <ChildRunReadout runId={runId} nodeId={source.nodeId} />;
    case "progressRail":
      return (
        <ProgressRailReadout
          runId={runId}
          nodeIds={source.nodeIds}
          syntheticSteps={source.syntheticSteps}
        />
      );
    case "static":
      return <MarkdownStream content={source.markdown} />;
    case "action":
      return <ActionReadout label={source.label} />;
    default:
      return null;
  }
}
