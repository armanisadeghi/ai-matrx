"use client";

/**
 * FAN-OUT LANES + THE WORK SET — SPEC-workflow-ui-contract §5.2, adopted.
 *
 * ─── Why this could not exist before ────────────────────────────────────────
 * `NodeStreamEvent` carried no invocation identity, so 50 parallel siblings of
 * one `control.map` target produced 50 interleaved frames the client could not
 * tell apart. The FE half was already correct — `invocationKeyOf(nodeId,
 * dispatch_id, item_index)` and the invocation-keyed fold have been in the
 * slice since the studio port — and V3-A landed the two wire fields
 * (`dispatch_id`, `item_index`) on `node_stream` and `node_emitted`. So the
 * lanes are now separable, and this is what separates them on screen: N
 * independent live lanes instead of one stream that reads like static.
 *
 * ─── What a lane shows, and what it deliberately does not ───────────────────
 * A lane is an INDEX, a phase and the step's own freshest text — the tail the
 * fold keeps per invocation (`textTail`, END-keeping, capped at the same 4,000
 * chars the server's heartbeat keeps). It is not a second readout: the full
 * settled payload renders where every settled payload renders, through the
 * kind component. A lane answers "which of the fifty is stuck", nothing more,
 * which is why it fits in the rail beside the step it belongs to.
 *
 * ─── The work set ───────────────────────────────────────────────────────────
 * `work_set_progress` has been folded into the store since the emitter shipped
 * (nine numeric fields, latest wave wins) and NOTHING rendered it. One compact
 * done/total bar per work set, with the failures called out because a queue
 * that is "90% done" with 40 dead letters is not 90% done.
 */

import { AlertTriangle, Check, Loader2, SkipForward } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";

import {
  selectNodeSiblingLanes,
  selectNodeWorkSet,
} from "../../redux/workflow-runs.selectors";
import type {
  NodeInvocationState,
  WorkflowRunWorkSet,
} from "../../redux/workflow-runs.slice";

/** How much of a lane's tail is worth showing in a rail-width lane. */
const LANE_TAIL_CHARS = 90;

/**
 * The sibling lanes of ONE node. Renders nothing at all for a node that ran
 * once — the step row already IS that lane.
 */
export function RunFanOutLanes({
  runId,
  nodeId,
}: {
  runId: string;
  nodeId: string;
}) {
  const lanes = useAppSelector(selectNodeSiblingLanes(runId, nodeId));
  if (lanes.length === 0) return null;

  const settled = lanes.filter(
    (lane) => lane.phase === "settled" || lane.phase === "skipped",
  ).length;

  return (
    <div data-fanout-node={nodeId} className="mt-1">
      <p className="text-[11px] text-muted-foreground">
        {settled} of {lanes.length} done
      </p>
      <ul className="mt-0.5 space-y-0.5">
        {lanes.map((lane) => (
          <Lane key={lane.invocationKey} lane={lane} />
        ))}
      </ul>
    </div>
  );
}

function Lane({ lane }: { lane: NodeInvocationState }) {
  const running = lane.phase === "running" || lane.phase === "retrying";
  const tail = lane.textTail.slice(-LANE_TAIL_CHARS).trim();
  const detail =
    lane.error?.message ??
    (tail || lane.progress?.message) ??
    (lane.durationMs !== null ? `${Math.round(lane.durationMs)} ms` : null);

  return (
    <li
      data-fanout-lane={lane.invocationKey}
      data-fanout-index={lane.itemIndex}
      data-fanout-phase={lane.phase}
      className="flex items-start gap-1.5 text-[11px]"
    >
      <LaneIcon phase={lane.phase} />
      <span className="w-8 shrink-0 tabular-nums text-muted-foreground">
        #{lane.itemIndex + 1}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          lane.phase === "failed"
            ? "text-destructive"
            : running
              ? "text-foreground/90"
              : "text-muted-foreground",
        )}
      >
        {detail ?? (running ? "working" : "waiting")}
      </span>
    </li>
  );
}

function LaneIcon({ phase }: { phase: NodeInvocationState["phase"] }) {
  switch (phase) {
    case "running":
    case "retrying":
      return (
        <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-primary" />
      );
    case "settled":
      return <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />;
    case "failed":
      return (
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
      );
    case "skipped":
      return (
        <SkipForward className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
      );
    default:
      return <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />;
  }
}

// ---------------------------------------------------------------------------
// The work set
// ---------------------------------------------------------------------------

/** One node's queue, as a compact done/total bar. Null when it runs none. */
export function RunWorkSetBar({
  runId,
  nodeId,
}: {
  runId: string;
  nodeId: string;
}) {
  const set = useAppSelector(selectNodeWorkSet(runId, nodeId));
  if (!set) return null;
  return <WorkSetBar set={set} />;
}

/**
 * The bar itself, pure in its input so the numbers are testable without a
 * store. `total` is the DISPATCHED count, not `discovered`: a queue that keeps
 * finding work would otherwise show a bar that walks backwards.
 */
export function WorkSetBar({ set }: { set: WorkflowRunWorkSet }) {
  const done = set.succeeded + set.failed + set.deadLetter;
  const total = Math.max(set.dispatched, done);
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const broken = set.failed + set.deadLetter;

  return (
    <div
      data-work-set={set.setName || "work"}
      data-work-set-done={set.done ? "true" : "false"}
      className="rounded-lg border border-border bg-card px-2.5 py-1.5"
    >
      <div className="flex items-baseline gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
          {set.setName || "Work queue"}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {done}/{total}
        </span>
      </div>
      <div
        className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            broken > 0 ? "bg-amber-500" : "bg-primary",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      {/* A queue is not "nearly done" while a pile of its items are dead —
          the failures ride on the same line as the progress, never hidden
          behind a tooltip. */}
      {broken > 0 || set.inProgress > 0 ? (
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {[
            set.inProgress > 0 ? `${set.inProgress} running` : null,
            set.failed > 0 ? `${set.failed} failed` : null,
            set.deadLetter > 0 ? `${set.deadLetter} dead` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

export default RunFanOutLanes;
