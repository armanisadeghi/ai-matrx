"use client";

/**
 * Shared per-invocation readout parts — extracted from the Phase 1
 * WorkflowRunBoard so the Phase 2 Run Surface (ReadoutView / RunSurfaceView /
 * ProgressRailReadout) and the zero-config board render node state through
 * ONE implementation.
 *
 * Rendering law compliance: streamed content renders ONLY via
 * `LiveRunDisplay` (→ MarkdownStream requestId), settled kind-checked output
 * via `KindInstanceRender`. No hand-parsed stream anywhere.
 */

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Loader2,
  SkipForward,
} from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import { LiveRunDisplay } from "@/features/agents/components/live-run/LiveRunDisplay";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";

import { useWorkflowRunControls } from "../hooks/useWorkflowRunControls";
import { selectRunInterrupt } from "../redux/workflow-runs.selectors";
import type { NodeInvocationState } from "../redux/workflow-runs.slice";

export const PHASE_LABEL: Record<string, string> = {
  idle: "Not started",
  waiting: "Waiting",
  running: "Working",
  settled: "Done",
  failed: "Needs attention",
  skipped: "Skipped",
  retrying: "Retrying",
};

export function PhaseIcon({ phase }: { phase: string }) {
  switch (phase) {
    case "running":
    case "retrying":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
    case "settled":
      return <CheckCircle2 className="h-3.5 w-3.5 text-primary" />;
    case "failed":
      return <AlertTriangle className="h-3.5 w-3.5 text-destructive" />;
    case "skipped":
      return <SkipForward className="h-3.5 w-3.5 text-muted-foreground" />;
    default:
      return <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

export function InvocationBody({
  runId,
  invocation,
}: {
  runId: string;
  invocation: NodeInvocationState;
}) {
  if (invocation.laneRequestId) {
    return (
      <LiveRunDisplay
        requestId={invocation.laneRequestId}
        label={invocation.nodeId}
        variant="bare"
      />
    );
  }
  if (invocation.phase === "settled" && invocation.outputKind && invocation.output) {
    return (
      <KindInstanceRender
        kind={invocation.outputKind}
        value={invocation.output}
        showRoutingNote={false}
      />
    );
  }
  if (invocation.textTail) {
    return (
      <p className="whitespace-pre-wrap text-xs text-muted-foreground">
        {invocation.textTail}
      </p>
    );
  }
  if (invocation.phase === "settled" && invocation.output) {
    return (
      <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 text-[11px]">
        {JSON.stringify(invocation.output, null, 2)}
      </pre>
    );
  }
  if (invocation.error) {
    return (
      <p className="text-xs text-destructive">
        {invocation.error.message ?? "This step failed."}
      </p>
    );
  }
  return null;
}

export function InterruptCard({ runId }: { runId: string }) {
  const interrupt = useAppSelector(selectRunInterrupt(runId));
  const { answerInterrupt } = useWorkflowRunControls();
  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState(false);
  if (!interrupt) return null;
  const prompt =
    typeof interrupt.payload.prompt === "string"
      ? interrupt.payload.prompt
      : "This workflow is waiting for your answer.";
  return (
    <div className="rounded-xl border border-primary/40 bg-primary/5 p-3">
      <p className="text-sm font-medium">{prompt}</p>
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        className="mt-2 w-full rounded-md border border-border bg-background p-2 text-base"
        rows={2}
      />
      <button
        type="button"
        disabled={sending}
        onClick={() => {
          setSending(true);
          void answerInterrupt(runId, interrupt.checkpointId, answer).finally(
            () => setSending(false),
          );
        }}
        className="mt-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
      >
        {sending ? "Sending…" : "Send answer"}
      </button>
    </div>
  );
}
