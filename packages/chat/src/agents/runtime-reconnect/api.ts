/**
 * Runtime reconnect transport — thin identity wiring over
 * `@ai-matrx/agents/matrx` (the 0.6.0 C22 retrofit).
 *
 * These calls are conversation-scoped, so they ride the SAME backend channel
 * resolution as the conversation's own stream (`resolveBackendForConversation`
 * — global / sandbox override / local engine / EC2-dedicated), injected here
 * as a static target. Everything that used to be hand-rolled in this module —
 * the fetch, SSE framing (all three separators; the CRLF incident of
 * 2026-07-09 is covered by construction in `stream/sse`), the stall timer,
 * the retry budget, and the `Last-Event-ID` cursor — is package policy now:
 * `getRuntimeOperationsByLink` + `followRuntimeOperationToEnd`, whose
 * defaults ARE this module's former production values (45s stall, 60 × 2s
 * reconnect budget reset by any parsed frame). What each event MEANS stays in
 * the thunk (`reconnect-server-operation.thunk.ts`).
 *
 * Parity notes: reconnect attempts stay quiet (no captureApiError sink — a
 * follower may retry for minutes across a deploy drain by design), and no
 * org header (org rides the conversation body only, like `runAiStream`).
 */

import {
  createMatrxTransport,
  followRuntimeOperationToEnd,
  getRuntimeOperationsByLink,
  type MatrxTransport,
} from "@ai-matrx/agents/matrx";
import type { ResolvedBackend } from "../redux/execution-system/thunks/resolve-base-url";
import type {
  RuntimeExecutionStatus,
  RuntimeOperationEvent,
  RuntimeOperationsByLinkResponse,
} from "./types";

/**
 * The package transport for one resolved backend channel. Quiet by design
 * (no diagnostics sinks — see the module doc); the package strips the
 * resolver's Content-Type and owns timeouts and wire headers.
 */
function transportFor(backend: ResolvedBackend): MatrxTransport {
  return createMatrxTransport({
    resolveTarget: () => ({
      baseUrl: backend.baseUrl,
      policyHeaders: backend.headers,
      channel: backend.channel,
    }),
    source: "runtime-reconnect",
  });
}

/**
 * `GET /runtime/operations/by-link/conversation/{conversationId}` — the
 * identify step. Returns `null` when the surface is absent or the caller owns
 * no operations for this conversation (404 — missing and unowned share one
 * shape by design); throws on other failures.
 */
export async function fetchOperationsByLink(
  backend: ResolvedBackend,
  conversationId: string,
  signal?: AbortSignal,
): Promise<RuntimeOperationsByLinkResponse | null> {
  // The package's typed MatrxApiError propagates as-is (status/code/
  // serverDetail intact) — re-wrapping it into a generic Error is the
  // catch-and-reinterpret pattern C22 bans in host wiring.
  return getRuntimeOperationsByLink(
    transportFor(backend),
    "conversation",
    conversationId,
    { limit: 5, ...(signal ? { signal } : {}) },
  );
}

export interface FollowOperationResult {
  /** True when the server sent the terminal `end` frame. */
  ended: boolean;
  /** The root status carried on the `end` frame (when `ended`). */
  status: RuntimeExecutionStatus | null;
}

export interface FollowOperationOptions {
  backend: ResolvedBackend;
  executionId: string;
  /** Resume cursor — the operation view's `last_event_seq` (0 = from start). */
  lastEventSeq: number;
  /** Caller teardown — aborting resolves the promise with `ended: false`. */
  signal: AbortSignal;
  /** Fired per durable spine event (lifecycle transitions + notes). */
  onEvent: (event: RuntimeOperationEvent, seq: number | null) => void;
}

/**
 * `GET /runtime/executions/{id}/events/stream` — SSE replay-then-follow with
 * bounded reconnects, via the package's `followRuntimeOperationToEnd`
 * (production defaults). Resolves `{ended: true, status}` on the server's
 * `end` frame (the operation settled); `{ended: false}` when the caller
 * aborted or every reconnect attempt failed. A WAITING_INPUT park keeps the
 * stream open by design — a resume re-attaches to the same execution and its
 * events continue arriving here on the same cursor.
 */
export async function followOperationStream(
  opts: FollowOperationOptions,
): Promise<FollowOperationResult> {
  const result = await followRuntimeOperationToEnd(
    transportFor(opts.backend),
    opts.executionId,
    {
      lastEventSeq: opts.lastEventSeq,
      signal: opts.signal,
      onEvent: (event, seq) => opts.onEvent(event, seq),
    },
  );
  return { ended: result.ended, status: result.status };
}
