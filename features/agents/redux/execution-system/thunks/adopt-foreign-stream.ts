/**
 * adoptForeignStream — the ONE way a non-chat surface renders a live agent
 * stream canonically.
 *
 * ## Why this exists
 *
 * `selectKindEnvelope(requestId)` — and every other canonical read of streamed
 * content-IR — is backed by `state.activeRequests.byRequestId[requestId]`.
 * That slice was fillable from exactly one place: `executeInstance` →
 * `runAiStream` → `processStream`. So any surface whose agent run is
 * orchestrated SERVER-SIDE inside a pipeline endpoint (a durable, resumable
 * job that also persists artifacts, ingests, and refreshes providers — e.g.
 * `POST /seo/keywords/research`) was structurally locked out of the canonical
 * renderer. Its only two options were "render nothing live" or "hand-roll a
 * parser", and hand-rolling is the banned kiss-of-death
 * (`features/content-ir/FEATURE.md` § No bespoke stream renderers).
 *
 * That gap is what produced the one violation the platform has. This module
 * closes it: a pipeline stream is ADOPTED into `activeRequests` exactly as a
 * chat stream is, so the identical pipeline
 * (`StreamBlockAccumulator` → `metadata.__ir` → `applyIrKindRoute` → the kind
 * component) runs over it with zero surface-side parsing.
 *
 * ## What this is NOT
 *
 * It is not a second execution system. It creates NO instance, NO conversation
 * history, NO turn commit, and sends NO request — the caller's endpoint owns
 * the run. It adopts a stream someone else started. If your surface can
 * launch through the execution system (a shortcut, `launchAgentExecution`),
 * use that instead: this is only for runs the SERVER orchestrates.
 *
 * ## Usage
 *
 * ```ts
 * const consumeStream = dispatch(
 *   adoptForeignStream({
 *     onAdopted: ({ requestId }) => setRequestId(requestId),
 *     onEvent: (event) => handleMyDomainEvents(event),
 *   }),
 * );
 * await dispatch(callApi({ path: "/seo/keywords/research", stream: true, body, consumeStream }));
 * ```
 *
 * Then render with the canonical components off `requestId` —
 * `selectRenderBlocksInOrder`, `selectKindEnvelope`, `selectAnswerText`.
 * Never a parse session, never a hand-picked component.
 */

import type { AppThunk } from "@/lib/redux/store";
import type { TypedStreamEvent } from "@/types/python-generated/stream-events";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

import {
  createRequest,
  setRequestStatus,
} from "../active-requests/active-requests.slice";
import { generateConversationId, generateRequestId } from "../utils/ids";
import { processStream, type JsonExtractionConfig } from "./process-stream";

/** Ids the adopted stream landed under. Stable for the life of the stream. */
export interface AdoptedStreamIds {
  requestId: string;
  conversationId: string;
}

export interface AdoptForeignStreamOptions {
  /**
   * Fires the INSTANT the ids are known — before a single event is processed.
   * This is how a surface subscribes to the stream it is about to receive.
   * Awaiting the `callApi` dispatch instead means the UI sits dead for the
   * whole run (the same trap `onConversationCreated` exists to avoid on the
   * direct-shortcut path).
   */
  onAdopted?: (ids: AdoptedStreamIds) => void;
  /**
   * Every event, before domain processing — for the caller's OWN typed
   * progress events (`seo.*`, stage labels, durable run ids). Never for
   * content: content renders from `activeRequests`. Must not throw.
   */
  onEvent?: (event: TypedStreamEvent) => void;
  /**
   * Prefer the server's `X-Request-ID` / `X-Conversation-ID` headers when the
   * endpoint sends them, so client state and server observability share one
   * identity. Default true. Set false to force client-minted ids (e.g. an
   * endpoint whose header ids belong to the PIPELINE, not the agent run, and
   * would collide with another adopted stream).
   */
  preferServerIds?: boolean;
  /** Structured-output extraction, when the caller reads `selectFirstExtractedObject`. */
  jsonExtraction?: JsonExtractionConfig;
  /**
   * The AbortController whose `signal` the CALLER also handed to `callApi`.
   *
   * This must be the fetch's own controller. `monitorStream` aborts it on a
   * heartbeat / lifetime timeout, and if it is not wired to the fetch the
   * response body stays open — the server keeps writing to a reader nobody
   * drains, for the life of the tab, while the UI already says the connection
   * was lost. Omit it to run without the watchdog (no timeout, no leak);
   * passing a controller that is NOT the fetch's is the one genuinely broken
   * combination, so there is no default.
   */
  abortController?: AbortController;
  /** Max ms between events before the stream is declared dead. Default 60s. */
  heartbeatTimeoutMs?: number;
  /** Max total stream lifetime. Default 30 min — pipelines are long. */
  maxLifetimeMs?: number;
}

/**
 * The consumer shape `callApi`'s `consumeStream` option expects. Kept
 * structural (no import from `lib/api`) so the layering stays one-directional.
 */
export type ForeignStreamConsumer = (
  response: Response,
  ids: { requestId: string | null; conversationId: string | null },
) => Promise<void>;

export function adoptForeignStream(
  options: AdoptForeignStreamOptions = {},
): AppThunk<ForeignStreamConsumer> {
  const {
    onAdopted,
    onEvent,
    preferServerIds = true,
    jsonExtraction,
    abortController,
    heartbeatTimeoutMs = 60_000,
    maxLifetimeMs = 30 * 60_000,
  } = options;

  return (dispatch, getState) => {
    return async (response, serverIds) => {
      const requestId =
        (preferServerIds ? serverIds.requestId : null) ?? generateRequestId();
      const conversationId =
        (preferServerIds ? serverIds.conversationId : null) ??
        generateConversationId();

      dispatch(createRequest({ requestId, conversationId }));
      // Before ANY event is processed — the surface must be subscribed by the
      // time the first chunk lands.
      onAdopted?.({ requestId, conversationId });

      try {
        await processStream({
          requestId,
          conversationId,
          response,
          submitAt: Date.now(),
          conversationIdAt: null,
          dispatch,
          getState,
          jsonExtraction,
          onEvent: onEvent as ((event: unknown) => void) | undefined,
          // Only arm the watchdog when the caller gave us the FETCH's own
          // controller — `monitorStream` only takes effect when a controller is
          // present, and an unwired one turns a timeout into a leaked body.
          abortController,
          heartbeatTimeoutMs,
          maxLifetimeMs,
          // An adopted stream has no chat transcript to commit — see the flag's
          // docs in process-stream.ts.
          skipTranscriptCommit: true,
          // The adopted stream's wire conversation_id belongs to the server's
          // pipeline run, not to any local Redux conversation. Pin every
          // dispatch to the id we adopted under, and skip the drift assert —
          // divergence here is expected, not a bug (same rationale as the
          // Agent Builder's manual path).
          forceLocalConversationId: true,
        });
      } catch (error) {
        // processStream throwing means the stream died (heartbeat timeout,
        // network drop, abort). The request row must not be left "pending"
        // forever — a silent stuck stream is the failure mode this platform
        // treats as a defect.
        const message =
          error instanceof Error ? error.message : "Adopted stream failed.";
        dispatch(
          setRequestStatus({
            requestId,
            status: "error",
            error: {
              error_type: "adopted_stream_failed",
              message,
              user_message:
                "The connection to this run was lost. The work is still running on the server — reload to rejoin it.",
            },
          }),
        );
        captureError({
          source: "agent-stream-client-error",
          message: `[adopt-foreign-stream] adopted stream ${requestId} failed: ${message}`,
          raw: { requestId, conversationId, error },
        });
        throw error;
      }

      // A clean end with no terminal status recorded (a pipeline endpoint that
      // never emits `end`) would leave the row streaming forever. Close it.
      const row = getState().activeRequests.byRequestId[requestId];
      if (row && row.status !== "complete" && row.status !== "error") {
        dispatch(setRequestStatus({ requestId, status: "complete" }));
      }
    };
  };
}
