"use client";

// features/expertise/components/desks/TryDeskBox.tsx
//
// "Try your desk" IN PLACE — the desk is a working AI checker, so the desks
// page lets the expert run it right here: paste text (edit shape) or a brief
// (generate shape), watch the real stages tick by, and read the chief's
// ruling when it lands. The workflow studio stays available as the power
// door; it is no longer the only way to run a desk.
//
// Canonical machinery, nothing bespoke (mirrors features/vision-interview/
// hooks/useInterviewRun.ts): callApi starts the run (typed path), the inline
// NDJSON detaches after handing us run_id, followWorkflowRunStream owns the
// durable SSE (reconnects, stall detection), and the final markdown renders
// through RichDocument (the one pipeline). The run itself is durable server
// work — closing the page loses nothing; the run lands in Past runs.

import { useEffect, useRef, useState } from "react";
import { CircleCheck, CircleDashed, CircleX, Play } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { callApi } from "@/lib/api/call-api";
import { useAppDispatch } from "@/lib/redux/hooks";
import { adoptForeignStream } from "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream";
import {
  followWorkflowRunStream,
  type WorkflowRunWireEvent,
} from "@/features/agents/redux/execution-system/thunks/follow-workflow-run-stream";
import { RichDocument } from "@/features/rich-document/RichDocument";
import type { TypedStreamEvent } from "@/types/python-generated/stream-events";
import {
  getDeskRunVerdict,
  type DeskRunVerdict,
} from "../../service";

type Phase = "idle" | "starting" | "running" | "done" | "failed";

interface StageRow {
  nodeId: string;
  status: "running" | "done" | "failed";
}

/** Node-id → plain language. Auditors are per-section (audit_X). */
function stageLabel(nodeId: string): string {
  if (nodeId === "ask") return "Reading your submission";
  if (nodeId.startsWith("audit_")) return `Checking rules (${nodeId.slice(6)})`;
  if (nodeId.startsWith("mk_")) return `Writing variant ${nodeId.slice(3)}`;
  if (nodeId === "maker") return "Writing variants";
  if (nodeId === "editor") return "Applying corrections";
  if (nodeId === "chief") return "The expert's final ruling";
  return nodeId.replaceAll("_", " ");
}

export function TryDeskBox({
  deskId,
  deskKind,
  onRunFinished,
}: {
  deskId: string;
  /** From the desk's compiled_from_pack metadata: "edit" | "generate". */
  deskKind: string | null;
  /** Fired when a run reaches a terminal state (refresh Past runs). */
  onRunFinished: () => void;
}) {
  const dispatch = useAppDispatch();
  const [text, setText] = useState("");
  const [notes, setNotes] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [stages, setStages] = useState<StageRow[]>([]);
  const [verdict, setVerdict] = useState<DeskRunVerdict | null>(null);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef<string | null>(null);
  const adoptedRef = useRef<{ requestId: string; conversationId: string } | null>(
    null,
  );
  const isEdit = deskKind !== "generate";

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleRunEvent = (event: WorkflowRunWireEvent) => {
    const nodeId = typeof event.node_id === "string" ? event.node_id : null;
    if (nodeId && event.event === "node_started") {
      setStages((prev) =>
        prev.some((s) => s.nodeId === nodeId)
          ? prev
          : [...prev, { nodeId, status: "running" }],
      );
    }
    if (nodeId && (event.event === "node_completed" || event.event === "node_failed")) {
      setStages((prev) =>
        prev.map((s) =>
          s.nodeId === nodeId
            ? { ...s, status: event.event === "node_completed" ? "done" : "failed" }
            : s,
        ),
      );
    }
    if (event.event === "run_completed" || event.event === "run_failed" || event.event === "run_cancelled") {
      const runId = runIdRef.current;
      if (event.event !== "run_completed") {
        setPhase("failed");
        setFailureMessage(
          event.error_message ??
            "The run didn't finish — its details are in Past runs.",
        );
        onRunFinished();
        return;
      }
      void (async () => {
        try {
          const result = runId ? await getDeskRunVerdict(runId) : null;
          setVerdict(result);
          setPhase("done");
        } catch {
          // The run finished; the verdict read failing is recoverable via
          // Past runs — say so instead of pretending the run failed.
          setPhase("failed");
          setFailureMessage(
            "The run finished, but the result couldn't be loaded here — open it under Past runs.",
          );
        } finally {
          onRunFinished();
        }
      })();
    }
  };

  const start = async () => {
    if (!text.trim()) {
      toast.error(
        isEdit ? "Paste the text to check first." : "Describe the job first.",
      );
      return;
    }
    setPhase("starting");
    setStages([]);
    setVerdict(null);
    setFailureMessage(null);
    runIdRef.current = null;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const consume = dispatch(
      adoptForeignStream({
        onAdopted: ({ requestId, conversationId }) => {
          adoptedRef.current = { requestId, conversationId };
        },
        onEvent: (event: TypedStreamEvent) => {
          const wire = event as unknown as {
            event?: string;
            data?: { event?: string; run_id?: string };
          };
          if (wire.event !== "data") return;
          if (
            wire.data?.event === "workflow_run_started" &&
            typeof wire.data.run_id === "string"
          ) {
            const adopted = adoptedRef.current;
            if (!adopted) return;
            runIdRef.current = wire.data.run_id;
            setPhase("running");
            void dispatch(
              followWorkflowRunStream({
                runId: wire.data.run_id,
                requestId: adopted.requestId,
                conversationId: adopted.conversationId,
                signal: controller.signal,
                onEvent: handleRunEvent,
              }),
            );
          }
        },
      }),
    );

    const fieldPayload = isEdit
      ? { document: text, notes }
      : { job_brief: text };
    try {
      const result = await dispatch(
        callApi({
          path: "/workflows/{definition_id}/runs",
          method: "POST",
          pathParams: { definition_id: deskId },
          body: { node_inputs: { ask: fieldPayload } } as never,
          stream: true,
          consumeStream: consume,
        }),
      );
      const error = (result as { error?: { message?: string } }).error;
      if (error) {
        setPhase("failed");
        setFailureMessage(error.message ?? "The run could not start.");
      }
    } catch (err) {
      setPhase("failed");
      setFailureMessage(
        err instanceof Error ? err.message : "The run could not start.",
      );
    }
  };

  return (
    <div className="space-y-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder={
          isEdit
            ? "Paste the text to check against your rules…"
            : "Describe the job — what should it produce, for whom?"
        }
        disabled={phase === "starting" || phase === "running"}
      />
      {isEdit ? (
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={1}
          placeholder="Facts that must not change (names, numbers, claims) — optional"
          disabled={phase === "starting" || phase === "running"}
        />
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => void start()}
          disabled={phase === "starting" || phase === "running"}
        >
          <Play className="mr-1 h-4 w-4" />
          {phase === "starting"
            ? "Starting…"
            : phase === "running"
              ? "Working…"
              : "Run it"}
        </Button>
        {(phase === "running" || phase === "starting") && (
          <span className="text-xs text-muted-foreground">
            Takes a few minutes — safe to leave; it lands under Past runs.
          </span>
        )}
      </div>

      {stages.length > 0 && phase !== "idle" ? (
        <ul className="space-y-0.5">
          {stages.map((s) => (
            <li
              key={s.nodeId}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              {s.status === "running" ? (
                <CircleDashed className="h-3 w-3 animate-spin text-primary" />
              ) : s.status === "done" ? (
                <CircleCheck className="h-3 w-3 text-primary" />
              ) : (
                <CircleX className="h-3 w-3 text-destructive" />
              )}
              {stageLabel(s.nodeId)}
            </li>
          ))}
        </ul>
      ) : null}

      {phase === "failed" && failureMessage ? (
        <p className="text-xs text-destructive">{failureMessage}</p>
      ) : null}

      {phase === "done" && verdict ? (
        <div className="space-y-3 border-t border-border pt-2">
          {verdict.editorText ? (
            <div>
              <h4 className="mb-1 text-xs font-semibold text-foreground">
                Corrected text
              </h4>
              <RichDocument content={verdict.editorText} source={{ type: "raw" }} hideCopyButton contentClassName="text-sm" />
            </div>
          ) : null}
          <div>
            <h4 className="mb-1 text-xs font-semibold text-foreground">
              The ruling
            </h4>
            {verdict.chiefText ? (
              <RichDocument content={verdict.chiefText} source={{ type: "raw" }} hideCopyButton contentClassName="text-sm" />
            ) : (
              <p className="text-xs text-muted-foreground">
                The run finished, but no ruling text came back — open the run
                under Past runs to see everything it produced.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
