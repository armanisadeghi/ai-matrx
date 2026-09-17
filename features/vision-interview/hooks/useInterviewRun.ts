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
import { appendVisionStatement } from "../service";
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

/** The honest sentence for a start stream that ended having said nothing. */
export const SILENT_START_MESSAGE =
  "The room never started — the server took the request but no run came back. Nothing you have said is lost; try Finish again.";

/** What the inline start/resume NDJSON stream just told us, or null.
 *
 * Pure on purpose: this is the one place the room reads that wire, and the
 * room's whole "is it working or is it dead" answer hangs off it. */
export type InlineVerdict =
  | { kind: "run_started"; runId: string }
  | { kind: "failed"; message: string };

export function interpretInlineEvent(event: unknown): InlineVerdict | null {
  const wire = event as {
    event?: string;
    data?: {
      event?: string;
      run_id?: string;
      message?: string;
      user_message?: string;
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
          isTransportFailure(err)
            ? "Could not reach the database — check your connection and try again. Your draft is still here."
            : err instanceof Error
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
   * 🚨 A FINISH IS ONE PRESS, AND IT NEVER ASKS ANOTHER QUESTION.
   *
   * Three cold walks of this room reported the same thing: the control
   * labelled Finish did not finish. The reason was that finishing was really
   * TWO server journeys wearing one button — start a run, then tell the
   * waiting run it is done — and the dialog made the person perform both,
   * under two different labels ("Finish the interview", then "Write the
   * documents"), with a live interview round running between them. The
   * third walk pressed it twice, watched the round counter climb and the
   * open-question count go from five to eight, and never received a document.
   *
   * Both halves of that journey belong behind one press. The intent is armed
   * here and spent the instant the run hands back, so the machinery stays
   * machinery: the person says finish once, and the next thing they see is
   * their documents.
   *
   * Returns true when the finish is under way (not when it has completed —
   * the documents arrive through the session row's realtime subscription).
   */
  const finishArmedRef = useRef(false);
  const finish = async (): Promise<boolean> => {
    if (runPhase === "waiting_human" && pendingInterrupt?.checkpointId) {
      finishArmedRef.current = false;
      return resume({ message: "", done: true });
    }
    // Nothing is waiting, so the finish run does not exist yet. Arm the
    // intent and start it; the effect below spends the arm the moment the
    // run interrupts.
    finishArmedRef.current = true;
    const started = await start();
    if (!started) finishArmedRef.current = false;
    return started;
  };

  useEffect(() => {
    if (!finishArmedRef.current) return;
    // A run that died on the way never gets a done sent into the void — the
    // arm is dropped and the dialog's error state is what the person sees.
    if (runPhase === "error" || runPhase === "complete") {
      finishArmedRef.current = false;
      return;
    }
    if (runPhase !== "waiting_human") return;
    if (!pendingInterrupt?.checkpointId) return;
    // Spent BEFORE the await: this effect can re-run while the resume is in
    // flight, and a second done would be a second finish.
    finishArmedRef.current = false;
    void resume({ message: "", done: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `resume` is a render-scoped helper over stable refs; the arm ref, not the dependency list, is what makes this fire exactly once
  }, [runPhase, pendingInterrupt?.checkpointId]);

  return { runPhase, runId, pendingInterrupt, start, resume, finish };
}
