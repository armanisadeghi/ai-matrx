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
import { createRequest } from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import {
  generateConversationId,
  generateRequestId,
} from "@/features/agents/redux/execution-system/utils/ids";
import {
  followWorkflowRunStream,
  type WorkflowRunWireEvent,
} from "@/features/agents/redux/execution-system/thunks/follow-workflow-run-stream";
import type { TypedStreamEvent } from "@/types/python-generated/stream-events";
import { isTransportFailure } from "@ai-matrx/data/net";
import { toast, toastErrorAlreadyCaptured } from "@/lib/toast";
import { roleFromNodeId, type InterviewStage, type RoleKey } from "../types";
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
  selectRoomHydrated,
  selectRoomSession,
  selectRunId,
  selectRunPhase,
  sessionMerged,
  streamAdopted,
} from "../redux/vision-interview.slice";

export interface ResumeInput {
  /** The human's message for this turn. May be empty for pure controls. */
  message: string;
  /** "Bring in the Adversary" — the summoned role leads the NEXT round as
   *  its primary (v2: one primary speaks per round). */
  summonRole?: RoleKey;
  /** Human-controlled stage advancement — design-doc open Q4. */
  advanceStage?: boolean;
  /** Jump to ANY stage, forward or back (v2 HumanDirectives.goto_stage) —
   *  the stage rail's click-to-jump. */
  gotoStage?: InterviewStage;
  /** "I am finished" (v2 HumanDirectives.done) — the ONLY way the run's gate
   *  converges, and therefore the only path to `interview.finalize` and its
   *  deliverables (cleaned transcript + Vision + Requirements documents).
   *  The gate answers the FIRST done with what is still open and runs another
   *  round; a REPEATED done is honored as the person's call. Sent from the
   *  finish dialog (`FinishInterviewDialog`), which shows that answer. */
  done?: boolean;
}

/**
 * What the room says when the run ENDED without finishing — including the
 * case where the server never sent a terminal event at all and the follower
 * had to read the run row to find out (wall W9's second half: the room sat on
 * "Handing the interview to the room… Working…" over a run that was already
 * errored). A sentence AND a remedy; never a spinner over a dead run.
 */
export const RUN_ENDED_MESSAGE =
  "The room's run ended on the server before it finished. Nothing you have said is lost — the interview, its questions and its document are saved; press Finish again to start a fresh run over the same interview.";

/** The honest sentence for a start/finish stream that ended having said
 *  nothing terminal. */
export const SILENT_START_MESSAGE =
  "The server took the request but never said what happened. Nothing you have said is lost — the interview, its questions and its document are saved; try Finish again.";

/** What the inline start/resume NDJSON stream just told us, or null.
 *
 * Pure on purpose: this is the one place the room reads that wire, and the
 * room's whole "is it working or is it dead" answer hangs off it. */
export type InlineVerdict =
  | { kind: "run_started"; runId: string }
  /** The finish landed: the interview is closed and the documents are written
   *  (`failed` names any deliverable that did not land — never silence). */
  | { kind: "finished"; written: string[]; failed: Record<string, string> }
  | { kind: "failed"; message: string };

export function interpretInlineEvent(event: unknown): InlineVerdict | null {
  const wire = event as {
    event?: string;
    data?: {
      event?: string;
      run_id?: string;
      message?: string;
      user_message?: string;
      written?: unknown;
      failed?: unknown;
    };
  } | null;
  if (!wire || typeof wire !== "object") return null;
  const inner = wire.data;
  if (wire.event === "data") {
    if (
      (inner?.event === "interview_run_started" ||
        inner?.event === "workflow_run_started") &&
      typeof inner.run_id === "string" &&
      inner.run_id
    ) {
      return { kind: "run_started", runId: inner.run_id };
    }
    if (inner?.event === "interview_finished") {
      return {
        kind: "finished",
        written: Array.isArray(inner.written) ? inner.written.map(String) : [],
        failed:
          inner.failed && typeof inner.failed === "object"
            ? (inner.failed as Record<string, string>)
            : {},
      };
    }
    return null;
  }
  if (wire.event === "error") {
    const message =
      inner?.user_message?.trim() ||
      inner?.message?.trim() ||
      "The room could not start the run, and the server did not say why.";
    return { kind: "failed", message };
  }
  return null;
}

export function useInterviewRun(sessionId: string) {
  const dispatch = useAppDispatch();
  const runPhase = useAppSelector(selectRunPhase);
  const runId = useAppSelector(selectRunId);
  const pendingInterrupt = useAppSelector(selectPendingInterrupt);
  const session = useAppSelector(selectRoomSession);
  const hydrated = useAppSelector(selectRoomHydrated);
  // A second click while a call is in flight must not start a second run.
  const inFlightRef = useRef(false);
  // Did THIS start/resume stream tell us anything terminal — a run_id or an
  // error? A stream that ends having said neither is a silent failure, and the
  // room says so rather than spinning (see runStream's tail).
  const sawTerminalRef = useRef(false);
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
  const adoptedRef = useRef<{
    requestId: string;
    conversationId: string;
  } | null>(null);

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
              (typeof event.error_message === "string" &&
                event.error_message.trim()) ||
              RUN_ENDED_MESSAGE,
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

  /** Mint an activeRequests row WITHOUT an inline stream — the reload path.
   *  Same row shape adoptForeignStream creates; the SSE follower writes node
   *  streams into it exactly as on a live start. */
  const ensureAdopted = () => {
    if (adoptedRef.current) return adoptedRef.current;
    const ids = {
      requestId: generateRequestId(),
      conversationId: generateConversationId(),
    };
    dispatch(
      createRequest({
        requestId: ids.requestId,
        conversationId: ids.conversationId,
      }),
    );
    adoptedRef.current = ids;
    dispatch(streamAdopted({ sessionId, requestId: ids.requestId }));
    return ids;
  };

  // RELOAD-RESUME: a page load into a session with a live run must NOT show
  // a dead room with a "Start" button (that is how a user starts a duplicate
  // run against a workflow that is mid-round, or types into a composer that
  // can never send). The session row is truth: when it carries a run_id and
  // this hook knows nothing yet, follow that run's SSE feed — the durable
  // event replay (seq 0 → head) re-drives the whole choreography and lands
  // the room in the run's REAL current state (running / waiting_human /
  // complete / errored). Auto-resume is the floor, never a question.
  const reconciledRunRef = useRef<string | null>(null);
  const sessionRunId = session?.run_id ?? null;
  useEffect(() => {
    if (!hydrated || !sessionRunId) return;
    if (runPhase !== "idle") return;
    if (reconciledRunRef.current === sessionRunId) return;
    reconciledRunRef.current = sessionRunId;
    dispatch(runStarted({ runId: sessionRunId }));
    ensureAdopted();
    startFollowing(sessionRunId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startFollowing/ensureAdopted are render-scoped helpers over stable refs; the guard ref makes re-runs no-ops
  }, [hydrated, sessionRunId, runPhase, dispatch]);

  /**
   * Events on the inline NDJSON start/resume stream. It detaches almost
   * immediately — the load-bearing signals are the run_id (which arms the SSE
   * follower) and a `fatal_error` the server sends when the start task crashed
   * before a run ever existed.
   *
   * 🚨 THE ROOM MUST NEVER SIT ON "Working…" (wall W9, 2026-09-15). This
   * handler used to `return` on every non-`data` event, so the server's
   * `error` envelope — the ONE thing it sends when `start_session_run` raises
   * before `run_store.create` — was dropped on the floor. `callApi` resolves
   * happily (HTTP 200, stream consumed to its end), `runStream` reported the
   * request ACCEPTED, and the phase stayed `starting` forever: the Finish
   * dialog showed "Handing the interview to the room… Working…" for nine
   * minutes over a run that did not exist and never would. The server was
   * honest; the room deafened itself.
   */
  const handleInlineEvent = (event: TypedStreamEvent) => {
    const verdict = interpretInlineEvent(event);
    if (!verdict) return;
    if (verdict.kind === "failed") {
      sawTerminalRef.current = true;
      dispatch(runFailed({ message: verdict.message }));
      toastErrorAlreadyCaptured(verdict.message);
      return;
    }
    if (verdict.kind === "finished") {
      // The interview is closed and safe. A deliverable that did not land is
      // NAMED here — the room's own dialog offers "Write them again", and a
      // silent "not written yet" with no reason is the thing four cold walks
      // kept meeting.
      sawTerminalRef.current = true;
      dispatch(runCompleted());
      const missing = Object.keys(verdict.failed);
      if (missing.length > 0) {
        toast.error(
          `Your interview is closed and nothing is lost, but ${missing.length === 1 ? "one document" : `${missing.length} documents`} could not be written (${missing.join(", ")}). Open Finish again and choose "Write them again".`,
        );
      } else {
        toast.success("Your interview is closed — the documents are written.");
      }
      return;
    }
    sawTerminalRef.current = true;
    dispatch(runStarted({ runId: verdict.runId }));
    startFollowing(verdict.runId);
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
    sawTerminalRef.current = false;
    dispatch(runStarting());
    try {
      const result = await dispatch(call());
      const error = (result as { error?: { message?: string } }).error;
      if (error) {
        // callApi already captured and classified this returned error. The
        // toast is user guidance, not a second context-free queue incident.
        const message = isTransportFailure(error)
          ? "The server could not be reached — it may be restarting for an update. Wait a moment and try again; nothing you typed is lost."
          : error.message ?? "The interview run could not start.";
        dispatch(runFailed({ message }));
        toastErrorAlreadyCaptured(message);
        return false;
      }
      // THE BELT. The stream ended cleanly and said nothing terminal — no
      // run_id, no error. There is no run, so nothing will ever arrive on the
      // SSE feed and no phase change can come from anywhere else. Say so.
      if (!sawTerminalRef.current) {
        const message = SILENT_START_MESSAGE;
        dispatch(runFailed({ message }));
        toast.error(message);
        return false;
      }
      return true;
    } catch (err) {
      // A network-level failure (Safari's "Load failed") means the request
      // never got an answer — most often the server is mid-deploy for a
      // minute or two. Say THAT, not the browser's cryptic wording.
      const message = isTransportFailure(err)
        ? "The server could not be reached — it may be restarting for an update. Wait a moment and try again; nothing you typed is lost."
        : err instanceof Error
          ? err.message
          : "The interview run failed.";
      dispatch(runFailed({ message }));
      toast.error(message);
      return false;
    } finally {
      inFlightRef.current = false;
    }
  };

  /** Answer the pending human-input interrupt (and/or send controls).
   *  Returns true when the answer was accepted (draft may clear). */
  const resume = async (input: ResumeInput): Promise<boolean> => {
    if (!runId) {
      toast.error(
        "There is no active run to answer — start the interview first.",
      );
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
            ...(input.gotoStage ? { goto_stage: input.gotoStage } : {}),
            ...(input.done ? { done: true } : {}),
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

  /**
   * 🚨 A FINISH FINISHES — ONE PRESS, ONE REQUEST, AND NEVER A ROUND.
   *
   * FOUR cold walks of this room reported the same thing: the control
   * labelled Finish did not finish. The walk-3 fix round put both halves of
   * the old journey behind one press — arm the intent, START a run, spend the
   * arm when the run hands back — and proved it against a session that was
   * already parked on a human turn, where `finish` sends `done` into the
   * waiting run and the gate converges with no round at all. That proof could
   * not fail, and that is exactly why it missed the defect.
   *
   * A BRAND-NEW room has no run. In v3 the person's whole interview happens
   * in the per-role chat tabs (`POST /observe`), and the orchestrated
   * workflow is never started — so `finish` fell through to `start()`, and a
   * run's first act, by construction, is a complete interview round: six
   * voices speak, the Scribe opens new questions, the round counter climbs.
   * The fourth walk pressed Finish on a fresh session and watched Round 1
   * become Round 2 become Round 3, open questions go 9 → 15, and the
   * Requirements document never arrive.
   *
   * A terminal action may not depend on a machine being in one particular
   * state. Finishing is now ONE server operation that works from every phase
   * — idle, starting, running, waiting, complete, error, run or no run
   * (`POST /vision-interview/sessions/{id}/finish`, aidream
   * `services/vision_interview/finalize.py`). It cancels whatever run the
   * session is bound to, closes the interview, and writes the three
   * documents. There is no arm, no second journey, and no branch on phase —
   * the branch WAS the bug.
   *
   * Returns true when the finish landed. The documents arrive both in this
   * response and through the session row's realtime subscription.
   */
  const finish = async (): Promise<boolean> => {
    if (inFlightRef.current) return false;
    const consume = adopt();
    return runStream(() =>
      callApi({
        path: "/vision-interview/sessions/{session_id}/finish" as never,
        method: "POST",
        pathParams: { session_id: sessionId } as never,
        body: {} as never,
        stream: true,
        consumeStream: consume,
      }),
    );
  };

  // There is NO `start` any more, returned or private. Starting a run was the
  // only road the room had to `interview.finalize`, and a run's first act is a
  // full interview round — so the terminal control ran a round every time it
  // was pressed on a fresh session. Finishing has its own server operation
  // now, and the road that ran a round is gone rather than hidden. Closing a
  // class means removing the door.
  return { runPhase, runId, pendingInterrupt, resume, finish };
}
