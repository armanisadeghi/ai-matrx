/**
 * Spatial view — stream sources a tile can be paced against.
 *
 * A source is anything that holds the CURRENT render blocks of one stream and
 * notifies when they change. Two exist:
 *   - `ReplayStream` — replays a wire text through the REAL
 *     `StreamBlockAccumulator` (the class every chat surface runs), so a demo
 *     tile renders exactly what production renders, chunk by chunk.
 *   - `RequestStream` — a live execution-system request (`requestId`) read
 *     from Redux `activeRequests`, the same row `MarkdownStream` reads.
 * Neither renders anything: the tile renders the snapshot through
 * `BlockRenderer`, the one pipeline. Pacing (zoom-dependent commit cadence)
 * sits between the source and the render, never upstream of the source.
 */

import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import { chunkWireText } from "@/features/content-ir/studio/stream-simulator";

export type StreamPhase = "idle" | "streaming" | "complete" | "error";

export interface StreamSnapshot {
  blocks: readonly RenderBlockPayload[];
  phase: StreamPhase;
  /** Characters received so far (drives progress in overview tiles). */
  received: number;
  /** Total characters expected, when known (replays know; live runs don't). */
  expected: number | null;
  error: string | null;
}

export interface PacedSource {
  get(): StreamSnapshot;
  subscribe(listener: () => void): () => void;
}

export const IDLE_SNAPSHOT: StreamSnapshot = {
  blocks: [],
  phase: "idle",
  received: 0,
  expected: null,
  error: null,
};

type Listener = () => void;

export interface ReplayOptions {
  /** Characters per tick — realistic model output is ~40–90 chars/s per stream. */
  charsPerTick?: number;
  tickMs?: number;
  /** Delay before the first chunk, so a board of replays starts staggered. */
  startDelayMs?: number;
}

export class ReplayStream implements PacedSource {
  private snapshot: StreamSnapshot = IDLE_SNAPSHOT;
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private delay: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly id: string,
    private readonly wire: string,
  ) {}

  get = (): StreamSnapshot => this.snapshot;

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private emit(next: StreamSnapshot): void {
    this.snapshot = next;
    for (const l of this.listeners) l();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.delay) clearTimeout(this.delay);
    this.timer = null;
    this.delay = null;
  }

  /** Stop and return to idle (a chained stage waiting for its input). */
  reset(): void {
    this.stop();
    this.emit(IDLE_SNAPSHOT);
  }

  /** Start (or restart) the replay. `instant` = the DB-load path: same
   * pipeline, whole text at once. */
  start(opts: ReplayOptions & { instant?: boolean } = {}): void {
    this.stop();
    const { charsPerTick = 7, tickMs = 90, startDelayMs = 0, instant = false } = opts;
    const blocks = new Map<string, RenderBlockPayload>();
    const order: string[] = [];
    let received = 0;
    const expected = this.wire.length;
    const accumulator = new StreamBlockAccumulator(`spatial-${this.id}`, (payload) => {
      const b = payload.block as RenderBlockPayload;
      if (!blocks.has(b.blockId)) order.push(b.blockId);
      blocks.set(b.blockId, b);
      return payload;
    });
    const dispatch = (action: unknown) => action;
    const publish = (phase: StreamPhase) =>
      this.emit({
        blocks: order.map((id) => blocks.get(id)).filter((b): b is RenderBlockPayload => !!b),
        phase,
        received,
        expected,
        error: null,
      });

    if (instant) {
      accumulator.ingest(this.wire, dispatch);
      accumulator.finalize(dispatch);
      received = expected;
      publish("complete");
      return;
    }

    this.emit({ ...IDLE_SNAPSHOT, phase: "streaming", expected });
    const chunks = chunkWireText(this.wire, charsPerTick);
    let i = 0;
    const tick = () => {
      const next = chunks[i];
      i += 1;
      if (next !== undefined) {
        accumulator.ingest(next, dispatch);
        received += next.length;
        publish("streaming");
        return;
      }
      this.stop();
      accumulator.finalize(dispatch);
      publish("complete");
    };
    this.delay = setTimeout(() => {
      this.timer = setInterval(tick, tickMs);
    }, startDelayMs);
  }
}

/** Minimal store surface a live source needs (the app's Redux store). */
export interface ReadableStore<S> {
  getState(): S;
  subscribe(listener: () => void): () => void;
}

/**
 * A live execution-system request. `selectBlocks` / `selectStatus` are the
 * canonical `activeRequests` selectors, injected so this module stays free of
 * the RootState import cycle. The CALLER must hold a viewer retention on the
 * request (`useRetainRequestForViewer`) — a direct row reader is a viewer
 * (LIVE-RUN-RETENTION.md).
 */
export class RequestStream<S> implements PacedSource {
  private snapshot: StreamSnapshot = IDLE_SNAPSHOT;
  private lastBlocks: readonly RenderBlockPayload[] | undefined;
  private lastStatus: string | undefined;

  constructor(
    private readonly store: ReadableStore<S>,
    private readonly selectBlocks: (s: S) => RenderBlockPayload[] | undefined,
    private readonly selectStatus: (s: S) => string | undefined,
    private readonly selectError: (s: S) => string | null,
  ) {
    this.read();
  }

  private read(): boolean {
    const state = this.store.getState();
    const blocks = this.selectBlocks(state);
    const status = this.selectStatus(state);
    if (blocks === this.lastBlocks && status === this.lastStatus) return false;
    this.lastBlocks = blocks;
    this.lastStatus = status;
    const list = blocks ?? [];
    let received = 0;
    for (const b of list) received += (b.content ?? "").length;
    this.snapshot = {
      blocks: list,
      phase: phaseForStatus(status),
      received,
      expected: null,
      error: status === "error" ? this.selectError(state) : null,
    };
    return true;
  }

  get = (): StreamSnapshot => this.snapshot;

  subscribe = (l: Listener): (() => void) =>
    this.store.subscribe(() => {
      if (this.read()) l();
    });
}

export function phaseForStatus(status: string | undefined): StreamPhase {
  switch (status) {
    case undefined:
    case "pending":
      return "idle";
    case "complete":
      return "complete";
    case "error":
    case "timeout":
    case "cancelled":
      return "error";
    default:
      return "streaming";
  }
}
