// features/vision-interview/hooks/useInterviewRun.ts
//
// The Vision Interview room's connection to the workflow run on aidream:
//   start  → POST /vision-interview/sessions/{id}/start   (NDJSON stream)
//   resume → POST /runs/{run_id}/resume                   (NDJSON stream)
//
// Both streams are ADOPTED into the canonical execution system via
// adoptForeignStream (never hand-parsed — CLAUDE.md § never hand-render a
// stream). This hook's onEvent only tracks CHOREOGRAPHY (which node/role is
// speaking, interrupts) into the vision-interview slice; content lands as
// interview.turn rows via Supabase realtime, not from the stream.
//
// PATH TYPING NOTE: `/vision-interview/...` is not yet in the generated
// api-types (backend built in parallel; `pnpm sync-types` cannot run in this
// container) — those paths are cast `as never`, the same precedent as
// features/legal/wc/pd-ratings/api/hooks.ts. `/runs/{run_id}/resume` IS
// generated and stays fully typed.

import { useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { callApi } from "@/lib/api/call-api";
import { adoptForeignStream } from "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream";
import type { TypedStreamEvent } from "@/types/python-generated/stream-events";
import { toast } from "@/lib/toast";
import { roleFromNodeId, type RoleKey } from "../types";
import {
  nodeCompleted,
  nodeStarted,
  runCompleted,
  runFailed,
  runInterrupted,
  runStarted,
  runStarting,
  selectPendingInterrupt,
  selectRunId,
  selectRunPhase,
  streamAdopted,
} from "../redux/vision-interview.slice";

/**
 * Workflow-run wire events (run_started / node_started / node_completed /
 * run_interrupted / run_completed / run_error). These are workflow-engine
 * events, not part of the generated TypedStreamEvent union yet, so they are
 * read structurally from the parsed NDJSON objects.
 */
interface WorkflowWireEvent {
  event?: string;
  data?: {
    run_id?: string;
    node_id?: string;
    checkpoint_id?: string;
    message?: string;
    payload?: {
      checkpoint_id?: string;
      prompt?: string;
      question?: string;
      message?: string;
    };
  };
}

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

  const handleWorkflowEvent = (event: TypedStreamEvent) => {
    const wire = event as unknown as WorkflowWireEvent;
    switch (wire.event) {
      case "run_started":
        dispatch(runStarted({ runId: wire.data?.run_id ?? null }));
        break;
      case "node_started": {
        const role = roleFromNodeId(wire.data?.node_id);
        if (role) dispatch(nodeStarted({ role }));
        break;
      }
      case "node_completed": {
        const role = roleFromNodeId(wire.data?.node_id);
        if (role) dispatch(nodeCompleted({ role }));
        break;
      }
      case "run_interrupted": {
        const checkpointId =
          wire.data?.checkpoint_id ?? wire.data?.payload?.checkpoint_id ?? "";
        dispatch(
          runInterrupted({
            checkpointId,
            prompt:
              wire.data?.payload?.prompt ??
              wire.data?.payload?.question ??
              wire.data?.payload?.message ??
              null,
          }),
        );
        break;
      }
      case "run_completed":
        dispatch(runCompleted());
        break;
      case "run_error":
      case "run_failed":
        dispatch(
          runFailed({
            message: wire.data?.message ?? "The interview run failed.",
          }),
        );
        break;
      default:
        // node_stream token chunks and every other event are the execution
        // system's business — adoptForeignStream already routed them into
        // activeRequests. Nothing to do here.
        break;
    }
  };

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
    const consume = dispatch(
      adoptForeignStream({
        onAdopted: ({ requestId }) =>
          dispatch(streamAdopted({ sessionId, requestId })),
        onEvent: handleWorkflowEvent,
      }),
    );
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
    const consume = dispatch(
      adoptForeignStream({
        onAdopted: ({ requestId }) =>
          dispatch(streamAdopted({ sessionId, requestId })),
        onEvent: handleWorkflowEvent,
      }),
    );
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
  };

  return { runPhase, runId, pendingInterrupt, start, resume };
}
