/**
 * followWorkflowRunStream — live per-node tokens for an ADOPTED workflow run.
 *
 * ## Why this exists (verified wire truth, 2026-08-16)
 *
 * A workflow run's inline NDJSON response DETACHES immediately by design
 * (`workflow_run_started` → `workflow_run_detached` → `end` — see aidream
 * `run_workflow_task`): the scheduler survives client disconnect, so the
 * inline stream carries NO tokens and NO node lifecycle. The live wire is the
 * run's SSE events feed — `GET /runs/{run_id}/events/stream` — which carries
 * BOTH the durable lifecycle events (`node_started`, `node_completed`,
 * `run_interrupted`, …; SSE `id:` = the gap-proof per-run seq) and the
 * EPHEMERAL typed `node_stream` frames (per-node token deltas with `kind`
 * chunk|reasoning|phase|tool|…, ordered by per-node `stream_seq`; no SSE id,
 * so the reconnect cursor stays pinned to the durable seq stream).
 *
 * This thunk is the canonical consumer: it follows the feed with bounded
 * reconnects (Last-Event-ID replay), routes `node_stream` frames into
 * `activeRequests.nodeStreams` (appendWorkflowNodeStream — the per-node twin
 * of the collab child-stream pattern), settles node entries on
 * `node_completed` / `node_failed`, and forwards EVERY lifecycle event to the
 * caller's `onEvent` for domain choreography. Surfaces render off the
 * canonical selectors (`selectWorkflowNodeStreams`) — never by parsing this
 * feed themselves.
 *
 * Pair with `adoptForeignStream`: adopt the start/resume NDJSON stream to get
 * a requestId, then follow the run's SSE feed into that same request row.
 *
 * SSE mechanics mirror `features/agents/runtime-reconnect/api.ts`: fetch-based
 * (EventSource cannot set the Authorization header), framing via
 * `@ai-matrx/agents/stream/sse` (all three frame separators handled by
 * construction — sse-starlette emits CRLF), stall detector above the server's
 * 15s ping cadence.
 */

import { readMatrxSseStream } from "@ai-matrx/agents/stream/sse";
import type { AppThunk } from "@/lib/redux/store";
import {
  appendWorkflowNodeStream,
  settleWorkflowNodeStream,
} from "../active-requests/active-requests.slice";
import { resolveBackendForConversation } from "./resolve-base-url";

const STALL_TIMEOUT_MS = 45_000;
const RECONNECT_LIMIT = 10;
const RECONNECT_DELAY_MS = 2_000;

/**
 * A workflow-run wire event as it arrives on the SSE feed — the FLAT typed
 * payload (`matrx_graph.types.events` + aidream's `NodeStreamEvent`), not the
 * NDJSON `{event, data}` envelope. Structural: these events are not in the
 * generated TypedStreamEvent union (they ride a different wire).
 */
export interface WorkflowRunWireEvent {
  event: string;
  run_id?: string;
  node_id?: string | null;
  checkpoint_id?: string;
  payload?: Record<string, unknown>;
  message?: string;
  error_message?: string;
  // node_stream frames
  kind?: string;
  delta?: string;
  stream_seq?: number;
  [key: string]: unknown;
}

/** Events that END the SSE follow loop. Exported for the regression test —
 *  omitting one (run_errored was missing) leaves the follower reconnecting
 *  forever after the run has already died. */
export const TERMINAL_RUN_EVENTS = new Set([
  "run_completed",
  "run_failed",
  "run_errored",
  "run_cancelled",
]);

/**
 * 🚨 THE ROW IS THE TRUTH; THE FEED IS ONLY A DELIVERY.
 *
 * A run's terminal STATUS and its terminal EVENT are written by two different
 * places: `run_store.apply_status` flips `workflow.run.status` to
 * completed/failed/errored/cancelled, and the scheduler separately emits the
 * matching `run_*` event onto the durable feed. Every path that ends a run
 * OUTSIDE the scheduler's own emit — a lease/recovery sweep, `force-fail`, a
 * worker killed between the two writes — therefore leaves a row that is dead
 * and a feed that never says so. A client that believes only the feed then
 * spins forever over a run that ended minutes ago: that is wall W9's second
 * half in the Vision Interview room ("Handing the interview to the room…
 * Working…" over a run the server had already given up on).
 *
 * So this follower reconciles at EVERY boundary — a clean `end`, a dropped
 * socket, a stall, and reconnects exhausted: it reads the run row and, when
 * the row is already terminal, delivers the terminal event the feed owed. One
 * read, one poll, and the screen tells the truth.
 */
export const TERMINAL_ROW_STATUS_EVENTS: Readonly<Record<string, string>> = {
  completed: "run_completed",
  failed: "run_failed",
  errored: "run_errored",
  cancelled: "run_cancelled",
};

/** Said when a run row is terminal but carries no sentence of its own. It
 *  names the remedy, because a dead run with no next step is still a dead end. */
export const RUN_ROW_TERMINAL_FALLBACK_MESSAGE =
  "The run ended on the server without sending a finish signal. Nothing that already landed is lost — start it again.";

/** The fields of `GET /runs/{run_id}` (RunRecord) this reconciliation reads. */
export interface RunRowSnapshot {
  status?: string | null;
  error?: Record<string, unknown> | null;
}

/**
 * The terminal wire event a run ROW implies, or null when the row is not
 * terminal (pending/running/paused/interrupted/awaiting_input — all of which
 * mean "keep following"). Pure, and exported so the guard drives it directly.
 */
export function reconcileEventFromRunRow(
  runId: string,
  row: RunRowSnapshot | null | undefined,
): WorkflowRunWireEvent | null {
  const status =
    typeof row?.status === "string" ? row.status.trim().toLowerCase() : "";
  const event = TERMINAL_ROW_STATUS_EVENTS[status];
  if (!event) return null;
  const error =
    row?.error && typeof row.error === "object"
      ? (row.error as Record<string, unknown>)
      : null;
  const sentence =
    (typeof error?.message === "string" && error.message.trim()) ||
    (typeof error?.technical === "string" && error.technical.trim()) ||
    "";
  const reconciled: WorkflowRunWireEvent = {
    event,
    run_id: runId,
    payload: { reconciled_from_row: true, row_status: status },
  };
  if (event !== "run_completed") {
    reconciled.error_message = sentence || RUN_ROW_TERMINAL_FALLBACK_MESSAGE;
  }
  return reconciled;
}

export interface FollowWorkflowRunOptions {
  /** The workflow run to follow. */
  runId: string;
  /** The adopted `activeRequests` row the node streams accumulate under. */
  requestId: string;
  /** Conversation id used for backend-channel resolution (global for runs). */
  conversationId: string;
  /** Caller teardown — abort to stop following. */
  signal: AbortSignal;
  /**
   * Every parsed workflow event (lifecycle AND node_stream), for the caller's
   * own choreography (active speaker, interrupts, terminal states). Must not
   * throw.
   */
  onEvent?: (event: WorkflowRunWireEvent) => void;
}

export function followWorkflowRunStream(
  opts: FollowWorkflowRunOptions,
): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const backend = resolveBackendForConversation(
      getState(),
      opts.conversationId,
    );
    if (!backend) {
      console.error(
        "[workflow-run-stream] no backend URL resolved — cannot follow run events",
        { runId: opts.runId },
      );
      return;
    }

    const routeEvent = (parsed: WorkflowRunWireEvent, seq: number | null) => {
      if (
        parsed.event === "node_stream" &&
        typeof parsed.node_id === "string" &&
        typeof parsed.delta === "string" &&
        typeof parsed.stream_seq === "number"
      ) {
        dispatch(
          appendWorkflowNodeStream({
            requestId: opts.requestId,
            nodeId: parsed.node_id,
            kind: parsed.kind ?? "chunk",
            delta: parsed.delta,
            streamSeq: parsed.stream_seq,
          }),
        );
      } else if (
        (parsed.event === "node_completed" || parsed.event === "node_failed") &&
        typeof parsed.node_id === "string"
      ) {
        dispatch(
          settleWorkflowNodeStream({
            requestId: opts.requestId,
            nodeId: parsed.node_id,
            status: parsed.event === "node_completed" ? "done" : "failed",
          }),
        );
      }
      if (opts.onEvent) {
        try {
          opts.onEvent(parsed);
        } catch {
          /* caller choreography must never break the feed */
        }
      }
      void seq;
    };

    // Durable-seq cursor for Last-Event-ID replay across reconnects.
    // Ephemeral node_stream frames carry no id and never advance it.
    let cursor = 0;
    let failures = 0;
    /** Has this run been settled — by a feed event, or by the row itself? */
    let settled = false;

    /**
     * Ask the run ROW whether the run is already over, and deliver the
     * terminal event the feed never sent. Returns true when it settled.
     *
     * A failed row read is NOT a new failure surface: the follower simply
     * keeps reconnecting, exactly as it did before this existed.
     */
    const reconcileWithRunRow = async (): Promise<boolean> => {
      if (settled || opts.signal.aborted) return settled;
      try {
        const headers: Record<string, string> = { ...backend.headers };
        delete headers["Content-Type"]; // GET has no body
        headers["Accept"] = "application/json";
        const res = await fetch(`${backend.baseUrl}/runs/${opts.runId}`, {
          method: "GET",
          headers,
          signal: opts.signal,
        });
        if (!res.ok) return false;
        const row = (await res.json()) as RunRowSnapshot;
        const event = reconcileEventFromRunRow(opts.runId, row);
        if (!event) return false;
        settled = true;
        routeEvent(event, null);
        return true;
      } catch {
        return false;
      }
    };

    while (!opts.signal.aborted && failures < RECONNECT_LIMIT) {
      let endFrame = false;
      const attempt = new AbortController();
      const onOuterAbort = () => attempt.abort();
      opts.signal.addEventListener("abort", onOuterAbort, { once: true });

      let stallTimer: ReturnType<typeof setTimeout> | null = null;
      const armStall = () => {
        if (stallTimer !== null) clearTimeout(stallTimer);
        stallTimer = setTimeout(() => attempt.abort(), STALL_TIMEOUT_MS);
      };

      try {
        const headers: Record<string, string> = { ...backend.headers };
        delete headers["Content-Type"]; // GET has no body
        headers["Accept"] = "text/event-stream";
        if (cursor > 0) headers["Last-Event-ID"] = String(cursor);

        const res = await fetch(
          `${backend.baseUrl}/runs/${opts.runId}/events/stream`,
          { method: "GET", headers, signal: attempt.signal },
        );
        if (!res.ok || !res.body) {
          throw new Error(`workflow run event stream failed: ${res.status}`);
        }

        armStall();
        for await (const frame of readMatrxSseStream(res.body)) {
          // Any parsed frame — comment pings included — proves the wire.
          armStall();
          failures = 0;

          if (frame.data === null) continue;

          if (frame.event === "end") {
            endFrame = true;
            break;
          }
          if (frame.event !== "data") continue;

          const seq = frame.seq;
          if (seq !== null && seq > cursor) cursor = seq;

          let parsed: WorkflowRunWireEvent;
          try {
            parsed = JSON.parse(frame.data) as WorkflowRunWireEvent;
          } catch {
            continue; // malformed frame — durable replay heals gaps
          }
          if (typeof parsed?.event !== "string") continue;
          routeEvent(parsed, seq);
          if (TERMINAL_RUN_EVENTS.has(parsed.event)) {
            settled = true;
            break;
          }
        }
        if (!settled && !endFrame) {
          // Server closed without `end` (restart / already terminal) — retry;
          // Last-Event-ID replays anything missed from wf_node_events.
          failures += 1;
        }
      } catch {
        if (opts.signal.aborted) break;
        failures += 1;
      } finally {
        if (stallTimer !== null) clearTimeout(stallTimer);
        opts.signal.removeEventListener("abort", onOuterAbort);
      }

      if (settled || opts.signal.aborted) return;

      // EVERY boundary asks the row — a clean `end`, a drop, or a stall. A
      // replay that omits the terminal event over an already-dead row settles
      // HERE, within one poll, instead of spinning forever.
      if (await reconcileWithRunRow()) return;
      // An `end` frame means this feed is finished talking. The row said the
      // run is still live, so there is nothing left to follow and nothing to
      // reconnect to.
      if (endFrame) return;

      if (!opts.signal.aborted && failures < RECONNECT_LIMIT) {
        await new Promise((r) => setTimeout(r, RECONNECT_DELAY_MS));
      }
    }

    // Reconnects exhausted (or the loop fell out): one last row read, because
    // stopping silently over a run the server already failed is the exact
    // spinner-over-a-dead-run this follower exists to prevent.
    await reconcileWithRunRow();
  };
}
