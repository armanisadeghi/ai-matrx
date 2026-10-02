"use client";

import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectCurrentPhase,
  selectRequestError,
  selectRequestStatus,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import {
  selectLatestRequestId,
  selectStreamPhase,
  type StreamPhase,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import type { RequestStatus } from "@/features/agents/types/request.types";

const ACTIVE_STREAM_PHASES: ReadonlySet<StreamPhase> = new Set([
  "connecting",
  "pre_token",
  "reasoning",
  "text_streaming",
  "interstitial",
]);

const ACTIVE_REQUEST_STATUSES = new Set([
  "pending",
  "connecting",
  "streaming",
  "awaiting-tools",
]);

function phaseLabel(
  phase: StreamPhase | null,
  fallbackActive: boolean,
): string {
  switch (phase) {
    case "connecting":
      return "Connecting…";
    case "pre_token":
      return "Waiting for the first words…";
    case "reasoning":
      return "Thinking…";
    case "text_streaming":
      return "Writing…";
    case "interstitial":
      return "Working…";
    case "complete":
      return "Done";
    case "error":
      return "Failed";
    default:
      return fallbackActive ? "Starting…" : "";
  }
}

export interface LiveRunStatus {
  requestId: string | null;
  isActive: boolean;
  statusText: string | null;
  errorMessage: string | null;
  chunkCount: number;
}

export function resolveLiveRunStatusText({
  streamPhase,
  requestStatus,
  requestPhase,
  isActive,
  pending,
}: {
  streamPhase: StreamPhase | null;
  requestStatus: RequestStatus | undefined;
  requestPhase: string | null;
  isActive: boolean;
  pending: boolean;
}): string | null {
  if (!isActive) {
    const terminalPhase = phaseLabel(streamPhase, false);
    if (terminalPhase) return terminalPhase;
    switch (requestStatus) {
      case "complete":
        return "Done";
      case "error":
        return "Failed";
      case "timeout":
        return "Timed out";
      case "cancelled":
        return "Cancelled";
      default:
        return pending ? "Starting…" : null;
    }
  }

  const serverPhase =
    requestPhase && requestPhase !== "connected" ? requestPhase : null;
  return serverPhase ?? phaseLabel(streamPhase, true) ?? "Starting…";
}

/** Lightweight status selector shared by full displays and shell tray previews. */
export function useLiveRunStatus(
  conversationId?: string | null,
  requestIdProp?: string | null,
  pending = false,
): LiveRunStatus {
  const derivedRequestId = useAppSelector((state) =>
    conversationId ? selectLatestRequestId(conversationId)(state) : undefined,
  );
  const requestId = requestIdProp ?? derivedRequestId ?? null;

  const streamPhase = useAppSelector((state) =>
    conversationId ? selectStreamPhase(conversationId)(state) : null,
  );
  const requestStatus = useAppSelector((state) =>
    requestId ? selectRequestStatus(requestId)(state) : undefined,
  );
  const requestPhase = useAppSelector((state) =>
    requestId ? selectCurrentPhase(requestId)(state) : null,
  );
  const requestError = useAppSelector((state) =>
    requestId ? selectRequestError(requestId)(state) : undefined,
  );
  const chunkCount = useAppSelector((state) =>
    requestId
      ? (state.activeRequests.byRequestId[requestId]?.chunkCount ?? 0)
      : 0,
  );

  const isActive =
    (streamPhase !== null && ACTIVE_STREAM_PHASES.has(streamPhase)) ||
    (streamPhase === null &&
      requestStatus !== undefined &&
      ACTIVE_REQUEST_STATUSES.has(requestStatus)) ||
    (pending && !requestId && streamPhase === null);

  return {
    requestId,
    isActive,
    statusText: resolveLiveRunStatusText({
      streamPhase,
      requestStatus,
      requestPhase,
      isActive,
      pending,
    }),
    errorMessage: requestError?.user_message ?? requestError?.message ?? null,
    chunkCount,
  };
}
