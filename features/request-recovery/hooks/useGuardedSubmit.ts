/**
 * useGuardedSubmit — composer submission wrapper.
 *
 * Every user-authored submit in the app should go through this hook instead
 * of dispatching an action directly. It:
 *   1. Persists the user's payload + raw text to IndexedDB before the call fires.
 *   2. Runs the caller's async function inside `runTrackedRequest`, so the
 *      netRequests slice has a live record of the attempt.
 *   3. On success: deletes the recovery record.
 *   4. On failure: keeps the record, restores the input via `onRestoreInput`,
 *      shows a toast with a Retry button.
 *   5. On tab close mid-flight: the record stays as `in-flight` in IndexedDB
 *      and will be surfaced by the RequestRecoveryProvider on next load.
 */

"use client";

import { useCallback, useRef } from "react";
import { toast } from "@/lib/toast";
import { payloadSafetyStore } from "@/lib/persistence/payloadSafetyStore";
import type { PayloadKind } from "@/lib/persistence/payloadSafetyStore";
import { useAppDispatch } from "@/lib/redux/hooks";
import { runTrackedRequest } from "@/lib/redux/net/runTrackedRequest";
import type { NetRequestKind } from "@/lib/redux/net/netRequestsSlice";
import type { AppDispatch } from "@/lib/redux/store";

export interface GuardedSubmitContext {
  /** The request id tracked in the netRequests slice. */
  requestId: string;
  /** IndexedDB record id for payload safety store (if persistence was available). */
  recoveryId: string;
  dispatch: AppDispatch;
}

export interface UseGuardedSubmitArgs<T> {
  kind: PayloadKind & NetRequestKind;
  /** Short label shown in recovery + request registry ("Agent: Travel Helper"). */
  buildLabel: () => string;
  /** Route the Retry button in the recovery window should navigate back to. */
  buildRouteHref: () => string;
  /** The payload the server will receive. Opaque to the hook. */
  buildPayload: () => unknown;
  /** The raw text the user typed, to restore into the composer on failure. */
  buildRawInput?: () => string | undefined;
  /** The actual async work. `ctx.requestId` should flow into the underlying thunk so stream events can hit the same tracking id. */
  run: (ctx: GuardedSubmitContext) => Promise<T>;
  /** Called on error so the caller can put the user's text back into the composer. */
  onRestoreInput?: (rawInput: string | undefined) => void;
  /** Optional groupKey for the netRequests slice (e.g. conversationId). */
  buildGroupKey?: () => string | undefined;
}

export interface UseGuardedSubmitResult<T> {
  submit: () => Promise<T | null>;
  /** Retry the most recently failed submission (if any). */
  retry: () => Promise<T | null>;
}

function genRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `req_${crypto.randomUUID()}`;
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function useGuardedSubmit<T>(
  args: UseGuardedSubmitArgs<T>,
): UseGuardedSubmitResult<T> {
  const dispatch = useAppDispatch();
  const lastAttempt = useRef<{
    payload: unknown;
    rawInput: string | undefined;
  } | null>(null);

  const doSubmit = useCallback(async (): Promise<T | null> => {
    const label = args.buildLabel();
    const routeHref = args.buildRouteHref();
    const payload = args.buildPayload();
    const rawInput = args.buildRawInput?.();
    const groupKey = args.buildGroupKey?.();

    lastAttempt.current = { payload, rawInput };

    let recoveryId: string;
    try {
      recoveryId = await payloadSafetyStore.savePending({
        kind: args.kind,
        label,
        routeHref,
        payload,
        rawUserInput: rawInput,
      });
    } catch {
      // IndexedDB unavailable — still proceed, just without recovery coverage.
      recoveryId = genRequestId();
    }

    const requestId = genRequestId();

    try {
      return await runTrackedRequest(dispatch, {
        id: requestId,
        kind: args.kind,
        label,
        recoveryId,
        groupKey,
        run: () => args.run({ requestId, recoveryId, dispatch }),
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Submission failed";
      args.onRestoreInput?.(rawInput);
      toast.error("Couldn't send — your input is saved.", {
        description: message,
        duration: 10_000,
        action: {
          label: "Retry",
          onClick: () => {
            void doSubmit();
          },
        },
      });
      return null;
    }
  }, [dispatch, args]);

  const retry = useCallback(async (): Promise<T | null> => {
    if (!lastAttempt.current) return doSubmit();
    return doSubmit();
  }, [doSubmit]);

  return { submit: doSubmit, retry };
}
