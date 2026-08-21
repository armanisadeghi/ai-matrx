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

  const serverPhase =
    requestPhase && requestPhase !== "connected" ? requestPhase : null;

  return {
    requestId,
    isActive,
    statusText:
      serverPhase ?? phaseLabel(streamPhase, isActive || pending) ?? null,
    errorMessage: requestError?.user_message ?? requestError?.message ?? null,
    chunkCount,
  };
}
