/**
 * adoptWorkflowRun — THE RUN STREAM ADAPTER.
 *
 * One multiplexed workflow run stream in; canonical per-node rendering out.
 * This is the single primitive that makes every workflow run surface free:
 * the zero-config board, the authored Run Surface, AI-configured surfaces,
 * and fully custom React all consume the state this adapter maintains.
 *
 * What it does, in order, per run:
 *   1. `attachRun` in the workflowRuns slice.
 *   2. Fetch the run row (`GET /runs/{id}`) → status + heartbeat tails.
 *   3. REPLAY the durable event log (`GET /runs/{id}/events?after_seq=`),
 *      paged, folding every event through the same reducer with
 *      `replay: true` — this is how a mid-run refresh resumes exactly where
 *      it was (R3): finished nodes carry their outputs (and, when the kind
 *      check passed, a ready-to-render `metadata.__ir` envelope) in their
 *      `node_completed` payloads.
 *   4. Go LIVE via the SSE + poller pair on the same cursor
 *      (`transport/run-event-source`).
 *   5. Route per-node token deltas (`node_stream` frames) into streaming
 *      LANES — real `activeRequests` rows fed through the canonical
 *      accumulator — within the lane budget; everything else stays tracked
 *      in the slice (see lane-manager.ts).
 *   6. Follow `subgraph_run_linked` into CHILD RUNS (bounded depth/count),
 *      sharing one lane manager so the budget spans the whole tree.
 *
 * What it does NOT do: parse content (the accumulator owns that), render
 * anything, or persist anything. Token history is not replayable by design —
 * on refresh, a mid-stream node resumes from the heartbeat tail and the
 * durable outcome is the content truth (LIVE_RUN_RETENTION doctrine).
 */

import type { AppThunk } from "@/lib/redux/store";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import { selectAccessToken } from "@/lib/redux/selectors/userSelectors";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

import {
  invocationKeyOf,
  isWorkflowRunEvent,
  parseSignalDelta,
  TERMINAL_RUN_STATUSES,
  type NodeStreamEvent,
  type RunEventRecord,
  type RunRow,
  type WorkflowRunEvent,
} from "../types";
import {
  startRunEventSource,
  type RunTransportMode,
} from "../transport/run-event-source";
import { RenderBlockFrameAssembler } from "../transport/render-block-frames";
import {
  applyNodeStreamMeta,
  applyRunEvent,
  applyRunSignal,
  attachRun,
  detachRun,
  seedRunRow,
  refreshHeartbeatTails,
  setLastEventSeq,
  setTransportMode,
} from "./workflow-runs.slice";
import { RunLaneManager } from "./lane-manager";

/** Replay page size for the durable event log. */
const REPLAY_PAGE_SIZE = 200;
/** Hard ceiling on replayed events per run (a 100-node run stays well under). */
const REPLAY_MAX_EVENTS = 5000;
/** How deep the adapter follows child runs (parent = depth 0). */
const MAX_CHILD_DEPTH = 3;
/** How many child runs one adoption tree may follow in total. */
const MAX_CHILD_RUNS = 10;
/** Durable-tail refresh cadence while the run is on the poller. Sits just
 * above the server's 1.5s `_heartbeat._streaming` write so each refresh has
 * new text, without one extra request per durable-event poll. */
const HEARTBEAT_TAIL_REFRESH_MS = 3_000;

export interface AdoptWorkflowRunOptions {
  runId: string;
  /** Set when this adoption is itself a child of another adopted run. */
  parentRunId?: string;
  definitionId?: string;
}

export interface AdoptedWorkflowRun {
  runId: string;
  /** Stop transports for the whole tree and dispose lanes. State stays. */
  stop: () => void;
  /**
   * Promote a node invocation to a streaming lane (viewer-driven). Works for
   * any run in this adoption tree (the lane budget spans the tree).
   * `seedText` starts a NEW lane with the tracked tail for continuity.
   */
  ensureLane: (
    runId: string,
    invocationKey: string,
    seedText?: string,
  ) => string | null;
}

interface TreeContext {
  laneManager: RunLaneManager;
  stops: Map<string, () => void>;
  childCount: number;
  stopped: boolean;
}

export function adoptWorkflowRun(
  options: AdoptWorkflowRunOptions,
): AppThunk<AdoptedWorkflowRun> {
  return (dispatch, getState) => {
    const tree: TreeContext = {
      laneManager: new RunLaneManager(dispatch),
      stops: new Map(),
      childCount: 0,
      stopped: false,
    };

    const baseUrl = selectResolvedBaseUrl(getState());
    if (!baseUrl) {
      throw new Error(
        "[workflow-runtime] No backend URL configured — cannot adopt a workflow run.",
      );
    }

    const getHeaders = (): Record<string, string> => {
      const token = selectAccessToken(getState());
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      return headers;
    };

    const fetchJson = async <T>(path: string): Promise<T> => {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: getHeaders(),
      });
      if (!response.ok) {
        throw new Error(
          `[workflow-runtime] GET ${path} failed: ${response.status}`,
        );
      }
      return (await response.json()) as T;
    };

    // ── Tracked-tier meta batching (adversarial finding 7) ────────────────
    // Lane content batches on the manager's 50 ms timer, but every raw
    // node_stream frame also used to dispatch applyNodeStreamMeta — one
    // store notification per token frame, re-running the aggregate selectors
    // and re-rendering every readout. Chunk/reasoning meta now coalesces on
    // its own timer; low-rate kinds (phase/tool/warning) stay immediate.
    const META_FLUSH_MS = 100;
    interface PendingMeta {
      runId: string;
      event: NodeStreamEvent;
      extraChunks: number;
    }
    const metaBuffer = new Map<string, PendingMeta>();
    let metaTimer: ReturnType<typeof setTimeout> | null = null;
    const flushMeta = (): void => {
      metaTimer = null;
      for (const pending of metaBuffer.values()) {
        dispatch(
          applyNodeStreamMeta({
            runId: pending.runId,
            event: pending.event,
            extraChunks: pending.extraChunks,
          }),
        );
      }
      metaBuffer.clear();
    };
    const queueMeta = (runId: string, event: NodeStreamEvent): void => {
      const key = `${runId} ${event.node_id ?? ""} ${event.kind}`;
      const existing = metaBuffer.get(key);
      if (existing) {
        existing.event = {
          ...event,
          delta: existing.event.delta + event.delta,
        };
        existing.extraChunks += 1;
      } else {
        metaBuffer.set(key, { runId, event, extraChunks: 0 });
      }
      if (metaTimer === null && !tree.stopped) {
        metaTimer = setTimeout(flushMeta, META_FLUSH_MS);
      }
    };

    // One frame assembler per run: server render_block snapshots are sliced
    // across ordered frames to fit the workflow wire's pg_notify cap, and
    // frame ids are unique per run.
    const assemblers = new Map<string, RenderBlockFrameAssembler>();
    const assemblerFor = (runId: string): RenderBlockFrameAssembler => {
      let assembler = assemblers.get(runId);
      if (!assembler) {
        assembler = new RenderBlockFrameAssembler();
        assemblers.set(runId, assembler);
      }
      return assembler;
    };

    /**
     * The invocation lane a node's node_stream frames belong to, or null when
     * they cannot be attributed. The wire gives us node_id only — no
     * invocation identity — so a FAN-OUT node's frames are multiplexed across
     * siblings with no way to tell them apart; those stay in the TRACKED tier
     * until the server grows per-invocation stream identity (plan). Opening a
     * lane for one anyway would mint a request row no invocation renders
     * (`registerLane` no-ops on a key with no invocation) while eager sibling
     * lanes stay empty — budget burnt on invisible content (adversarial
     * finding 1).
     */
    const laneKeyForNodeStream = (runId: string, nodeId: string): string | null => {
      const run = getState().workflowRuns.byRunId[runId];
      const aggregate = run?.nodeAggregates[nodeId];
      const keys = aggregate?.invocationKeys ?? [];
      const isFanOut = keys.length > 1 || (aggregate?.expectedCount ?? 1) > 1;
      if (isFanOut) return null;
      return keys.length === 1 ? keys[0] : invocationKeyOf(nodeId, null, 0);
    };

    const routeNodeStream = (runId: string, event: NodeStreamEvent): void => {
      // Refetch signals (Phase 3 pump) can come from the RUN-LEVEL emitter
      // (node_id null), so they route BEFORE the node guard — dropping them
      // there silently killed every run-level record_update.
      if (event.kind === "record_update" || event.kind === "resource_changed") {
        dispatch(
          applyRunSignal({
            runId,
            signal: parseSignalDelta(
              event.kind,
              event.delta,
              event.node_id,
              Date.now(),
            ),
          }),
        );
        return;
      }
      if (!event.node_id) return;

      if (event.kind === "render_block") {
        // THE typed live-rendering channel. A completed frame set is a
        // canonical server render_block — the same event `/chat` receives —
        // and it goes onto the node's lane through the same inbound funnel
        // and the same `upsertRenderBlock` action, so partial kinds render on
        // the run page through the EXACT chat components. Nothing here parses
        // content or decides how anything looks.
        const block = assemblerFor(runId).push(event);
        if (!block) return;
        const key = laneKeyForNodeStream(runId, event.node_id);
        if (key === null) return;
        tree.laneManager.pushRenderBlock(runId, key, block);
        return;
      }

      if (event.kind === "chunk" || event.kind === "reasoning") {
        const key = laneKeyForNodeStream(runId, event.node_id);
        if (key === null) {
          queueMeta(runId, event);
          return;
        }
        // Creating the lane HERE (budget freed, or post-refresh live delta
        // racing the viewport promotion) seeds it with the tracked tail so
        // the visible history carries over (adversarial finding 8). Buffered
        // meta flushes FIRST — the seed must include coalesced deltas that
        // haven't landed in the slice tail yet.
        if (!tree.laneManager.hasLane(runId, key)) {
          if (metaBuffer.size > 0) flushMeta();
          const tail =
            getState().workflowRuns.byRunId[runId]?.nodes[key]?.textTail;
          tree.laneManager.ensureLane(runId, key, tail || undefined);
        }
        const streamed = tree.laneManager.pushDelta(
          runId,
          key,
          event.kind,
          event.delta,
          event.block_shadowed === true,
        );
        if (!streamed) queueMeta(runId, event);
        else queueMeta(runId, { ...event, delta: "" });
        return;
      }
      // phase / tool / warning — low-rate label transitions, immediate.
      dispatch(applyNodeStreamMeta({ runId, event }));
    };

    const routeDurableEvent = (
      runId: string,
      depth: number,
      event: WorkflowRunEvent,
      seq: number | null,
      replay: boolean,
    ): void => {
      dispatch(applyRunEvent({ runId, event, seq, replay }));

      switch (event.event) {
        case "node_started": {
          if (replay) break;
          // A fan-out sibling never gets an eager lane: node_stream deltas
          // carry node_id only, so a sibling lane can never receive content —
          // it would render a permanently-blank LiveRunDisplay shadowing the
          // tracked tail and settled output while burning a budget slot
          // (adversarial finding 1). Fan-out streams stay tracked-tier.
          const isFanOutSibling =
            (event.dispatch_id ?? "") !== "" ||
            (event.item_index ?? 0) !== 0 ||
            (event.invocation_count ?? 1) > 1;
          if (isFanOutSibling) break;
          const key = invocationKeyOf(
            event.node_id,
            event.dispatch_id ?? null,
            event.item_index ?? null,
          );
          // The reducer (applyRunEvent above) already deduped cross-transport
          // duplicates: open a lane only when the invocation is genuinely
          // running now — a re-delivered node_started for a settled
          // invocation used to mint a permanent budget-burning lane
          // (adversarial finding 4).
          const invocation = getState().workflowRuns.byRunId[runId]?.nodes[key];
          if (invocation?.phase === "running") {
            tree.laneManager.ensureLane(runId, key);
          }
          break;
        }
        case "node_completed":
        case "node_skipped": {
          settleNodeLanes(runId, event.node_id, event, "complete");
          break;
        }
        case "node_failed": {
          settleNodeLanes(runId, event.node_id, event, "error");
          break;
        }
        case "subgraph_run_linked": {
          adoptChild(event.child_run_id, runId, depth + 1);
          break;
        }
        case "run_completed":
        case "run_failed":
        case "run_cancelled": {
          // Terminal. The SSE path gets an `end` frame (onEnd stops + poses
          // idle), but POLLING mode has none — without this the poller kept
          // fetching an idle run every 2s for the life of the page
          // (adversarial finding 5). Live events only: during replay no
          // transport exists yet, and attachOne's terminal check already
          // skips starting one.
          if (replay) break;
          dispatch(setTransportMode({ runId, mode: "idle" }));
          tree.laneManager.disposeRun(runId);
          const stopThisRun = tree.stops.get(runId);
          // Defer so the current onEvent callback unwinds first.
          if (stopThisRun) setTimeout(stopThisRun, 0);
          break;
        }
        default:
          break;
      }
    };

    const settleNodeLanes = (
      runId: string,
      nodeId: string,
      event: WorkflowRunEvent,
      outcome: "complete" | "error",
    ): void => {
      const key = invocationKeyOf(
        nodeId,
        "dispatch_id" in event ? ((event.dispatch_id as string | null) ?? null) : null,
        "item_index" in event ? ((event.item_index as number | null) ?? null) : null,
      );
      const message =
        outcome === "error" && "error_message" in event
          ? ((event.error_message as string | null) ?? undefined)
          : undefined;
      if (tree.laneManager.hasLane(runId, key)) {
        tree.laneManager.settleLane(runId, key, outcome, message);
      }
      // Fan-out deltas multiplex onto the node's ROOT lane (the wire's
      // node_stream frames carry node_id only), so that lane must stay open
      // until the WHOLE node settles — settling it on the first sibling's
      // completion dropped every later sibling's tokens (Bugbot #147). The
      // reducer has already applied this event, so the slice is current.
      const rootKey = invocationKeyOf(nodeId, null, 0);
      if (rootKey !== key && tree.laneManager.hasLane(runId, rootKey)) {
        const run = getState().workflowRuns.byRunId[runId];
        const aggregate = run?.nodeAggregates[nodeId];
        const invocationKeys = aggregate?.invocationKeys ?? [];
        const allTerminal =
          invocationKeys.length > 0 &&
          invocationKeys.length >= (aggregate?.expectedCount ?? 1) &&
          invocationKeys.every((k) => {
            const phase = run?.nodes[k]?.phase;
            return (
              phase === "settled" || phase === "failed" || phase === "skipped"
            );
          });
        if (allTerminal) {
          // The shared lane's outcome follows the AGGREGATE, not whichever
          // sibling happened to settle last: any failed invocation makes the
          // node failed (same law the aggregate selector applies).
          const anyFailed = invocationKeys.some(
            (k) => run?.nodes[k]?.phase === "failed",
          );
          const failedMessage = anyFailed
            ? invocationKeys
                .map((k) => run?.nodes[k]?.error?.message)
                .find((m): m is string => typeof m === "string")
            : undefined;
          tree.laneManager.settleLane(
            runId,
            rootKey,
            anyFailed ? "error" : "complete",
            anyFailed ? failedMessage : undefined,
          );
        }
      }
    };

    const replayDurableLog = async (runId: string, depth: number): Promise<number | null> => {
      let cursor: number | null = null;
      let total = 0;
      for (;;) {
        const page: RunEventRecord[] = await fetchJson<RunEventRecord[]>(
          `/runs/${runId}/events?after_seq=${cursor ?? 0}&limit=${REPLAY_PAGE_SIZE}`,
        );
        for (const record of page) {
          const payload: unknown = { ...record.payload, event: record.event_type };
          if (isWorkflowRunEvent(payload)) {
            routeDurableEvent(runId, depth, payload, record.seq, true);
          }
          if (record.seq !== null) cursor = record.seq;
        }
        total += page.length;
        if (page.length < REPLAY_PAGE_SIZE || total >= REPLAY_MAX_EVENTS) break;
      }
      if (cursor !== null) dispatch(setLastEventSeq({ runId, seq: cursor }));
      return cursor;
    };

    const attachOne = (runId: string, parentRunId: string | null, depth: number): void => {
      if (tree.stopped || tree.stops.has(runId)) return;
      dispatch(
        attachRun({
          runId,
          ...(parentRunId ? { parentRunId } : {}),
          ...(options.definitionId && depth === 0
            ? { definitionId: options.definitionId }
            : {}),
        }),
      );

      let stopped = false;
      let stopTransport: (() => void) | null = null;
      // While the run is on the POLLER, `node_stream` frames never arrive
      // (SSE-only, never replayed) — the durable heartbeat tail is the only
      // source of streamed text, so it has to be re-read, not read once.
      let transportMode: RunTransportMode = "idle";
      let tailTimer: ReturnType<typeof setInterval> | null = null;
      const stopTailRefresh = (): void => {
        if (tailTimer !== null) {
          clearInterval(tailTimer);
          tailTimer = null;
        }
      };
      tree.stops.set(runId, () => {
        stopped = true;
        stopTailRefresh();
        stopTransport?.();
      });

      void (async () => {
        try {
          const row = await fetchJson<RunRow>(`/runs/${runId}`);
          if (stopped) return;

          const cursor = await replayDurableLog(runId, depth);
          if (stopped) return;
          // Seed AFTER replay: the heartbeat tails only land on node
          // invocations that exist, and replay is what creates them. Seeding
          // first silently dropped every tail on a fresh attach (Bugbot #147).
          dispatch(seedRunRow({ runId, row }));

          if (TERMINAL_RUN_STATUSES.has(row.status)) {
            // Nothing live to follow — the replay already rebuilt the state.
            dispatch(setTransportMode({ runId, mode: "idle" }));
            return;
          }

          const source = startRunEventSource({
            runId,
            baseUrl,
            getHeaders,
            initialCursor: cursor,
            fetchJson,
            onEvent: (event, seq) => {
              if (stopped) return;
              if ("event" in event && event.event === "node_stream") {
                routeNodeStream(runId, event as NodeStreamEvent);
              } else {
                routeDurableEvent(
                  runId,
                  depth,
                  event as WorkflowRunEvent,
                  seq,
                  false,
                );
              }
            },
            onMode: (mode: RunTransportMode) => {
              transportMode = mode;
              if (!stopped) dispatch(setTransportMode({ runId, mode }));
            },
            onEnd: () => {
              if (stopped) return;
              transportMode = "idle";
              stopTailRefresh();
              dispatch(setTransportMode({ runId, mode: "idle" }));
              tree.laneManager.disposeRun(runId);
            },
          });
          stopTransport = source.stop;

          // Re-read the durable tail on the poller's behalf. Cadence sits just
          // above the server's 1.5s heartbeat write so a refresh always has
          // something new, without adding a request per event poll. Skipped
          // entirely while SSE owns the wire — an SSE tail is assembled from
          // deltas and must never be rolled back to a throttled snapshot.
          tailTimer = setInterval(() => {
            if (stopped || transportMode !== "polling") return;
            void (async () => {
              try {
                const fresh = await fetchJson<RunRow>(`/runs/${runId}`);
                if (!stopped) dispatch(refreshHeartbeatTails({ runId, row: fresh }));
              } catch {
                // Narration is best-effort: a failed tail refresh must never
                // disturb the durable event poller that shares this run.
              }
            })();
          }, HEARTBEAT_TAIL_REFRESH_MS);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "adoption failed";
          captureError({
            source: "agent-stream-client-error",
            message: `[adopt-workflow-run] run ${runId}: ${message}`,
            raw: { runId, error },
          });
          if (!stopped) dispatch(setTransportMode({ runId, mode: "idle" }));
        }
      })();
    };

    const adoptChild = (
      childRunId: string,
      parentRunId: string,
      depth: number,
    ): void => {
      if (depth > MAX_CHILD_DEPTH) return;
      if (tree.childCount >= MAX_CHILD_RUNS) return;
      if (tree.stops.has(childRunId)) return;
      tree.childCount++;
      attachOne(childRunId, parentRunId, depth);
    };

    attachOne(options.runId, options.parentRunId ?? null, 0);

    return {
      runId: options.runId,
      stop: () => {
        tree.stopped = true;
        if (metaTimer !== null) {
          clearTimeout(metaTimer);
          metaTimer = null;
        }
        metaBuffer.clear();
        for (const stop of tree.stops.values()) stop();
        tree.stops.clear();
        tree.laneManager.disposeRun();
      },
      ensureLane: (runId, invocationKey, seedText) => {
        const lane = tree.laneManager.ensureLane(runId, invocationKey, seedText);
        return lane?.requestId ?? null;
      },
    };
  };
}

/**
 * Fully detach a run's STATE (after stop): removes the slice rows for the run
 * and its children. Use when a surface unmounts for good; keep state across
 * navigation when the run may be revisited.
 */
export function detachWorkflowRunState(runId: string): AppThunk<void> {
  return (dispatch) => {
    dispatch(detachRun({ runId }));
  };
}
