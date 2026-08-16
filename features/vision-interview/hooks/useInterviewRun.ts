// features/vision-interview/hooks/useInterviewRun.ts
//
// The Vision Interview room's connection to the workflow run on aidream.
// TWO wires, both canonical (verified wire truth, 2026-08-16):
//
//   1. The start/resume NDJSON responses. These DETACH immediately by design
//      (workflow_run_started → workflow_run_detached → end — the scheduler
//      survives client disconnect), so they carry NO tokens and NO node
//      lifecycle. They are adopted via adoptForeignStream only to mint the
//      activeRequests row and to learn the run_id
//      (`interview_run_started` / `workflow_run_started` data events).
//
//   2. The run's SSE events feed (`GET /runs/{run_id}/events/stream`) — the
//      REAL live wire: durable lifecycle events (node_started/node_completed/
//      run_interrupted/…) plus the ephemeral typed `node_stream` token frames.
//      Followed with followWorkflowRunStream (execution system), which routes
//      node_stream frames into activeRequests.nodeStreams and hands every
//      lifecycle event to this hook's choreography handler.
//
// Content still lands as interview.turn rows via Supabase realtime; the node
// streams are the live in-flight view the TranscriptPane renders until the
// persisted turn arrives.
//
// PATH TYPING NOTE: `/vision-interview/...` is not yet in the generated
// api-types (backend built in parallel; `pnpm sync-types` cannot run in this
// container) — those paths are cast `as never`, the same precedent as
// features/legal/wc/pd-ratings/api/hooks.ts. `/runs/{run_id}/resume` IS
// generated and stays fully typed.

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { callApi } from "@/lib/api/call-api";
import { adoptForeignStream } from "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream";
import {
  followWorkflowRunStream,
  type WorkflowRunWireEvent,
} from "@/features/agents/redux/execution-system/thunks/follow-workflow-run-stream";
import type { TypedStreamEvent } from "@/types/python-generated/stream-events";
import { toast } from "@/lib/toast";
import { roleFromNodeId, type RoleKey } from "../types";
import {
  nodeCompleted,
  nodeStarted,
  runCompleted,
  runFailed,
  runInterrupted,
  runResumed,
  runStarted,
  runStarting,
  selectPendingInterrupt,
  selectRunId,
  selectRunPhase,
  streamAdopted,
} from "../redux/vision-interview.slice";

export interface ResumeInput {
  /** The human's message for this turn. May be empty for pure controls. */
  message: string;
  /** "Bring in the Adversary" — design-doc open Q3. */
  summonRole?: RoleKey;
  /** Human-controlled stage advancement — design-doc open Q4. */
  advanceStage?: boolean;
}

export function useInterviewRun(sessionId: string) {
  const dispatch = useAppDispatch();
  const runPhase = useAppSelector(selectRunPhase);
  const runId = useAppSelector(selectRunId);
  const pendingInterrupt = useAppSelector(selectPendingInterrupt);
  // A second click while a call is in flight must not start a second run.
  const inFlightRef = useRef(false);
  // The SSE follower for the current run — one at a time; aborted on
  // restart (a resume adopts a fresh requestId) and on unmount.
  const followAbortRef = useRef<AbortController | null>(null);
  // Ids of the latest adoption, so the follower can start the moment the
  // run_id becomes known (either order: adoption first, run_id event later).
  const adoptedRef = useRef<{ requestId: string; conversationId: string } | null>(
    null,
  );

  useEffect(() => {
    return () => {
      followAbortRef.current?.abort();
      followAbortRef.current = null;
    };
  }, []);

  /** Choreography from the run's SSE feed (FLAT workflow events). */
  const handleRunEvent = (event: WorkflowRunWireEvent) => {
    switch (event.event) {
      case "run_started":
        dispatch(runStarted({ runId: event.run_id ?? null }));
        break;
      case "node_started": {
        const role = roleFromNodeId(event.node_id ?? null);
        if (role) dispatch(nodeStarted({ role }));
        break;
      }
      case "node_completed": {
        const role = roleFromNodeId(event.node_id ?? null);
        if (role) dispatch(nodeCompleted({ role }));
        break;
      }
      case "run_interrupted": {
        const payload = (event.payload ?? {}) as {
          checkpoint_id?: string;
          prompt?: string;
          question?: string;
          message?: string;
        };
        dispatch(
          runInterrupted({
            checkpointId: event.checkpoint_id ?? payload.checkpoint_id ?? "",
            prompt:
              payload.prompt ?? payload.question ?? payload.message ?? null,
          }),
        );
        break;
      }
      case "run_resumed":
        dispatch(runResumed());
        break;
      case "run_completed":
        dispatch(runCompleted());
        break;
      case "run_failed":
      case "run_errored":
      case "run_cancelled":
        dispatch(
          runFailed({
            message:
              (typeof event.error_message === "string" && event.error_message) ||
              "The interview run failed.",
          }),
        );
        break;
      default:
        // node_stream frames already landed in activeRequests.nodeStreams
        // (followWorkflowRunStream routes them before this handler runs).
        break;
    }
  };

  const startFollowing = (followRunId: string) => {
    const adopted = adoptedRef.current;
    if (!adopted) return;
    followAbortRef.current?.abort();
    const controller = new AbortController();
    followAbortRef.current = controller;
    void dispatch(
      followWorkflowRunStream({
        runId: followRunId,
        requestId: adopted.requestId,
        conversationId: adopted.conversationId,
        signal: controller.signal,
        onEvent: handleRunEvent,
      }),
    );
  };

  /**
   * Events on the inline NDJSON start/resume stream. It detaches almost
   * immediately — the only load-bearing signal is the run_id, which arms
   * the SSE follower.
   */
  const handleInlineEvent = (event: TypedStreamEvent) => {
    const wire = event as unknown as {
      event?: string;
      data?: { event?: string; run_id?: string };
    };
    if (wire.event !== "data") return;
    const inner = wire.data;
    if (
      (inner?.event === "interview_run_started" ||
        inner?.event === "workflow_run_started") &&
      typeof inner.run_id === "string"
    ) {
      dispatch(runStarted({ runId: inner.run_id }));
      startFollowing(inner.run_id);
    }
  };

  const adopt = () =>
    dispatch(
      adoptForeignStream({
        onAdopted: ({ requestId, conversationId }) => {
          adoptedRef.current = { requestId, conversationId };
          dispatch(streamAdopted({ sessionId, requestId }));
        },
        onEvent: handleInlineEvent,
      }),
    );

  const runStream = async (
    call: () => ReturnType<typeof callApi>,
  ): Promise<void> => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    dispatch(runStarting());
    try {
      const result = await dispatch(call());
      const error = (result as { error?: { message?: string } }).error;
      if (error) {
        dispatch(
          runFailed({ message: error.message ?? "The run request failed." }),
        );
        toast.error(error.message ?? "The interview run could not start.");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "The interview run failed.";
      dispatch(runFailed({ message }));
      toast.error(message);
    } finally {
      inFlightRef.current = false;
    }
  };

  /** Start (or restart — the tables are truth, a new run re-hydrates) the
   *  session's workflow run. */
  const start = async (): Promise<void> => {
    const consume = adopt();
    await runStream(() =>
      callApi({
        path: "/vision-interview/sessions/{session_id}/start" as never,
        method: "POST",
        pathParams: { session_id: sessionId } as never,
        body: {} as never,
        stream: true,
        consumeStream: consume,
      }),
    );
  };

  /** Answer the pending human-input interrupt (and/or send controls). */
  const resume = async (input: ResumeInput): Promise<void> => {
    if (!runId) {
      toast.error("There is no active run to answer — start the interview first.");
      return;
    }
    const checkpointId = pendingInterrupt?.checkpointId;
    if (!checkpointId) {
      toast.error("The run is not waiting for input right now.");
      return;
    }
    const consume = adopt();
    await runStream(() =>
      callApi({
        path: "/runs/{run_id}/resume",
        method: "POST",
        pathParams: { run_id: runId },
        body: {
          checkpoint_id: checkpointId,
          resume_value: {
            message: input.message,
            ...(input.summonRole ? { summon_role: input.summonRole } : {}),
            ...(input.advanceStage ? { advance_stage: true } : {}),
          },
          mode: "inline",
        },
        stream: true,
        consumeStream: consume,
      }),
    );
    // The resume adopted a fresh requestId; re-arm the follower on it so
    // the next round's node streams land in the row the room now reads.
    startFollowing(runId);
  };

  return { runPhase, runId, pendingInterrupt, start, resume };
}
