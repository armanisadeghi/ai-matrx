"use client";

/**
 * WorkflowRunWindow — THE FLOATING LAW, applied to a workflow run.
 *
 * 🚨 WHY THIS EXISTS. A workflow run used to exist only on its own two routes.
 * `useWorkflowRun` refcounts the Run Stream Adapter per mount, so the instant
 * the run page unmounted the refcount hit zero, `stop()` tore the transports
 * down, and the run vanished from the client — the person who dared to click
 * anything else got a spinner somewhere else and no way back. The work never
 * stopped (it is server-side, and its `workflow.run` row is the durable
 * record); only the ability to WATCH it did. That is the spinner defect.
 *
 * This window is the fix, and the fix is one line of mechanism: mounting it
 * calls `useWorkflowRun(runId)`, which is an adoption like any other. The
 * window IS the run's home while no page is holding it — status, what it is
 * doing right now, whether it is parked on a question, and a door back to the
 * full page. Drag it, resize it, minimize it to the tray, keep working.
 *
 * It is an ADAPTER, not a second run system: every fact comes from the
 * workflowRuns selectors, the body is a route-shared unit that knows nothing
 * about windows, and the frame is the same `WindowPanel` every other window
 * uses. Nothing here parses a stream or fetches a run.
 *
 * Ephemeral and multi-instance: one window per run, and a live run is not
 * restored across reloads — the run's permalink is what survives a reload.
 */

import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { useAppSelector } from "@/lib/redux/hooks";
import { useWorkflowRun } from "@/features/workflow-runtime/hooks/useWorkflowRun";
import { selectRunStatus } from "@/features/workflow-runtime/redux/workflow-runs.selectors";
import { RunStatusChip } from "@/features/workflow-runtime/run-status";
import { FloatingRunBody } from "@/features/workflow-runtime/floating/FloatingRunBody";

/**
 * Narrower and shorter than the chat-matched `LiveRunWindow`: this body is a
 * status line plus a steps rail, not content-IR kind components tuned against
 * the `/chat` reading column. The finished goods live on the run page, which
 * is one click away in the footer — a float that tried to be the whole page
 * would cover the page the person navigated to.
 */
const RUN_WINDOW_WIDTH = 460;
const RUN_WINDOW_HEIGHT = "52dvh";

export interface WorkflowRunWindowProps {
  windowInstanceId: string;
  onClose: () => void;
  /** The run this window follows. Adopting it is what keeps it alive. */
  runId: string;
  /** The workflow's name, so the title is words rather than a uuid. */
  workflowName?: string | null;
  /**
   * nodeId → the definition's human step name, handed over with the run.
   * THE NO-GRAPH-IDS LAW: this window is rendered at the root of the tree and
   * has no route to the definition, so a float without these narrates in node
   * ids ("T in · Started"). The surface giving the run up supplies them.
   */
  stepLabels?: Record<string, string> | null;
}

export default function WorkflowRunWindow({
  windowInstanceId,
  onClose,
  runId,
  workflowName = null,
  stepLabels = null,
}: WorkflowRunWindowProps) {
  // THE WHOLE POINT: this adoption is what survives the navigation. The page
  // released its refcount as it unmounted; this one takes it, and the adapter
  // replays the durable log from the slice's cursor and goes live again.
  useWorkflowRun(runId);
  const status = useAppSelector(selectRunStatus(runId));

  return (
    <WindowPanel
      id={`workflow-run-window-${windowInstanceId}`}
      title={workflowName ?? "Workflow run"}
      overlayId="workflowRunWindow"
      overlayInstanceId={windowInstanceId}
      minWidth={320}
      minHeight={240}
      width={RUN_WINDOW_WIDTH}
      height={RUN_WINDOW_HEIGHT}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      actionsRight={<RunStatusChip status={status} />}
      footerLeft={
        <Link
          href={`/workflows/runs/${runId}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open the full run
        </Link>
      }
      onClose={onClose}
    >
      <FloatingRunBody runId={runId} stepLabels={stepLabels ?? undefined} />
    </WindowPanel>
  );
}
