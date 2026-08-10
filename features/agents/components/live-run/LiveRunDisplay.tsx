"use client";

/**
 * LiveRunDisplay — the ONE generic "watch this agent run, live" container.
 *
 * Binds a `conversationId` (preferred — from `useLiveAgentRun` /
 * `useHeadlessAgentJson`) or a bare `requestId` (adoptForeignStream consumers)
 * and renders the run's output through the canonical pipeline
 * (`MarkdownStream` → EnhancedChatMarkdown → BlockRenderer → kind registry).
 * It is deliberately thin: it consumes ONLY canonical selectors and the one
 * renderer — it parses nothing itself (`matrx/no-bespoke-stream-renderer`).
 *
 * Drop it inline under a button, inside a popover, or in a panel — anywhere a
 * spinner used to sit while AI worked. It shows: a moving status line (phase),
 * the streamed content as it arrives (markdown AND structured `__kind` JSON —
 * both route correctly), and the request's error when one lands.
 *
 * Renders nothing at all when there is no run to show (`conversationId` and
 * `requestId` both empty and `pending` false) — safe to mount unconditionally.
 */

import { useEffect, useRef } from "react";
import { Loader2, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import MarkdownStream from "@/components/MarkdownStream";
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

function phaseLabel(phase: StreamPhase | null, fallbackActive: boolean): string {
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

export interface LiveRunDisplayProps {
  /** Live handle from `useLiveAgentRun` / `useHeadlessAgentJson`. */
  conversationId?: string | null;
  /** Direct request handle (adoptForeignStream / pipeline consumers). */
  requestId?: string | null;
  /** What is running — shown in the status line (e.g. "Drafting brief"). */
  label?: string;
  /**
   * The run has been triggered but no conversation/request exists yet — keeps
   * the status line alive from the very first click (no dead moment).
   */
  pending?: boolean;
  /** Renders a dismiss (X) affordance; caller tears the run down. */
  onDismiss?: () => void;
  className?: string;
  /** Body scroll area classes — default caps height and scrolls. */
  bodyClassName?: string;
}

export function LiveRunDisplay({
  conversationId,
  requestId: requestIdProp,
  label,
  pending = false,
  onDismiss,
  className,
  bodyClassName,
}: LiveRunDisplayProps) {
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
  // Cheap monotonic tick per streamed chunk — drives follow-the-stream scroll.
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

  const bodyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!isActive) return;
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chunkCount, isActive]);

  const hasRun = Boolean(conversationId || requestId);
  if (!hasRun && !pending) return null;

  const errorMessage =
    requestError?.user_message ?? requestError?.message ?? null;
  const statusText = phaseLabel(streamPhase, isActive || pending);
  // The server phase line (e.g. "Reading research + drafting brief") beats the
  // generic client label when one is present.
  const serverPhase =
    requestPhase && requestPhase !== "connected" ? requestPhase : null;

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card text-card-foreground",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5 text-xs text-muted-foreground">
        {isActive || (pending && !requestId) ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        ) : errorMessage ? (
          <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-destructive" />
        ) : null}
        <span className="min-w-0 truncate font-medium">
          {label ?? "AI run"}
          {statusText || serverPhase ? (
            <span className="font-normal text-muted-foreground/80">
              {" — "}
              {serverPhase ?? statusText}
            </span>
          ) : null}
        </span>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss run output"
            className="ml-auto rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {errorMessage ? (
        <p className="px-2.5 py-2 text-xs text-destructive">{errorMessage}</p>
      ) : null}
      {requestId ? (
        <div
          ref={bodyRef}
          className={cn(
            "max-h-64 overflow-y-auto px-2.5 py-2 text-sm",
            bodyClassName,
          )}
        >
          <MarkdownStream
            requestId={requestId}
            isStreamActive={isActive}
            hideCopyButton
          />
        </div>
      ) : null}
    </div>
  );
}
