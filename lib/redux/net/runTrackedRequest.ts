/**
 * runTrackedRequest — single entry point for any outbound network call that
 * should be visible to the UI / recovery system.
 *
 * Wraps the caller's async function with:
 *   - netRequests slice lifecycle (startRequest → setPhase → finishRequest)
 *   - netHealth slice outcome tallying
 *   - payloadSafetyStore lifecycle (markInFlight → markSuccess/markFailed)
 *   - structured error normalization via toNetError
 *
 * Returns whatever the inner function returns. On error, rethrows the
 * (normalized) NetError so the caller can continue its own error handling.
 */

import type { AppDispatch } from "@/lib/redux/store";
import {
  finishRequest,
  setPhase,
  startRequest,
  beatHeartbeat,
  type NetRequestKind,
  type NetRequestPhase,
} from "./netRequestsSlice";
import { recordOutcome } from "./netHealthSlice";
import { payloadSafetyStore } from "@/lib/persistence/payloadSafetyStore";
import { isNetError, toNetError } from "@ai-matrx/data/net";

export interface TrackedRequestContext {
  id: string;
  setPhase: (phase: NetRequestPhase) => void;
  heartbeat: () => void;
}

export interface RunTrackedRequestArgs<T> {
  id: string;
  kind: NetRequestKind;
  label: string;
  recoveryId?: string;
  groupKey?: string;
  run: (ctx: TrackedRequestContext) => Promise<T>;
}

export async function runTrackedRequest<T>(
  dispatch: AppDispatch,
  args: RunTrackedRequestArgs<T>,
): Promise<T> {
  const { id, kind, label, recoveryId, groupKey, run } = args;

  dispatch(
    startRequest({
      id,
      kind,
      label,
      recoveryId,
      groupKey,
    }),
  );

  if (recoveryId) {
    void payloadSafetyStore.markInFlight(recoveryId).catch(() => {});
  }

  const ctx: TrackedRequestContext = {
    id,
    setPhase: (phase) => dispatch(setPhase({ id, phase })),
    heartbeat: () => dispatch(beatHeartbeat(id)),
  };

  try {
    const result = await run(ctx);

    dispatch(finishRequest({ id, phase: "completed" }));
    dispatch(recordOutcome({ ok: true }));
    if (recoveryId) {
      void payloadSafetyStore.markSuccess(recoveryId).catch(() => {});
    }
    return result;
  } catch (err) {
    const netErr = toNetError(err);
    const phase: NetRequestPhase =
      netErr.code === "connect-timeout" ||
      netErr.code === "total-timeout" ||
      netErr.code === "heartbeat-timeout"
        ? "timed-out"
        : netErr.code === "aborted"
          ? "cancelled"
          : "error";

    dispatch(
      finishRequest({
        id,
        phase,
        errorCode: netErr.code,
        errorMessage: netErr.message,
        retryable: netErr.retryable,
      }),
    );
    dispatch(
      recordOutcome({
        ok: false,
        serverError: netErr.code === "http" && (netErr.status ?? 0) >= 500,
      }),
    );
    if (recoveryId) {
      void payloadSafetyStore
        .markFailed(recoveryId, netErr.message)
        .catch(() => {});
    }

    // Rethrow the normalized error so callers can branch on .code if needed.
    if (isNetError(err)) throw err;
    throw netErr;
  }
}
