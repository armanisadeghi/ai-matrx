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
import {
  applyNodeStreamMeta,
  applyRunEvent,
  attachRun,
  detachRun,
  seedRunRow,
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
  /** Promote a node invocation to a streaming lane (viewer-driven). */
  ensureLane: (runId: string, invocationKey: string) => string | null;
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

    const routeNodeStream = (runId: string, event: NodeStreamEvent): void => {
      if (!event.node_id) return;
      // The wire gives us node_id only; fan-out siblings multiplex their
      // deltas onto the node's root lane. (Per-invocation stream identity is
      // a server contract addition tracked in the plan.)
      const key = invocationKeyOf(event.node_id, null, 0);
      if (event.kind === "chunk" || event.kind === "reasoning") {
        const streamed = tree.laneManager.pushDelta(
          runId,
          key,
          event.kind,
          event.delta,
        );
        if (!streamed) dispatch(applyNodeStreamMeta({ runId, event }));
        else dispatch(applyNodeStreamMeta({ runId, event: { ...event, delta: "" } }));
        return;
      }
      // phase / tool / warning / record_update / resource_changed — tracked
      // bookkeeping. record_update/resource_changed are refetch hints; the
      // generic signal→refetch pump wiring is Phase 3 (plan §7).
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
          const key = invocationKeyOf(
            event.node_id,
            event.dispatch_id ?? null,
            event.item_index ?? null,
          );
          // Open a lane eagerly while budget allows, so first tokens land in
          // a live lane instead of the tracked tail.
          tree.laneManager.ensureLane(runId, key);
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
      // Fan-out deltas multiplex onto the root lane — settle it too when the
      // root invocation itself settles.
      const rootKey = invocationKeyOf(nodeId, null, 0);
      if (rootKey !== key && tree.laneManager.hasLane(runId, rootKey)) {
        tree.laneManager.settleLane(runId, rootKey, outcome, message);
      }
    };

    const replayDurableLog = async (runId: string, depth: number): Promise<number | null> => {
      let cursor: number | null = null;
      let total = 0;
      for (;;) {
        const page = await fetchJson<RunEventRecord[]>(
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
      tree.stops.set(runId, () => {
        stopped = true;
        stopTransport?.();
      });

      void (async () => {
        try {
          const row = await fetchJson<RunRow>(`/runs/${runId}`);
          if (stopped) return;
          dispatch(seedRunRow({ runId, row }));

          const cursor = await replayDurableLog(runId, depth);
          if (stopped) return;

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
              if (!stopped) dispatch(setTransportMode({ runId, mode }));
            },
            onEnd: () => {
              if (stopped) return;
              dispatch(setTransportMode({ runId, mode: "idle" }));
              tree.laneManager.disposeRun(runId);
            },
          });
          stopTransport = source.stop;
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
        for (const stop of tree.stops.values()) stop();
        tree.stops.clear();
        tree.laneManager.disposeRun();
      },
      ensureLane: (runId, invocationKey) => {
        const lane = tree.laneManager.ensureLane(runId, invocationKey);
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
