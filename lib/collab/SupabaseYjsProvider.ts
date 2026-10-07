/**
 * SupabaseYjsProvider — Yjs sync transport over Supabase Broadcast.
 *
 * Self-contained: no Univer dependencies. Carries Yjs document updates and
 * y-protocols awareness (presence) between peers in a single workbook channel.
 *
 * Wire protocol (see `lib/collab/types.ts` when finalized):
 *   event: "y-update"        — base64 Yjs updateV2, optionally chunked
 *   event: "y-awareness"     — base64 awareness update
 *   event: "y-request-state" — new joiner asks existing peers for full state
 *   event: "y-state"         — full state response targeted at one clientId
 *   event: "y-sv"            — anti-entropy probe: state vector + delete-set digest
 *
 * Design notes:
 *  - Outbound y-doc updates use a "remote" origin convention so the doc.update
 *    listener can avoid echoing applied remote updates back onto the wire.
 *  - Initial state sync is best-effort: 1500ms "alone timer" decides solo mode.
 *  - Awareness outbound is throttled at ~50ms to coalesce cursor spam.
 *
 * REALTIME: `@ai-matrx/realtime` owns the channel. THE TOPIC IS THE ROOM here
 * (pure broadcast), so the package puts the declared topic on the wire verbatim
 * and ref-counts one underlying channel per room — which is precisely the
 * problem the `client` option existed to work around ("supabase-js returns the
 * existing channel object for a duplicate topic and a second subscribe on it
 * fails"), so that option is gone and the verification harness passes two
 * MANAGERS instead of two clients.
 *
 * What else the adoption bought this provider: the decoupled ordered handler
 * queue (a burst of chunked frames no longer runs back-to-back on the socket
 * callback path — the frozen-tab class, and this provider ships 200KB base64
 * frames), jittered reconnect with the stability reset, tab-sleep and network
 * awareness, dedup, and diagnostics.
 *
 * AND THE CATCH-UP. Realtime has no replay, and a CRDT is not exempt: every
 * peer update that landed while the socket was down is gone, and Yjs cannot
 * know it is missing them — the doc simply stays quietly divergent. The correct
 * re-read for a CRDT is to ask the peers for state again, which is exactly what
 * a new joiner already does, so `onBackfill` re-sends `y-request-state` — and
 * EVERY state answer addressed to us is merged, not only the first (Yjs applies
 * are idempotent; "first answer wins" made the catch-up a no-op). The gap runs
 * both ways, so the catch-up also re-sends this member's whole state: its own
 * offline edits reach the peers.
 *
 * ANTI-ENTROPY. Broadcast is at-most-once, and a frame can be lost while the
 * socket stays up (rate limit, a hiccup that never becomes a disconnect). Yjs
 * parks every later update that builds on the lost one as pending, forever,
 * and a lost delete leaves no trace at all. So while connected each member
 * probes the room with `y-sv` — its state vector plus a digest of its delete
 * set — (a) shortly after it holds pending structs, (b) once after a burst of
 * local edits goes quiet, and (c) on a jittered knob-backed interval, but only
 * if the doc changed since the last tick or something is still pending. A peer
 * that holds structs or deletes the prober lacks answers with
 * `encodeStateAsUpdateV2(doc, theirVector)` as a targeted `y-state`; a peer that
 * lacks something answers once with its own probe (marked `reply`, which is never
 * answered with another probe). Equal vectors and digests produce no frame, so an
 * idle room is silent. Our own probes are rate-limited (MIN_PROBE_GAP_MS).
 *
 * TEARDOWN. `disconnect()` sends the pending awareness (the "leave") before it
 * closes, so a caller tears down synchronously — a deferred disconnect left an
 * unmounted screen's provider applying the room's frames to its doc. A destroyed
 * doc disconnects its provider, and nothing is ever applied to one.
 *
 * Echo suppression is the package default now (it was `broadcast: {self:false}`,
 * the same intent). The vestigial `presence: {key}` in the old channel config is
 * gone: this provider binds no presence handlers and never called `track()`, so
 * it published nothing — awareness rides the `y-awareness` broadcast instead.
 *
 * See: lib/collab/FEATURE.md for the higher-level plan.
 */
"use client";

import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from "y-protocols/awareness";
import {
  currentRealtimeManager,
  defineChannelNamespace,
  type ChannelHandle,
  type RealtimeManager,
} from "@ai-matrx/realtime";

export type SupabaseYjsProviderOptions = {
  /**
   * Opaque resource identifier (e.g. workbookId, documentId). Combined with
   * `channelPrefix` to form the Broadcast channel name, so distinct resource
   * types live on distinct channels even when their UUIDs are unrelated.
   */
  workbookId: string;
  /**
   * Channel namespace — defaults to `"workbook"` for back-compat with the
   * spreadsheet surface that built this provider. The docs surface passes
   * `"document"` so the channel becomes `yjs:document:<id>` instead of
   * `yjs:workbook:<id>`. Pick distinct values per surface to keep CRDT rooms
   * from cross-talking.
   */
  channelPrefix?: string;
  /** Stable per-tab session id. Use crypto.randomUUID() at the call site. */
  clientId: string;
  doc: Y.Doc;
  awareness: Awareness;
  /** Cap base64-encoded payload size. Default 200_000 (under Broadcast's 256KB limit, accounting for envelope overhead). */
  chunkSize?: number;
  /**
   * Override the realtime manager. Defaults to the app's ONE manager (the
   * provider publishes it). Only the verification harness passes its own —
   * two providers in ONE process must not share a manager, or the package's
   * room registry would correctly hand them the same channel and they would
   * never see each other's frames.
   */
  manager?: RealtimeManager;
  /** Fires when this holder gains or loses tab leadership of its room. */
  onLeaderChange?: () => void;
  /**
   * Take frames the package believes came from this same client session.
   * The package stamps every frame with ONE per-process session id and drops
   * frames carrying its own, so two managers in one process (the verification
   * harness) silence each other. Safe here: doc updates are idempotent CRDT
   * updates and the control frames filter their own `clientId`. Off in the app.
   */
  acceptOwnSessionFrames?: boolean;
  /**
   * Base period (ms) of the anti-entropy tick. Defaults to the
   * `collab.anti_entropy_interval_ms` feature knob; tests pass a number.
   */
  antiEntropyIntervalMs?: number;
};

/** One place names this channel. A second, different declaration throws. */
const yjsChannel = defineChannelNamespace({
  namespace: "yjs",
  parts: ["prefix", "resourceId"],
  description: "Yjs CRDT doc + awareness frames for one collaborative resource",
});

const REMOTE_DOC_ORIGIN = "remote";
const REMOTE_AWARENESS_ORIGIN = "remote-awareness";
const READY_TIMEOUT_MS = 1500;
/** Hard cap on channel subscription — a blocked WebSocket degrades to solo
 *  mode instead of hanging the session start. */
const SUBSCRIBE_TIMEOUT_MS = 8000;
const AWARENESS_THROTTLE_MS = 50;
const CHUNK_BATCH_TTL_MS = 5000;
const DEFAULT_CHUNK_SIZE = 200_000;

/** Feature knob holding the anti-entropy tick period (ms). */
const ANTI_ENTROPY_KNOB = { feature: "collab", key: "anti_entropy_interval_ms" } as const;
/** Protocol timings, not policy: how long out-of-order frames get to fill a
 *  gap before we probe, how long local typing must pause before the post-burst
 *  probe, and the floor between two of our own probes. */
const PENDING_PROBE_DELAY_MS = 400;
const QUIET_PROBE_DELAY_MS = 1500;
const MIN_PROBE_GAP_MS = 1000;

type ChunkFrame = {
  batchId: string;
  seq: number;
  total: number;
  u: string;
};

type StateFrame = ChunkFrame & {
  forClientId: string;
};

type AwarenessFrame = {
  u: string;
};

type RequestStateFrame = {
  clientId: string;
};

type StateVectorFrame = {
  clientId: string;
  /** base64 V1 state vector. */
  sv: string;
  /** Digest of the delete set — deletions never move the state vector. */
  ds: string;
  /** An answer to someone else's probe; never answered with another probe. */
  reply?: boolean;
};

type PendingBatch = {
  parts: Map<number, string>;
  total: number;
  timer: ReturnType<typeof setTimeout>;
};

// Browser-only base64 helpers — keeps the wire payload JSON-safe.
function toBase64(bytes: Uint8Array): string {
  let s = "";
  // Chunk to avoid blowing the call stack on large updates.
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** FNV-1a over bytes — a cheap equality digest, not a security hash. */
function fnv1a(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return `${bytes.length.toString(36)}.${(h >>> 0).toString(36)}`;
}

function hasPending(doc: Y.Doc): boolean {
  return doc.store.pendingStructs !== null || doc.store.pendingDs !== null;
}

export class SupabaseYjsProvider {
  private readonly workbookId: string;
  private readonly clientId: string;
  private readonly acceptOwnSessionFrames: boolean;
  private readonly doc: Y.Doc;
  private readonly awareness: Awareness;
  private readonly chunkSize: number;
  private readonly channelName: string;
  private readonly manager: RealtimeManager | null;
  private readonly onLeaderChange: (() => void) | undefined;

  private channel: ChannelHandle | null = null;
  private _disposed = false;
  private connected = false;

  private hasInitialState = false;
  private readyPromise: Promise<void>;
  private resolveReady: (() => void) | null = null;
  private aloneTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly pendingDocBatches = new Map<string, PendingBatch>();
  private readonly pendingStateBatches = new Map<string, PendingBatch>();

  private awarenessFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private awarenessFlushQueue = new Set<number>();

  // Anti-entropy state.
  private readonly antiEntropyIntervalOption: number | undefined;
  private antiEntropyIntervalMs: number | null = null;
  private tickTimer: ReturnType<typeof setTimeout> | null = null;
  private quietTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingBackoffMs = MIN_PROBE_GAP_MS;
  private lastProbeAt = 0;
  private changedSinceTick = false;

  // Stable bound listeners so we can detach on disconnect.
  private readonly onDocDestroy = (): void => this.disconnect();

  private readonly onDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (this._disposed || !this.channel) return;
    this.changedSinceTick = true;
    if (origin === REMOTE_DOC_ORIGIN) return; // don't echo
    this.broadcastChunked("y-update", update);
    this.scheduleQuietProbe();
  };

  private readonly onAwarenessUpdate = (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ): void => {
    if (this._disposed) return;
    if (origin === REMOTE_AWARENESS_ORIGIN) return;
    for (const id of changes.added) this.awarenessFlushQueue.add(id);
    for (const id of changes.updated) this.awarenessFlushQueue.add(id);
    for (const id of changes.removed) this.awarenessFlushQueue.add(id);
    this.scheduleAwarenessFlush();
  };

  constructor(options: SupabaseYjsProviderOptions) {
    this.workbookId = options.workbookId;
    this.clientId = options.clientId;
    this.doc = options.doc;
    this.awareness = options.awareness;
    this.chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
    this.manager = options.manager ?? currentRealtimeManager();
    this.onLeaderChange = options.onLeaderChange;
    this.acceptOwnSessionFrames = options.acceptOwnSessionFrames === true;
    this.antiEntropyIntervalOption = options.antiEntropyIntervalMs;
    this.channelName = yjsChannel.topic({
      prefix: options.channelPrefix ?? "workbook",
      resourceId: this.workbookId,
    });
    this.readyPromise = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });
  }

  async connect(): Promise<void> {
    if (this._disposed || this.connected) return;
    this.connected = true;

    if (!this.manager) {
      // Not silent: without a manager there are no peers, and a collaborative
      // surface that silently went solo is the worst possible outcome here.
      console.warn(
        `[collab] no realtime manager for ${this.channelName} — continuing solo ` +
          "(no live peers). Mount <RealtimeProvider> (providers/RealtimeHost) " +
          "above this surface, or pass `manager` explicitly.",
      );
      this.hasInitialState = true;
      this.resolveReady?.();
      return;
    }

    // Resolve on success OR terminal failure OR hard timeout — a blocked
    // WebSocket must never hang the caller. On failure we degrade to solo
    // mode: the editor keeps working, just without live peers, and ready()
    // resolves so nothing upstream awaits forever.
    let settle: ((ok: boolean) => void) | null = null;
    const subscribedPromise = new Promise<boolean>((resolve) => {
      settle = resolve;
    });
    const timer = setTimeout(() => settle?.(false), SUBSCRIBE_TIMEOUT_MS);

    this.channel = this.manager.open({
      topic: this.channelName,
      broadcast: [
        {
          event: "y-update",
          onMessage: ({ data }) => this.handleDocFrame(data as ChunkFrame),
        },
        {
          event: "y-awareness",
          onMessage: ({ data }) => this.handleAwarenessFrame(data as AwarenessFrame),
        },
        {
          event: "y-request-state",
          onMessage: ({ data }) => this.handleStateRequest(data as RequestStateFrame),
        },
        {
          event: "y-state",
          onMessage: ({ data }) => this.handleStateResponse(data as StateFrame),
        },
        {
          event: "y-sv",
          onMessage: ({ data }) => this.handleStateVector(data as StateVectorFrame),
        },
      ],
      // Chunked frames must be reassembled IN ORDER; the package's queue
      // preserves per-channel order, so `seq` reassembly stays correct.
      eventKey: (_source, payload) => {
        const frame = payload as Partial<ChunkFrame> | undefined;
        return frame?.batchId === undefined
          ? undefined
          : `${frame.batchId}:${String(frame.seq)}`;
      },
      onLeaderChange: () => this.onLeaderChange?.(),
      ...(this.acceptOwnSessionFrames ? { echoSuppression: false } : {}),
      onStatusChange: (status) => {
        if (typeof process !== "undefined" && process.env?.COLLAB_DEBUG) {
          console.debug(`[collab:debug] ${this.channelName} status=${status}`);
        }
        if (status === "connected") {
          clearTimeout(timer);
          settle?.(true);
        }
      },
      // THE CATCH-UP. A CRDT is not exempt from "realtime has no replay": every
      // peer update that landed while the socket was down is gone, and Yjs
      // cannot know it is missing them — the doc just stays quietly divergent.
      // Asking the peers for state again is the correct re-read, and it is the
      // same thing a new joiner does.
      // The gap runs both ways: also push our whole state so the peers merge the
      // edits we made while disconnected (idempotent when there were none).
      onBackfill: () => {
        if (this.inert() || !this.channel) return;
        const resync: RequestStateFrame = { clientId: this.clientId };
        this.channel.send("y-request-state", resync);
        this.broadcastChunked("y-update", Y.encodeStateAsUpdateV2(this.doc));
      },
    });

    this.doc.on("updateV2", this.onDocUpdate);
    this.doc.on("destroy", this.onDocDestroy);
    this.awareness.on("update", this.onAwarenessUpdate);

    const subscribed = await subscribedPromise;
    clearTimeout(timer);

    if (this._disposed) return;

    if (!subscribed) {
      console.warn(
        `[collab] could not subscribe to ${this.channelName} — continuing solo (no live peers)`,
      );
      this.hasInitialState = true;
      this.resolveReady?.();
      return;
    }

    // Ask existing peers for the current doc; resolve solo if nobody answers.
    const req: RequestStateFrame = { clientId: this.clientId };
    this.channel.send("y-request-state", req);
    this.startAntiEntropy();

    this.aloneTimer = setTimeout(() => {
      this.aloneTimer = null;
      if (!this.hasInitialState) {
        this.hasInitialState = true;
        this.resolveReady?.();
      }
    }, READY_TIMEOUT_MS);
  }

  disconnect(): void {
    if (this._disposed) return;

    // Deliver what the throttle still holds — typically the caller's "leave"
    // (`removeAwarenessStates` just before this). Dropping it forced callers to
    // defer disconnect(), and a deferred provider kept applying the room's frames
    // to a doc whose editor was already gone.
    if (this.awarenessFlushTimer) {
      clearTimeout(this.awarenessFlushTimer);
      this.awarenessFlushTimer = null;
    }
    if (!this.doc.isDestroyed) this.flushAwareness();
    this.awarenessFlushQueue.clear();

    this._disposed = true;
    this.connected = false;

    this.doc.off("updateV2", this.onDocUpdate);
    this.doc.off("destroy", this.onDocDestroy);
    this.awareness.off("update", this.onAwarenessUpdate);

    if (this.aloneTimer) {
      clearTimeout(this.aloneTimer);
      this.aloneTimer = null;
    }
    for (const t of [this.tickTimer, this.quietTimer, this.pendingTimer]) {
      if (t) clearTimeout(t);
    }
    this.tickTimer = this.quietTimer = this.pendingTimer = null;

    for (const batch of this.pendingDocBatches.values()) clearTimeout(batch.timer);
    for (const batch of this.pendingStateBatches.values()) clearTimeout(batch.timer);
    this.pendingDocBatches.clear();
    this.pendingStateBatches.clear();

    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }

    // Unblock anyone awaiting ready() after disconnect.
    if (!this.hasInitialState) {
      this.hasInitialState = true;
      this.resolveReady?.();
    }
  }

  ready(): Promise<void> {
    return this.readyPromise;
  }

  /**
   * One holder per room per tab is the leader (package-owned). Same-tab holders
   * of one document also hear each other's updates through the package, so they
   * converge; only the leader may be host/autosaver. No channel (solo) = leader.
   */
  isTabLeader(): boolean {
    return this.channel ? this.channel.isLocalLeader() : true;
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private broadcastChunked(event: "y-update" | "y-state", update: Uint8Array, extra?: Record<string, string>): void {
    if (!this.channel) return;
    const b64 = toBase64(update);
    const batchId = this.makeBatchId();

    if (b64.length <= this.chunkSize) {
      const payload: ChunkFrame = { batchId, seq: 0, total: 1, u: b64 };
      this.channel.send(event, extra ? { ...payload, ...extra } : payload);
      return;
    }

    const total = Math.ceil(b64.length / this.chunkSize);
    for (let seq = 0; seq < total; seq++) {
      const slice = b64.slice(seq * this.chunkSize, (seq + 1) * this.chunkSize);
      const payload: ChunkFrame = { batchId, seq, total, u: slice };
      this.channel.send(event, extra ? { ...payload, ...extra } : payload);
    }
  }

  /** Torn down, or the doc under us is gone: nothing may be applied or answered. */
  private inert(): boolean {
    return this._disposed || this.doc.isDestroyed;
  }

  private handleDocFrame(frame: ChunkFrame): void {
    if (this.inert()) return;
    const assembled = this.assemble(this.pendingDocBatches, frame);
    if (!assembled) return;
    const update = fromBase64(assembled);
    // V2 decoder — outbound updates come from doc.on('updateV2'). Mixing V1
    // apply with V2 frames silently corrupts the doc.
    Y.applyUpdateV2(this.doc, update, REMOTE_DOC_ORIGIN);
    this.checkPending();
  }

  private handleAwarenessFrame(frame: AwarenessFrame): void {
    if (this.inert()) return;
    const update = fromBase64(frame.u);
    applyAwarenessUpdate(this.awareness, update, REMOTE_AWARENESS_ORIGIN);
  }

  private handleStateRequest(req: RequestStateFrame): void {
    if (this.inert() || !this.channel) return;
    if (req.clientId === this.clientId) return; // ignore our own (shouldn't fire with self:false)
    const sv = Y.encodeStateAsUpdateV2(this.doc);
    this.broadcastChunked("y-state", sv, { forClientId: req.clientId });
  }

  private handleStateResponse(frame: StateFrame): void {
    if (this.inert()) return;
    if (frame.forClientId !== this.clientId) return;
    // EVERY answer is merged — the first resolves ready(), later ones (other
    // peers, the reconnect catch-up's re-request) carry what we missed. Yjs
    // applies are idempotent, so a redundant answer changes nothing.
    const assembled = this.assemble(this.pendingStateBatches, frame);
    if (!assembled) return;
    const update = fromBase64(assembled);
    // V2 decoder — state snapshots are encoded with encodeStateAsUpdateV2.
    Y.applyUpdateV2(this.doc, update, REMOTE_DOC_ORIGIN);
    this.checkPending();
    if (this.hasInitialState) return;
    this.hasInitialState = true;
    if (this.aloneTimer) {
      clearTimeout(this.aloneTimer);
      this.aloneTimer = null;
    }
    this.resolveReady?.();
  }

  // ─── Anti-entropy ────────────────────────────────────────────────────────

  private startAntiEntropy(): void {
    if (this.antiEntropyIntervalOption !== undefined) {
      this.antiEntropyIntervalMs = this.antiEntropyIntervalOption;
      this.scheduleTick();
      return;
    }
    import("@/lib/knobs/featureKnobs")
      .then(({ knobInt }) => knobInt(ANTI_ENTROPY_KNOB.feature, ANTI_ENTROPY_KNOB.key))
      .then((ms) => {
        if (this.inert()) return;
        this.antiEntropyIntervalMs = ms;
        this.scheduleTick();
      })
      .catch((err: unknown) => {
        // Not silent: without the tick, a lost tail frame is only recovered by
        // the next edit's probe or a reconnect.
        console.warn(
          `[collab] anti-entropy tick disabled for ${this.channelName}: ` +
            `could not read knob ${ANTI_ENTROPY_KNOB.feature}.${ANTI_ENTROPY_KNOB.key}`,
          err,
        );
      });
  }

  /** Jittered (±25%) so a room's members do not probe in lockstep. */
  private scheduleTick(): void {
    const base = this.antiEntropyIntervalMs;
    if (this.inert() || !this.channel || base === null || base <= 0) return;
    const delay = Math.round(base * (0.75 + Math.random() * 0.5));
    this.tickTimer = setTimeout(() => {
      this.tickTimer = null;
      if (this.inert()) return;
      if (this.changedSinceTick || hasPending(this.doc)) {
        this.changedSinceTick = false;
        this.probe(false);
      }
      this.scheduleTick();
    }, delay);
  }

  /** One probe after a burst of local edits goes quiet (debounced). */
  private scheduleQuietProbe(): void {
    if (this.quietTimer) clearTimeout(this.quietTimer);
    this.quietTimer = setTimeout(() => {
      this.quietTimer = null;
      this.probe(false);
    }, QUIET_PROBE_DELAY_MS);
  }

  /** After a remote apply: a gap that survives the reorder window is probed. */
  private checkPending(): void {
    if (!hasPending(this.doc)) {
      this.pendingBackoffMs = MIN_PROBE_GAP_MS;
      return;
    }
    this.schedulePendingProbe(PENDING_PROBE_DELAY_MS);
  }

  private schedulePendingProbe(delay: number): void {
    if (this.pendingTimer || this.inert()) return;
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null;
      if (this.inert() || !hasPending(this.doc)) {
        this.pendingBackoffMs = MIN_PROBE_GAP_MS;
        return;
      }
      this.probe(false);
      // Still stuck after the answer window → probe again, backing off to the tick period.
      const cap = this.antiEntropyIntervalMs ?? 30_000;
      this.pendingBackoffMs = Math.min(this.pendingBackoffMs * 2, cap);
      this.schedulePendingProbe(this.pendingBackoffMs);
    }, delay);
  }

  private deleteSetDigest(): string {
    // An update relative to our own vector carries no structs — only the delete set.
    return fnv1a(Y.encodeStateAsUpdate(this.doc, Y.encodeStateVector(this.doc)));
  }

  /** Send our state vector + delete-set digest. Rate-limited unless it is a reply. */
  private probe(reply: boolean): void {
    if (this.inert() || !this.channel) return;
    const now = Date.now();
    const wait = this.lastProbeAt + MIN_PROBE_GAP_MS - now;
    // Replies bypass the floor: they only ever answer a peer's (rate-limited) probe.
    if (!reply && wait > 0) {
      this.schedulePendingProbeAfterGap(wait);
      return;
    }
    this.lastProbeAt = now;
    const frame: StateVectorFrame = {
      clientId: this.clientId,
      sv: toBase64(Y.encodeStateVector(this.doc)),
      ds: this.deleteSetDigest(),
      ...(reply ? { reply: true } : {}),
    };
    this.channel.send("y-sv", frame);
  }

  /** A rate-limited non-reply probe is deferred, never dropped. */
  private schedulePendingProbeAfterGap(wait: number): void {
    if (this.quietTimer) return; // a probe is already coming
    this.quietTimer = setTimeout(() => {
      this.quietTimer = null;
      this.probe(false);
    }, wait);
  }

  private handleStateVector(frame: StateVectorFrame): void {
    if (this.inert() || !this.channel) return;
    if (frame.clientId === this.clientId) return;
    const theirSvBytes = fromBase64(frame.sv);
    const theirs = Y.decodeStateVector(theirSvBytes);
    const ours = Y.decodeStateVector(Y.encodeStateVector(this.doc));
    let weHaveMore = false;
    for (const [client, clock] of ours) {
      if (clock > (theirs.get(client) ?? 0)) {
        weHaveMore = true;
        break;
      }
    }
    let theyHaveMore = false;
    for (const [client, clock] of theirs) {
      if (clock > (ours.get(client) ?? 0)) {
        theyHaveMore = true;
        break;
      }
    }
    const dsDiffers = frame.ds !== this.deleteSetDigest();
    if (weHaveMore || dsDiffers) {
      this.broadcastChunked("y-state", Y.encodeStateAsUpdateV2(this.doc, theirSvBytes), {
        forClientId: frame.clientId,
      });
    }
    if (!frame.reply && (theyHaveMore || dsDiffers || hasPending(this.doc))) {
      this.probe(true);
    }
  }

  /** Reassemble chunked frames by batchId; returns the joined base64 string when complete. */
  private assemble(store: Map<string, PendingBatch>, frame: ChunkFrame): string | null {
    if (frame.total <= 1) return frame.u;

    let batch = store.get(frame.batchId);
    if (!batch) {
      const timer = setTimeout(() => store.delete(frame.batchId), CHUNK_BATCH_TTL_MS);
      batch = { parts: new Map(), total: frame.total, timer };
      store.set(frame.batchId, batch);
    }
    batch.parts.set(frame.seq, frame.u);
    if (batch.parts.size < batch.total) return null;

    clearTimeout(batch.timer);
    store.delete(frame.batchId);
    let combined = "";
    for (let i = 0; i < batch.total; i++) {
      const part = batch.parts.get(i);
      if (part == null) return null; // shouldn't happen given the size check above
      combined += part;
    }
    return combined;
  }

  private scheduleAwarenessFlush(): void {
    if (this.awarenessFlushTimer || this._disposed) return;
    this.awarenessFlushTimer = setTimeout(() => {
      this.awarenessFlushTimer = null;
      this.flushAwareness();
    }, AWARENESS_THROTTLE_MS);
  }

  private flushAwareness(): void {
    if (this.inert() || !this.channel || this.awarenessFlushQueue.size === 0) return;
    const clients = Array.from(this.awarenessFlushQueue);
    this.awarenessFlushQueue.clear();
    const update = encodeAwarenessUpdate(this.awareness, clients);
    const payload: AwarenessFrame = { u: toBase64(update) };
    this.channel.send("y-awareness", payload);
  }

  private makeBatchId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
