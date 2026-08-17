"use client";

// features/masterwork/components/masterworks/TryMasterworkBox.tsx
//
// "Try your Masterwork" IN PLACE — the Masterwork is a working AI checker, so
// the Masterworks page lets the Expert run it right here: paste text (edit
// shape) or a brief (generate shape), watch the real stages tick by, and read
// the chief's ruling when it lands. The workflow studio stays available as the
// power door; it is no longer the only way to run a Masterwork.
//
// Canonical machinery, nothing bespoke (mirrors features/vision-interview/
// hooks/useInterviewRun.ts): callApi starts the run (typed path), the inline
// NDJSON detaches after handing us run_id, followWorkflowRunStream owns the
// durable SSE (reconnects, stall detection), and the final markdown renders
// through RichDocument (the one pipeline). The run itself is durable server
// work — closing the page loses nothing; the run lands in Past runs.
//
// And a refresh loses nothing EITHER: the run id is remembered per Masterwork
// for the tab's lifetime, so on mount we read the run row and either rejoin
// the live run (attachWorkflowRun replays the node lifecycle we missed) or
// show the verdict it reached while the Expert was away.

import { useEffect, useRef, useState } from "react";
import { CircleCheck, CircleDashed, CircleX, Play, Scale } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { ProTextarea } from "@/components/official/ProTextarea";
import { callApi } from "@/lib/api/call-api";
import { useAppDispatch } from "@/lib/redux/hooks";
import { adoptForeignStream } from "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream";
import { attachWorkflowRun } from "@/features/agents/redux/execution-system/thunks/attach-workflow-run";
import {
  followWorkflowRunStream,
  type WorkflowRunWireEvent,
} from "@/features/agents/redux/execution-system/thunks/follow-workflow-run-stream";
import { RichDocument } from "@/features/rich-document/RichDocument";
import type { TypedStreamEvent } from "@/types/python-generated/stream-events";
import {
  getMasterworkRunVerdict,
  type MasterworkRunVerdict,
} from "../../service";

type Phase = "idle" | "starting" | "running" | "done" | "failed";

interface StageRow {
  nodeId: string;
  status: "running" | "done" | "failed";
}

// workflow.run's terminal vocabulary — "errored" is what a mid-run node
// failure writes (proven live 2026-08-17: a run erroring left this box
// "Working…" forever because the list missed it).
const TERMINAL_STATUSES = [
  "completed",
  "failed",
  "errored",
  "cancelled",
  "abandoned",
];

/**
 * The last run started for this Masterwork, remembered for the tab's lifetime
 * so a refresh rejoins it instead of dropping the Expert back to an empty box.
 * sessionStorage (not local): a run is a "what am I watching right now",
 * scoped to this tab, and it must never resurrect weeks later.
 */
const runKey = (masterworkId: string) =>
  `matrx.masterwork.run.${masterworkId}`;

function rememberRun(masterworkId: string, runId: string): void {
  try {
    sessionStorage.setItem(runKey(masterworkId), runId);
  } catch {
    // Private mode / quota — losing re-attach is a downgrade, never a failure.
  }
}

function recallRun(masterworkId: string): string | null {
  try {
    return sessionStorage.getItem(runKey(masterworkId));
  } catch {
    return null;
  }
}

function forgetRun(masterworkId: string): void {
  try {
    sessionStorage.removeItem(runKey(masterworkId));
  } catch {
    /* see rememberRun */
  }
}

/** Node-id → plain language. Auditors are per-section (audit_X). */
function stageLabel(nodeId: string): string {
  if (nodeId === "ask") return "Reading your submission";
  if (nodeId.startsWith("audit_")) return `Checking rules (${nodeId.slice(6)})`;
  if (nodeId.startsWith("mk_")) return `Writing variant ${nodeId.slice(3)}`;
  if (nodeId === "maker") return "Writing variants";
  if (nodeId === "editor") return "Applying corrections";
  if (nodeId === "chief") return "The expert's final ruling";
  if (nodeId === "understudy") return "Doing the whole job (first cut)";
  return nodeId.replaceAll("_", " ");
}

export function TryMasterworkBox({
  masterworkId,
  masterworkKind,
  onRunFinished,
  onCompare,
}: {
  masterworkId: string;
  /** From the Masterwork's metadata (masterwork_kind): "edit" | "generate". */
  masterworkKind: string | null;
  /** Fired when a run reaches a terminal state (refresh Past runs). */
  onRunFinished: () => void;
  /**
   * Owner-only door beside the verdict: hand the Masterwork's own output to
   * the Audition, prefilled, so "is this actually as good as the real thing?"
   * is one click from the answer instead of a copy-paste. Omit to hide it.
   */
  onCompare?: (candidateText: string) => void;
}) {
  const dispatch = useAppDispatch();
  const [text, setText] = useState("");
  const [notes, setNotes] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [stages, setStages] = useState<StageRow[]>([]);
  const [verdict, setVerdict] = useState<MasterworkRunVerdict | null>(null);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  /** True while showing a run recovered on mount rather than started here. */
  const [rejoined, setRejoined] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef<string | null>(null);
  const adoptedRef = useRef<{ requestId: string; conversationId: string } | null>(
    null,
  );
  const isEdit = masterworkKind !== "generate";

  useEffect(() => () => abortRef.current?.abort(), []);

  // Backstop: the SSE follower is the primary signal, but a run is durable
  // server work — if the stream dies silently (proxy restart, dropped
  // reconnect), the run row is still truth. While running, check it every
  // 20s; a terminal status the stream never delivered recovers the verdict
  // AND screams, because a firing backstop means the stream path failed.
  useEffect(() => {
    if (phase !== "running") return;
    const timer = setInterval(() => {
      const runId = runIdRef.current;
      if (!runId) return;
      void getMasterworkRunVerdict(runId)
        .then((result) => {
          if (!result) return;
          if (TERMINAL_STATUSES.includes(result.status)) {
            console.error(
              "[TryMasterworkBox] run reached a terminal state but the event stream never delivered it — recovered from the run row",
              { runId, status: result.status },
            );
            abortRef.current?.abort();
            if (result.status === "completed") {
              setVerdict(result);
              setPhase("done");
            } else {
              setPhase("failed");
              setFailureMessage(
                "The run didn't finish — its details are in Past runs.",
              );
            }
            onRunFinished();
          }
        })
        .catch(() => undefined);
    }, 20_000);
    return () => clearInterval(timer);
  }, [phase, onRunFinished]);

  const handleRunEvent = (event: WorkflowRunWireEvent) => {
    // Breadcrumb for the missed-terminal-event investigation (see the
    // backstop below): if the backstop ever fires, this trail shows exactly
    // which event the stream died after.
    console.debug("[TryMasterworkBox] run event", event.event, event.node_id ?? "");
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
          const result = runId ? await getMasterworkRunVerdict(runId) : null;
          setVerdict(result);
          setPhase("done");
          // We watched this one land, whether or not we rejoined mid-run —
          // so drop the "finished while you were away" note.
          setRejoined(false);
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

  // The event handler is re-created every render (it closes over the latest
  // onRunFinished); the mount-time re-attach must run ONCE, so it reaches the
  // handler through a ref instead of taking it as a dependency.
  const handleRunEventRef = useRef(handleRunEvent);
  handleRunEventRef.current = handleRunEvent;

  // ── Re-attach after a refresh ──────────────────────────────────────────
  // The run is durable server work; only this view was ephemeral. On mount,
  // if this Masterwork has a remembered run: still going → rejoin its event
  // feed (the feed replays the node lifecycle from the start, so the stage
  // list rebuilds itself); already finished → show what it decided while we
  // were away. A run row that no longer reads is forgotten rather than nagged
  // at.
  useEffect(() => {
    const runId = recallRun(masterworkId);
    if (!runId) return;
    let cancelled = false;
    const controller = new AbortController();

    void getMasterworkRunVerdict(runId)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          forgetRun(masterworkId);
          return;
        }
        runIdRef.current = runId;
        setRejoined(true);
        if (result.status === "completed") {
          setVerdict(result);
          setPhase("done");
          return;
        }
        if (TERMINAL_STATUSES.includes(result.status)) {
          setPhase("failed");
          setFailureMessage(
            "That run didn't finish — its details are in Past runs.",
          );
          return;
        }
        // Still running: rejoin the live feed. abortRef is this box's single
        // teardown handle — the unmount effect and any new run both abort it.
        abortRef.current?.abort();
        abortRef.current = controller;
        setPhase("running");
        void dispatch(
          attachWorkflowRun({
            runId,
            signal: controller.signal,
            onEvent: (event) => handleRunEventRef.current(event),
          }),
        );
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [masterworkId, dispatch]);

  /** What a finished run produced — the Audition's candidate, when there is one. */
  const candidateText =
    phase === "done" && verdict
      ? (verdict.editorText ?? verdict.chiefText)
      : null;

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
    setRejoined(false);
    runIdRef.current = null;
    forgetRun(masterworkId);
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
            // Remembered before the first node event: a refresh one second
            // into a four-minute run must still find its way back.
            rememberRun(masterworkId, wire.data.run_id);
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
          pathParams: { definition_id: masterworkId },
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
      <ProTextarea
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
        <ProTextarea
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
        {/* One compare entry per Masterwork: it moves to the verdict
            (prefilled) the moment there is output to compare, so the two
            never stack. */}
        {onCompare && !candidateText ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-xs text-muted-foreground"
            onClick={() => onCompare("")}
          >
            <Scale className="mr-1 h-3.5 w-3.5" />
            Compare to the original
          </Button>
        ) : null}
        {(phase === "running" || phase === "starting") && (
          <span className="text-xs text-muted-foreground">
            {rejoined
              ? "Picking this run back up where it was — it kept going while you were away."
              : "Takes a few minutes — safe to leave; it lands under Past runs."}
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
          {rejoined ? (
            <p className="text-xs text-muted-foreground">
              This finished while you were away — here&apos;s what it decided.
            </p>
          ) : null}
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
          {onCompare && candidateText ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onCompare(candidateText)}
            >
              <Scale className="mr-1 h-3.5 w-3.5" />
              Compare to the original
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
