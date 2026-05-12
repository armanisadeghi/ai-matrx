import type {
  TypedStreamEvent,
  ChunkPayload,
  ReasoningChunkPayload,
  PhasePayload,
  InitPayload,
  CompletionPayload,
  TypedDataPayload,
  ToolEventPayload,
  WarningPayload,
  InfoPayload,
  ErrorPayload,
  RenderBlockPayload,
  RecordReservedPayload,
  RecordUpdatePayload,
  ResourceChangedPayload,
  HeartbeatPayload,
  EndPayload,
  BrokerPayload,
  RenderBlockEvent,
  ContextAnalysisPayload,
  StructuredOutputPayload,
} from "@/types/python-generated/stream-events";
import {
  isChunkEvent,
  isReasoningChunkEvent,
  isPhaseEvent,
  isInitEvent,
  isCompletionEvent,
  isTypedDataEvent,
  isToolEventEvent,
  isWarningEvent,
  isInfoEvent,
  isErrorEvent,
  isRenderBlockEvent,
  isRecordReservedEvent,
  isRecordUpdateEvent,
  isResourceChangedEvent,
  isHeartbeatEvent,
  isEndEvent,
  isBrokerEvent,
  isContextAnalysisEvent,
  isStructuredOutputEvent,
} from "@/types/python-generated/stream-events";
import type { FinalPayload, ToolStreamEvent } from "../types";
import { toolEventPayloadToToolStreamEvent } from "./normalize-tool-event";

/** Wire event that did not match any known V2 discriminator (same as `process-stream` fallback). */
export interface UnknownWireEvent {
  event: string;
  data: unknown;
}

/** Fold bucket key — one row appended per wire event (arrival order). */
export type BackendStreamFoldBucket = RenderBlockPayload["type"];
/**
 * One arrival step: wire row `i` → bucket + `record` (object stored in that bucket).
 * `toolTester` captures demo-only side effects on the same row (final payload / tool row).
 */
export interface BackendStreamArrivalEntry {
  wireEvent: string;
  bucket: BackendStreamFoldBucket;
  record: unknown;
  toolTester?: {
    finalPayload?: FinalPayload | null;
    toolStreamEvent?: ToolStreamEvent;
  };
}

function toolTesterDelta(
  beforeFinal: FinalPayload | null,
  beforeToolLen: number,
  state: BackendStreamFoldState,
): BackendStreamArrivalEntry["toolTester"] | undefined {
  const finalChanged = state.toolTesterFinalPayload !== beforeFinal;
  const toolAdded = state.toolStreamEvents.length > beforeToolLen;
  if (!finalChanged && !toolAdded) return undefined;
  return {
    ...(finalChanged && { finalPayload: state.toolTesterFinalPayload }),
    ...(toolAdded && {
      toolStreamEvent:
        state.toolStreamEvents[state.toolStreamEvents.length - 1],
    }),
  };
}

/**
 * Full fold of an NDJSON stream — mirrors branching order in
 * `lib/api/stream-parser.ts` `consumeStream` and `process-stream.ts`.
 * Use for offline replay, tests, or after capturing `TypedStreamEvent[]` via `onEvent`.
 */
export interface BackendStreamFoldState {
  rawEvents: TypedStreamEvent[];
  accumulatedText: string;
  accumulatedReasoning: string;
  chunks: ChunkPayload[];
  reasoningChunks: ReasoningChunkPayload[];
  phases: PhasePayload[];
  inits: InitPayload[];
  completions: CompletionPayload[];
  dataPayloads: Array<TypedDataPayload | Record<string, unknown>>;
  toolEventPayloads: ToolEventPayload[];
  warnings: WarningPayload[];
  infos: InfoPayload[];
  errors: ErrorPayload[];
  renderBlocks: RenderBlockPayload[];
  recordReserved: RecordReservedPayload[];
  recordUpdates: RecordUpdatePayload[];
  resourceChanges: ResourceChangedPayload[];
  heartbeats: HeartbeatPayload[];
  ends: EndPayload[];
  brokers: BrokerPayload[];
  contextAnalyses: ContextAnalysisPayload[];
  structuredOutputs: StructuredOutputPayload[];
  unknownWireEvents: UnknownWireEvent[];
  /** Counts per category (debug / parity with `process-stream` metrics). */
  counts: {
    total: number;
    chunk: number;
    reasoningChunk: number;
    phase: number;
    init: number;
    completion: number;
    data: number;
    tool: number;
    warning: number;
    info: number;
    error: number;
    renderBlock: number;
    recordReserved: number;
    recordUpdate: number;
    resourceChanged: number;
    heartbeat: number;
    end: number;
    broker: number;
    contextAnalysis: number;
    structuredOutput: number;
    unknown: number;
  };
  // ─── Tool-testing demo slice (order-sensitive; same rules as prior `foldStreamEventsToToolTestState`) ───
  toolStreamEvents: ToolStreamEvent[];
  toolTesterFinalPayload: FinalPayload | null;
  /** Same length as `rawEvents`: per-wire-event fold contribution (arrival order). */
  arrivalTimeline: BackendStreamArrivalEntry[];
}

function emptyCounts(): BackendStreamFoldState["counts"] {
  return {
    total: 0,
    chunk: 0,
    reasoningChunk: 0,
    phase: 0,
    init: 0,
    completion: 0,
    data: 0,
    tool: 0,
    warning: 0,
    info: 0,
    error: 0,
    renderBlock: 0,
    recordReserved: 0,
    recordUpdate: 0,
    resourceChanged: 0,
    heartbeat: 0,
    end: 0,
    broker: 0,
    contextAnalysis: 0,
    structuredOutput: 0,
    unknown: 0,
  };
}

function emptyFoldState(): BackendStreamFoldState {
  return {
    rawEvents: [],
    accumulatedText: "",
    accumulatedReasoning: "",
    chunks: [],
    reasoningChunks: [],
    phases: [],
    inits: [],
    completions: [],
    dataPayloads: [],
    toolEventPayloads: [],
    warnings: [],
    infos: [],
    errors: [],
    renderBlocks: [],
    recordReserved: [],
    recordUpdates: [],
    resourceChanges: [],
    heartbeats: [],
    ends: [],
    brokers: [],
    contextAnalyses: [],
    structuredOutputs: [],
    unknownWireEvents: [],
    counts: emptyCounts(),
    toolStreamEvents: [],
    toolTesterFinalPayload: null,
    arrivalTimeline: [],
  };
}

function pushArrival(
  state: BackendStreamFoldState,
  wireEvent: string,
  bucket: BackendStreamFoldBucket,
  record: unknown,
  toolTester: BackendStreamArrivalEntry["toolTester"],
): void {
  const entry: BackendStreamArrivalEntry = {
    wireEvent,
    bucket,
    record,
  };
  if (toolTester && Object.keys(toolTester).length > 0) {
    entry.toolTester = toolTester;
  }
  state.arrivalTimeline.push(entry);
}

function applyToolTesterRules(
  state: BackendStreamFoldState,
  event: TypedStreamEvent,
): void {
  if (isPhaseEvent(event) && event.data.phase === "complete") {
    state.toolTesterFinalPayload = { status: "complete" } as FinalPayload;
  } else if (isCompletionEvent(event)) {
    state.toolTesterFinalPayload = event.data as unknown as FinalPayload;
  } else if (isTypedDataEvent(event)) {
    state.toolTesterFinalPayload = event.data as unknown as FinalPayload;
  } else if (isToolEventEvent(event)) {
    state.toolStreamEvents.push(toolEventPayloadToToolStreamEvent(event.data));
  }
}

/**
 * Single-pass fold of `TypedStreamEvent[]` into structured state (all V2 event kinds).
 * Branch order matches `consumeStream` in `@/lib/api/stream-parser`.
 */
export function foldBackendStreamEvents(
  events: Iterable<TypedStreamEvent>,
): BackendStreamFoldState {
  const state = emptyFoldState();

  for (const event of events) {
    state.rawEvents.push(event);
    state.counts.total++;

    const beforeFinal = state.toolTesterFinalPayload;
    const beforeToolLen = state.toolStreamEvents.length;
    applyToolTesterRules(state, event);
    const tt = toolTesterDelta(beforeFinal, beforeToolLen, state);
    const wire = event.event;

    if (isChunkEvent(event)) {
      state.counts.chunk++;
      const text = event.data.text;
      state.accumulatedText += text;
      state.chunks.push(event.data);
      pushArrival(state, wire, "chunk", event.data, tt);
    } else if (isReasoningChunkEvent(event)) {
      state.counts.reasoningChunk++;
      const text = event.data.text;
      state.accumulatedReasoning += text;
      state.reasoningChunks.push(event.data);
      pushArrival(state, wire, "reasoning_chunk", event.data, tt);
    } else if (isPhaseEvent(event)) {
      state.counts.phase++;
      state.phases.push(event.data);
      pushArrival(state, wire, "phase", event.data, tt);
    } else if (isInitEvent(event)) {
      state.counts.init++;
      state.inits.push(event.data);
      pushArrival(state, wire, "init", event.data, tt);
    } else if (isCompletionEvent(event)) {
      state.counts.completion++;
      state.completions.push(event.data);
      pushArrival(state, wire, "completion", event.data, tt);
    } else if (isTypedDataEvent(event)) {
      state.counts.data++;
      state.dataPayloads.push(event.data);
      pushArrival(state, wire, "data", event.data, tt);
    } else if (isToolEventEvent(event)) {
      state.counts.tool++;
      state.toolEventPayloads.push(event.data);
      pushArrival(state, wire, "tool_event", event.data, tt);
    } else if (isWarningEvent(event)) {
      state.counts.warning++;
      state.warnings.push(event.data);
      pushArrival(state, wire, "warning", event.data, tt);
    } else if (isInfoEvent(event)) {
      state.counts.info++;
      state.infos.push(event.data);
      pushArrival(state, wire, "info", event.data, tt);
    } else if (isErrorEvent(event)) {
      state.counts.error++;
      state.errors.push(event.data);
      pushArrival(state, wire, "error", event.data, tt);
    } else if (isRenderBlockEvent(event)) {
      state.counts.renderBlock++;
      state.renderBlocks.push(event.data);
      pushArrival(state, wire, "render_block", event.data, tt);
    } else if (isRecordReservedEvent(event)) {
      state.counts.recordReserved++;
      state.recordReserved.push(event.data);
      pushArrival(state, wire, "record_reserved", event.data, tt);
    } else if (isRecordUpdateEvent(event)) {
      state.counts.recordUpdate++;
      state.recordUpdates.push(event.data);
      pushArrival(state, wire, "record_update", event.data, tt);
    } else if (isResourceChangedEvent(event)) {
      state.counts.resourceChanged++;
      state.resourceChanges.push(event.data);
      pushArrival(state, wire, "resource_changed", event.data, tt);
    } else if (isHeartbeatEvent(event)) {
      state.counts.heartbeat++;
      state.heartbeats.push(event.data);
      pushArrival(state, wire, "heartbeat", event.data, tt);
    } else if (isEndEvent(event)) {
      state.counts.end++;
      state.ends.push(event.data);
      pushArrival(state, wire, "end", event.data, tt);
    } else if (isBrokerEvent(event)) {
      state.counts.broker++;
      state.brokers.push(event.data);
      pushArrival(state, wire, "broker", event.data, tt);
    } else if (isContextAnalysisEvent(event)) {
      state.counts.contextAnalysis++;
      state.contextAnalyses.push(event.data);
      pushArrival(state, wire, "unknown", event.data, tt);
    } else if (isStructuredOutputEvent(event)) {
      state.counts.structuredOutput++;
      state.structuredOutputs.push(event.data);
      pushArrival(state, wire, "unknown", event.data, tt);
    } else {
      state.counts.unknown++;
      const ev = event as { event?: string; data?: unknown };
      const unknownRec: UnknownWireEvent = {
        event: String(ev.event ?? "undefined"),
        data: ev.data,
      };
      state.unknownWireEvents.push(unknownRec);
      pushArrival(state, wire, "unknown", unknownRec, tt);
    }
  }

  return state;
}

/** @deprecated Prefer `foldBackendStreamEvents` + `.toolStreamEvents` / `.toolTesterFinalPayload`. */
export function foldStreamEventsToToolTestState(events: TypedStreamEvent[]): {
  toolEvents: ToolStreamEvent[];
  finalPayload: FinalPayload | null;
} {
  const folded = foldBackendStreamEvents(events);
  return {
    toolEvents: folded.toolStreamEvents,
    finalPayload: folded.toolTesterFinalPayload,
  };
}
