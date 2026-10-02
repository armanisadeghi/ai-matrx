/**
 * RunLaneManager — the per-node streaming lanes of a workflow run.
 *
 * A workflow run is ONE multiplexed stream; the canonical rendering system
 * (`MarkdownStream requestId=` → kind components) wants one `activeRequests`
 * row per unit of work. This module is the bridge: it mints a request row per
 * node invocation ("lane"), feeds that lane's token deltas through the SAME
 * `StreamBlockAccumulator` the chat pipeline uses (so `metadata.__ir`
 * envelopes, kind routing, and `MarkdownStream` all work unchanged), and
 * enforces THE LANE BUDGET.
 *
 * ## The lane budget (PLAN.md §4.2-4)
 *
 * Workflows are designed for 20–100 nodes. Every node is TRACKED (status,
 * counts, a capped text tail — that lives in the workflowRuns slice, not
 * here); only a bounded number are STREAMED (a full request row + live
 * accumulator). `MAX_STREAMED_LANES` is the cap; when it is reached, new
 * lanes are refused and the caller falls back to tracked-tier bookkeeping.
 * A refused lane can be promoted later (`ensureLane` again after `release`),
 * which is how viewer-driven promotion works: what is on screen streams,
 * what is off screen ticks.
 *
 * ## One flush timer, not one per lane
 *
 * `processStream` runs one ~30 ms flush timer PER stream — fine for chat,
 * ~N×33 dispatches/sec for N workflow lanes. Here every lane buffers into
 * this manager and ONE shared timer flushes all of them per tick.
 *
 * ## Retention
 *
 * Lane rows participate in the normal retention contract
 * (`useRetainRequestForViewer` fires inside `StreamAwareChatMarkdown`, so any
 * mounted `MarkdownStream`/`LiveRunDisplay` pins its row). `disposeRun`
 * removes rows via `removeRequest`, which defers while viewers exist — never
 * bypass it. See /Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/LIVE-RUN-RETENTION.md.
 */

import type { AppDispatch } from "@/lib/redux/store";
import {
  appendChunk,
  appendReasoningChunk,
  closeTextRun,
  createRequest,
  markTextStreamStart,
  removeRequest,
  setRequestStatus,
  upsertRenderBlock,
} from "@ai-matrx/chat/agents/redux/execution-system/active-requests/active-requests.slice";
import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
import {
  prepareInboundRenderBlock,
  type PartialKindGate,
} from "@ai-matrx/chat/agents/redux/execution-system/utils/inbound-render-block";
import { makePartialKindStalenessGate } from "@ai-matrx/content-ir/wire";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import {
  generateConversationId,
  generateRequestId,
} from "@ai-matrx/chat/agents/redux/execution-system/utils/ids";

import { registerLane, releaseLane } from "./workflow-runs.slice";

/**
 * How many node invocations may hold a full streaming lane (request row +
 * live accumulator) at once, across ONE adopted run tree. Tracked-tier
 * bookkeeping (status/progress/tail) is unlimited and lives in the slice.
 */
export const MAX_STREAMED_LANES = 12;

/** Shared flush cadence for ALL lanes of a run tree (ms). */
export const LANE_FLUSH_INTERVAL_MS = 50;

interface Lane {
  runId: string;
  invocationKey: string;
  requestId: string;
  conversationId: string;
  accumulator: StreamBlockAccumulator;
  textBuffer: string;
  reasoningBuffer: string;
  settled: boolean;
  /**
   * True once the server told us this node's text is SHADOWED: the same
   * tokens are also arriving as server-built `render_block` frames, which
   * are the canonical rendering channel (typed partial kinds included).
   * The raw text still lands on the request row and still drives the tracked
   * tier, but it must not be parsed a second time — two producers of blocks
   * for one region renders the answer twice, with two sets of block ids.
   */
  shadowed: boolean;
  /**
   * ONE staleness/carry-forward gate per lane, exactly as `processStream`
   * keeps one per stream. The producer omits `__ir_partial` on every
   * non-advancing event, so without it a filling quiz flickers back to its
   * skeleton between snapshots.
   */
  partialKindGate: PartialKindGate;
}

function laneKey(runId: string, invocationKey: string): string {
  return `${runId}\0${invocationKey}`;
}

export class RunLaneManager {
  private lanes = new Map<string, Lane>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(
    private dispatch: AppDispatch,
    private maxStreamedLanes: number = MAX_STREAMED_LANES,
  ) {}

  /** Number of live (unsettled) lanes across the run tree. */
  private liveLaneCount(): number {
    let n = 0;
    for (const lane of this.lanes.values()) if (!lane.settled) n++;
    return n;
  }

  /**
   * Get or create the streaming lane for a node invocation. Returns null when
   * the budget refuses a NEW lane — the caller then keeps the invocation in
   * the tracked tier (slice text tail) instead. Never throws.
   *
   * `seedText` (viewer-driven promotion): content the tracked tier already
   * holds for this invocation (the capped text tail). It is buffered as the
   * lane's first chunk so a promoted lane starts with the visible history
   * instead of blank — same continuity contract as post-refresh streaming,
   * where deltas resume mid-stream into a fresh accumulator. Applied on
   * CREATE only; an existing lane already has its own content.
   */
  ensureLane(runId: string, invocationKey: string, seedText?: string): Lane | null {
    if (this.disposed) return null;
    const key = laneKey(runId, invocationKey);
    const existing = this.lanes.get(key);
    if (existing) return existing;
    if (this.liveLaneCount() >= this.maxStreamedLanes) return null;

    const requestId = generateRequestId();
    // Each lane gets its OWN synthetic conversationId: it protects the lane
    // from a sibling conversation's teardown, and the abort registry keys on
    // conversationId (see the adoption research in the plan).
    const conversationId = generateConversationId();
    this.dispatch(createRequest({ requestId, conversationId }));
    this.dispatch(setRequestStatus({ requestId, status: "streaming" }));
    this.dispatch(markTextStreamStart({ requestId, timestamp: Date.now() }));

    const lane: Lane = {
      runId,
      invocationKey,
      requestId,
      conversationId,
      // The accumulator dispatches through the canonical upsertRenderBlock
      // action, exactly as process-stream constructs it.
      accumulator: new StreamBlockAccumulator(requestId, upsertRenderBlock),
      textBuffer: "",
      reasoningBuffer: "",
      settled: false,
      shadowed: false,
      partialKindGate: makePartialKindStalenessGate(),
    };
    this.lanes.set(key, lane);
    this.dispatch(registerLane({ runId, invocationKey, requestId }));
    if (seedText && seedText.length > 0) {
      lane.textBuffer = seedText;
      this.scheduleFlush();
    }
    return lane;
  }

  /** True if a live lane exists for this invocation. */
  hasLane(runId: string, invocationKey: string): boolean {
    return this.lanes.has(laneKey(runId, invocationKey));
  }

  getLaneRequestId(runId: string, invocationKey: string): string | null {
    return this.lanes.get(laneKey(runId, invocationKey))?.requestId ?? null;
  }

  /**
   * Buffer a token delta into a lane. Returns false when no lane exists and
   * the budget refuses one — the caller then routes the delta to the tracked
   * tier. `kind` is the node_stream kind ("chunk" | "reasoning").
   */
  pushDelta(
    runId: string,
    invocationKey: string,
    kind: "chunk" | "reasoning",
    delta: string,
    shadowed = false,
  ): boolean {
    const lane = this.ensureLane(runId, invocationKey);
    if (!lane || lane.settled) return false;
    // Latch, never unlatch: the flag arrives on the FIRST token of a
    // block-scoped node (the server sets it when the scope opens, not when
    // the first block lands), and the scope closing must not hand the tail
    // of the same text back to the accumulator.
    if (shadowed) lane.shadowed = true;
    if (kind === "reasoning") lane.reasoningBuffer += delta;
    else lane.textBuffer += delta;
    this.scheduleFlush();
    return true;
  }

  /**
   * Store one server-built render block on a lane's request row.
   *
   * This is the whole point of the workflow half of the partial-kinds
   * contract: the block goes through the SAME inbound funnel and the SAME
   * `upsertRenderBlock` action the chat stream uses, so `BlockRenderer`,
   * `resolveProvisionalKindRender` and `MarkdownStream` render a workflow
   * node exactly as they render a chat turn. No second renderer, no second
   * parser, nothing workflow-specific downstream of here.
   *
   * Returns false when the budget refuses a lane — the invocation then keeps
   * its tracked-tier text tail, which is what it had before.
   */
  pushRenderBlock(
    runId: string,
    invocationKey: string,
    payload: RenderBlockPayload,
  ): boolean {
    const lane = this.ensureLane(runId, invocationKey);
    if (!lane || lane.settled) return false;
    lane.shadowed = true;
    // Buffered text must land BEFORE the block: `appendChunk` and the block
    // store are one row, and a reader that sees the block first would show
    // content the raw record does not yet have.
    this.flushAll();
    const { block } = prepareInboundRenderBlock(payload, lane.partialKindGate);
    this.dispatch(upsertRenderBlock({ requestId: lane.requestId, block }));
    return true;
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null || this.disposed) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushAll();
    }, LANE_FLUSH_INTERVAL_MS);
  }

  /** Flush every lane's buffered deltas in one pass (one timer, N lanes). */
  flushAll(): void {
    for (const lane of this.lanes.values()) {
      if (lane.textBuffer.length > 0) {
        const text = lane.textBuffer;
        lane.textBuffer = "";
        this.dispatch(appendChunk({ requestId: lane.requestId, content: text }));
        // A shadowed lane's blocks come from the server (see `shadowed`); the
        // raw text is kept as the row's record and for the tracked tier, but
        // parsing it here would open a SECOND set of blocks over the same
        // region.
        if (!lane.shadowed) lane.accumulator.ingest(text, this.dispatch);
      }
      if (lane.reasoningBuffer.length > 0) {
        const text = lane.reasoningBuffer;
        lane.reasoningBuffer = "";
        this.dispatch(
          appendReasoningChunk({ requestId: lane.requestId, content: text }),
        );
      }
    }
  }

  /**
   * Settle a lane on its node's terminal event. Flushes remaining content,
   * finalizes the accumulator (which closes any open content-IR region), and
   * stamps the request row's terminal status. The lane stops counting against
   * the budget but its row STAYS — a finished lane is a record, and retention
   * decides its lifetime.
   */
  settleLane(
    runId: string,
    invocationKey: string,
    outcome: "complete" | "error",
    errorMessage?: string,
  ): void {
    const lane = this.lanes.get(laneKey(runId, invocationKey));
    if (!lane || lane.settled) return;
    this.flushAll();
    // A shadowed lane never opened an accumulator region, and finalizing one
    // that never ingested would emit an empty block over the server's.
    if (!lane.shadowed) lane.accumulator.finalize(this.dispatch);
    this.dispatch(
      closeTextRun({ requestId: lane.requestId, timestamp: Date.now() }),
    );
    this.dispatch(
      setRequestStatus({
        requestId: lane.requestId,
        status: outcome,
        ...(outcome === "error"
          ? {
              error: {
                error_type: "workflow_node_failed",
                message: errorMessage ?? "The step failed.",
                user_message: errorMessage ?? "This step failed.",
              },
            }
          : {}),
      }),
    );
    lane.settled = true;
  }

  /**
   * Drop a lane and free its budget slot WITHOUT removing the request row
   * (used for demotion; the row keeps rendering its settled content).
   */
  release(runId: string, invocationKey: string): void {
    const key = laneKey(runId, invocationKey);
    const lane = this.lanes.get(key);
    if (!lane) return;
    if (!lane.settled) this.settleLane(runId, invocationKey, "complete");
    this.lanes.delete(key);
    this.dispatch(releaseLane({ runId, invocationKey }));
  }

  /**
   * Dispose every lane belonging to a run (or the whole tree when runId is
   * omitted). Settles live lanes, then requests row removal — which the
   * retention layer defers while any viewer is mounted.
   */
  disposeRun(runId?: string): void {
    for (const [key, lane] of [...this.lanes.entries()]) {
      if (runId !== undefined && lane.runId !== runId) continue;
      if (!lane.settled) this.settleLane(lane.runId, lane.invocationKey, "complete");
      this.dispatch(removeRequest(lane.requestId));
      // Clear the slice's laneRequestId too — a dangling id makes
      // InvocationBody render a LiveRunDisplay bound to a removed request
      // row, a blank pane that shadows the settled output forever
      // (adversarial finding 2).
      this.dispatch(
        releaseLane({ runId: lane.runId, invocationKey: lane.invocationKey }),
      );
      this.lanes.delete(key);
    }
    if (runId === undefined) {
      this.disposed = true;
      if (this.flushTimer !== null) {
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
      }
    }
  }
}
