/**
 * lib/api/resume-or-rejoin.ts
 *
 * The host wiring for `@ai-matrx/agents/matrx`'s `resumeOrRejoin` — the ONE
 * client behavior for picking a run back up: resume it, or, when the server
 * says it is still live (409 `run_in_progress`, or chat's `resume_conflict`
 * naming a live run), follow the body's `rejoin_path` into the same handler.
 * Every decision (rejoin_path, the no-journal fallbacks, the `request_id`
 * decoy) lives in the package; this module injects only the app transport and
 * the run's organization.
 */

import type { Action } from "redux";
import type { ThunkAction } from "redux-thunk";
import {
  openMatrxStream,
  rejoinRuntimeOperation,
  resumeOrRejoin,
  type MatrxLiveRunRejoin,
  type ResumeOrRejoinOutcome,
} from "@ai-matrx/agents/matrx";
import type { RootState } from "@/lib/redux/store";
import type { TypedStreamEvent } from "@ai-matrx/agents/generated/stream-events";
import { waitForAuthReady } from "@/lib/api/call-api";
import { createMatrxTransport } from "@/lib/api/matrx-transport";

type AppThunk<T> = ThunkAction<Promise<T>, RootState, unknown, Action>;

export interface ResumeOrRejoinArgs {
  /** Server-relative resume door, e.g. `/podcast/resume/{run_id}`. */
  path: string;
  /** Optional JSON body for the resume door. */
  body?: unknown;
  /** THE RUN's organization (its durable record) — never the session's selection. */
  organizationId?: string | null;
  signal?: AbortSignal;
  /** Every stream event, from the resume stream or the rejoined stream. */
  onEvent: (event: TypedStreamEvent) => void;
  /** A live run was detected — reset anything a replay from frame one would double. */
  onRejoin?: (rejoin: MatrxLiveRunRejoin) => void;
  /** Workflow run SSE events when a workflow leg has no stream journal. */
  onWorkflowEvent?: (event: Record<string, unknown>, seq: number | null) => void;
}

export function resumeOrRejoinThunk(
  args: ResumeOrRejoinArgs,
): AppThunk<ResumeOrRejoinOutcome> {
  return async (_dispatch, getState) => {
    await waitForAuthReady(getState);
    const transport = createMatrxTransport(getState, {
      ...(args.organizationId ? { organizationId: args.organizationId } : {}),
      // 409 is the server saying "rejoin, don't re-run" — an answer, not an incident.
      expectedErrorStatuses: [409],
      source: "resumeOrRejoin",
    });
    return resumeOrRejoin(
      transport,
      (t, options) =>
        openMatrxStream(t, args.path, {
          ...options,
          ...(args.body !== undefined ? { body: args.body } : {}),
        }),
      {
        ...(args.organizationId ? { organizationId: args.organizationId } : {}),
        ...(args.signal ? { signal: args.signal } : {}),
        // The package envelope IS the wire `{event, data}` the generated union describes.
        onEnvelope: (envelope) => args.onEvent(envelope as unknown as TypedStreamEvent),
        ...(args.onRejoin ? { onRejoin: args.onRejoin } : {}),
        ...(args.onWorkflowEvent ? { onWorkflowEvent: args.onWorkflowEvent } : {}),
      },
    );
  };
}

/**
 * Rejoin a run we started ourselves (we hold its `X-Request-ID`) after our own
 * stream dropped: `POST /runtime/operations/{id}/rejoin`, replay-then-follow.
 * Throws the package's `MatrxApiError` when replay is unavailable.
 */
export function rejoinOperationThunk(args: {
  requestId: string;
  organizationId?: string | null;
  signal?: AbortSignal;
  onEvent: (event: TypedStreamEvent) => void;
}): AppThunk<void> {
  return async (_dispatch, getState) => {
    await waitForAuthReady(getState);
    const transport = createMatrxTransport(getState, {
      ...(args.organizationId ? { organizationId: args.organizationId } : {}),
      expectedErrorStatuses: [409],
      source: "rejoinOperation",
    });
    const handle = await rejoinRuntimeOperation(transport, args.requestId, {
      ...(args.signal ? { signal: args.signal } : {}),
    });
    for await (const envelope of handle.events) {
      args.onEvent(envelope as unknown as TypedStreamEvent);
    }
  };
}
