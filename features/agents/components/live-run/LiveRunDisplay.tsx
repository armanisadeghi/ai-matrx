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

import { useEffect, useId, useRef } from "react";
import { Loader2, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import MarkdownStream from "@/components/MarkdownStream";
import {
  releaseRequestForViewer,
  retainRequestForViewer,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
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
  /** Human phase line — server phase wins over the generic client label. */
  statusText: string | null;
  errorMessage: string | null;
  /** Monotonic per-chunk tick — drives follow-the-stream scroll. */
  chunkCount: number;
}

/**
 * The run's status, with no chrome attached.
 *
 * 🚨 THIS EXISTS SO A HOST FRAME CAN OWN THE STATUS LINE. `LiveRunWindow`
 * already draws a title bar; if `LiveRunDisplay` also drew one, the user would
 * read the same words twice inside two nested borders. The window consumes
 * this hook, folds the phase into its own title, and renders the display bare.
 * Never add a second status bar — put the phase where the frame already is.
 */
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
  /**
   * `card` (default) — draws its own border, background, and status bar. For
   * dropping inline into a page that has no frame of its own.
   *
   * `bare` — draws NOTHING but the content. Use inside a host that already IS
   * the frame (`LiveRunWindow`): a bordered card inside a bordered window is
   * the nested-chrome defect — two borders, two backgrounds, two status lines,
   * and a band of dead padding between them. The host owns the status via
   * `useLiveRunStatus`.
   */
  variant?: "card" | "bare";
}

export function LiveRunDisplay({
  conversationId,
  requestId: requestIdProp,
  label,
  pending = false,
  onDismiss,
  className,
  bodyClassName,
  variant = "card",
}: LiveRunDisplayProps) {
  const dispatch = useAppDispatch();
  const viewerId = `live-run-display:${useId()}`;
  const { requestId, isActive, statusText, errorMessage, chunkCount } =
    useLiveRunStatus(conversationId, requestIdProp, pending);

  // A floating window deliberately survives the route component that launched
  // it. Retain the canonical request row for exactly as long as this viewer is
  // mounted, so launcher cleanup during a query-driven remount cannot blank
  // the output. The last viewer release completes any deferred owner cleanup.
  useEffect(() => {
    if (!requestId) return;
    dispatch(retainRequestForViewer({ requestId, viewerId }));
    return () => {
      dispatch(releaseRequestForViewer({ requestId, viewerId }));
    };
  }, [dispatch, requestId, viewerId]);

  const bodyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!isActive) return;
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chunkCount, isActive]);

  const hasRun = Boolean(conversationId || requestId);
  if (!hasRun && !pending) return null;

  // BARE: the host frame is the chrome. Content only — no border, no
  // background, no status bar, no padding. Anything added here reappears as a
  // second box inside the window.
  if (variant === "bare") {
    return (
      <div className={cn("h-full min-h-0", className)}>
        {errorMessage ? (
          <p className="pb-2 text-xs text-destructive">{errorMessage}</p>
        ) : null}
        {requestId ? (
          <div
            ref={bodyRef}
            className={cn("h-full min-h-0 overflow-y-auto", bodyClassName)}
          >
            <MarkdownStream
              requestId={requestId}
              // Load-bearing, not decoration: BlockRenderer keys the
              // `hideReasoning` / `hideToolResults` display flags off the
              // CONVERSATION. Without it every live-run window rendered the
              // model's private chain-of-thought even though the headless
              // runner explicitly sets `hideReasoning` (run-headless-agent-json
              // `showReasoning !== true`). Threaded only — it never switches
              // the renderer's mode (that needs turnId/messageId).
              conversationId={conversationId ?? undefined}
              isStreamActive={isActive}
              hideCopyButton
            />
          </div>
        ) : null}
      </div>
    );
  }

  const serverPhase = statusText;

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
          {serverPhase ? (
            <span className="font-normal text-muted-foreground/80">
              {" — "}
              {serverPhase}
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
            // Same reason as the bare variant above: the display flags are
            // conversation-keyed.
            conversationId={conversationId ?? undefined}
            isStreamActive={isActive}
            hideCopyButton
          />
        </div>
      ) : null}
    </div>
  );
}
