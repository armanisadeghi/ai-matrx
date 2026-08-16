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
 * (EventSource cannot set the Authorization header), all three frame
 * separators (sse-starlette emits CRLF), stall detector above the server's
 * 15s ping cadence.
 */

import type { AppThunk } from "@/lib/redux/store";
import {
  appendWorkflowNodeStream,
  settleWorkflowNodeStream,
} from "../active-requests/active-requests.slice";
import { resolveBackendForConversation } from "./resolve-base-url";

const SSE_FRAME_SEPARATOR = /\r\n\r\n|\n\n|\r\r/;
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

const TERMINAL_RUN_EVENTS = new Set([
  "run_completed",
  "run_failed",
  "run_errored",
  "run_cancelled",
]);

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

    while (!opts.signal.aborted && failures < RECONNECT_LIMIT) {
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
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let sep: RegExpExecArray | null;
            while ((sep = SSE_FRAME_SEPARATOR.exec(buffer)) !== null) {
              const frame = buffer.slice(0, sep.index);
              buffer = buffer.slice(sep.index + sep[0].length);
              // Any parsed frame — comment pings included — proves the wire.
              armStall();
              failures = 0;

              let eventType = "message";
              let eventId: string | undefined;
              const dataLines: string[] = [];
              for (const line of frame.split(/\r\n|\n|\r/)) {
                if (line.startsWith(":")) continue;
                if (line.startsWith("event:")) eventType = line.slice(6).trim();
                else if (line.startsWith("data:"))
                  dataLines.push(line.slice(5).replace(/^ /, ""));
                else if (line.startsWith("id:")) eventId = line.slice(3).trim();
              }
              if (dataLines.length === 0) continue;

              if (eventType === "end") return;
              if (eventType !== "data") continue;

              const seq =
                eventId && Number.isInteger(Number(eventId))
                  ? Number(eventId)
                  : null;
              if (seq !== null && seq > cursor) cursor = seq;

              let parsed: WorkflowRunWireEvent;
              try {
                parsed = JSON.parse(
                  dataLines.join("\n"),
                ) as WorkflowRunWireEvent;
              } catch {
                continue; // malformed frame — durable replay heals gaps
              }
              if (typeof parsed?.event !== "string") continue;
              routeEvent(parsed, seq);
              if (TERMINAL_RUN_EVENTS.has(parsed.event)) return;
            }
          }
        } finally {
          reader.releaseLock();
        }
        // Server closed without `end` (restart / already terminal) — retry;
        // Last-Event-ID replays anything missed from wf_node_events.
        failures += 1;
      } catch {
        if (opts.signal.aborted) break;
        failures += 1;
      } finally {
        if (stallTimer !== null) clearTimeout(stallTimer);
        opts.signal.removeEventListener("abort", onOuterAbort);
      }

      if (!opts.signal.aborted && failures < RECONNECT_LIMIT) {
        await new Promise((r) => setTimeout(r, RECONNECT_DELAY_MS));
      }
    }
  };
}
