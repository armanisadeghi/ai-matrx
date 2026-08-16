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
import { appendVisionStatement } from "../service";
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
  sessionMerged,
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
  // The SSE follower for the current run — armed EXACTLY ONCE per run_id and
  // aborted only on unmount or a genuine new run. Re-arming a live follower
  // aborts its SSE connection and replays the feed from seq 0, pushing stale
  // lifecycle events back through the choreography — never do it.
  const followAbortRef = useRef<AbortController | null>(null);
  // The run_id the current live follower is on; cleared when the follower
  // settles (terminal event / gave up / aborted) so a later start can re-arm.
  const followingRunIdRef = useRef<string | null>(null);
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
    // Once per run: a live follower on this run_id is left alone. (It only
    // needs re-arming after it SETTLED — terminal event or reconnects
    // exhausted — which clears followingRunIdRef below.)
    if (
      followingRunIdRef.current === followRunId &&
      followAbortRef.current &&
      !followAbortRef.current.signal.aborted
    ) {
      return;
    }
    followAbortRef.current?.abort();
    const controller = new AbortController();
    followAbortRef.current = controller;
    followingRunIdRef.current = followRunId;
    void dispatch(
      followWorkflowRunStream({
        runId: followRunId,
        requestId: adopted.requestId,
        conversationId: adopted.conversationId,
        signal: controller.signal,
        onEvent: handleRunEvent,
      }),
    ).finally(() => {
      if (followAbortRef.current === controller) {
        followingRunIdRef.current = null;
      }
    });
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
          // FIRST adoption of a run wins: the follower routes node streams
          // into that row for the run's whole life (armed once — see
          // startFollowing). Later resume adoptions mint inline rows we
          // deliberately ignore so the room keeps reading the row the
          // follower actually writes.
          if (
            followingRunIdRef.current &&
            followAbortRef.current &&
            !followAbortRef.current.signal.aborted &&
            adoptedRef.current
          ) {
            return;
          }
          adoptedRef.current = { requestId, conversationId };
          dispatch(streamAdopted({ sessionId, requestId }));
        },
        onEvent: handleInlineEvent,
      }),
    );

  /** Runs one start/resume request. Returns true when the request was
   *  ACCEPTED (stream consumed without an error envelope) — the caller uses
   *  this to decide whether the composer draft may be cleared. Every failure
   *  path lands in `runFailed`, which returns the surface to an actionable
   *  state (Start re-arms); nothing here can leave a stuck busy flag. */
  const runStream = async (
    call: () => ReturnType<typeof callApi>,
  ): Promise<boolean> => {
    if (inFlightRef.current) return false;
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
        return false;
      }
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "The interview run failed.";
      dispatch(runFailed({ message }));
      toast.error(message);
      return false;
    } finally {
      inFlightRef.current = false;
    }
  };

  /**
   * Start (or restart — the tables are truth, a new run re-hydrates) the
   * session's workflow run.
   *
   * `openingMessage` is the pre-start composer draft: it is appended to the
   * session's vision statement BEFORE the run starts (the backend seeds
   * turn 0 from it on a fresh session, and it stays on the session as
   * durable context for restarts). Returns true when the draft was CONSUMED
   * — false means keep it in the composer.
   *
   * Consumption == the append landing, NOT the run starting. Once the
   * statement is durably on the session row, the composer must clear even if
   * the run then fails to start — otherwise "Try again" re-appends the same
   * text and corrupts the vision statement (Bugbot, PR #146). A run-start
   * failure after a successful append surfaces via `runFailed` as usual.
   */
  const start = async (openingMessage?: string): Promise<boolean> => {
    if (inFlightRef.current) return false;
    const message = openingMessage?.trim();
    let draftConsumed = false;
    if (message) {
      try {
        const saved = await appendVisionStatement(sessionId, message);
        // Merge the fresh row now; the realtime echo is dropped by the
        // slice's monotonic guard.
        dispatch(sessionMerged(saved));
        draftConsumed = true;
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : "Could not save your statement — nothing was started.",
        );
        return false; // Draft stays in the composer; Start stays armed.
      }
    }
    const consume = adopt();
    const started = await runStream(() =>
      callApi({
        path: "/vision-interview/sessions/{session_id}/start" as never,
        method: "POST",
        pathParams: { session_id: sessionId } as never,
        body: {} as never,
        stream: true,
        consumeStream: consume,
      }),
    );
    if (draftConsumed && !started) {
      toast.info(
        "Your statement is saved on the session — starting the room failed; try Start again.",
      );
    }
    return draftConsumed || started;
  };

  /** Answer the pending human-input interrupt (and/or send controls).
   *  Returns true when the answer was accepted (draft may clear). */
  const resume = async (input: ResumeInput): Promise<boolean> => {
    if (!runId) {
      toast.error("There is no active run to answer — start the interview first.");
      return false;
    }
    const checkpointId = pendingInterrupt?.checkpointId;
    if (!checkpointId) {
      toast.error("The run is not waiting for input right now.");
      return false;
    }
    const consume = adopt();
    const accepted = await runStream(() =>
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
    // NO unconditional re-arm: the follower armed at run start stays live
    // across resumes (aborting it here replayed the feed from seq 0 into the
    // choreography). This call is a guarded no-op while it is live — it only
    // arms a fresh follower if the previous one already settled (e.g. its
    // reconnects were exhausted), and never on a failed resume request.
    if (accepted) startFollowing(runId);
    return accepted;
  };

  return { runPhase, runId, pendingInterrupt, start, resume };
}
