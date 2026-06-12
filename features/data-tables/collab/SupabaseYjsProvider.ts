/**
 * SupabaseYjsProvider — Yjs sync transport over Supabase Broadcast.
 *
 * Self-contained: no Univer dependencies. Carries Yjs document updates and
 * y-protocols awareness (presence) between peers in a single workbook channel.
 *
 * Wire protocol (see `features/data-tables/collab/types.ts` when finalized):
 *   event: "y-update"        — base64 Yjs updateV2, optionally chunked
 *   event: "y-awareness"     — base64 awareness update
 *   event: "y-request-state" — new joiner asks existing peers for full state
 *   event: "y-state"         — full state response targeted at one clientId
 *
 * Design notes:
 *  - Outbound y-doc updates use a "remote" origin convention so the doc.update
 *    listener can avoid echoing applied remote updates back onto the wire.
 *  - Initial state sync is best-effort: 1500ms "alone timer" decides solo mode.
 *  - Awareness outbound is throttled at ~50ms to coalesce cursor spam.
 *
 * See: features/data-tables/collab/FEATURE.md for the higher-level plan.
 */
"use client";

import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from "y-protocols/awareness";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/utils/supabase/client";

export type SupabaseYjsProviderOptions = {
  workbookId: string;
  /** Stable per-tab session id. Use crypto.randomUUID() at the call site. */
  clientId: string;
  doc: Y.Doc;
  awareness: Awareness;
  /** Cap base64-encoded payload size. Default 200_000 (under Broadcast's 256KB limit, accounting for envelope overhead). */
  chunkSize?: number;
  /**
   * Override the Supabase client. Defaults to the app singleton — correct
   * for every browser tab. Only the verification harness passes its own
   * clients (two providers in ONE process need two sockets, because
   * supabase-js returns the existing channel object for a duplicate topic
   * and a second subscribe on it fails).
   */
  client?: SupabaseClient;
};

const REMOTE_DOC_ORIGIN = "remote";
const REMOTE_AWARENESS_ORIGIN = "remote-awareness";
const READY_TIMEOUT_MS = 1500;
/** Hard cap on channel subscription — a blocked WebSocket degrades to solo
 *  mode instead of hanging the session start. */
const SUBSCRIBE_TIMEOUT_MS = 8000;
const AWARENESS_THROTTLE_MS = 50;
const CHUNK_BATCH_TTL_MS = 5000;
const DEFAULT_CHUNK_SIZE = 200_000;

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

export class SupabaseYjsProvider {
  private readonly workbookId: string;
  private readonly clientId: string;
  private readonly doc: Y.Doc;
  private readonly awareness: Awareness;
  private readonly chunkSize: number;
  private readonly channelName: string;
  private readonly client: SupabaseClient;

  private channel: RealtimeChannel | null = null;
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

  // Stable bound listeners so we can detach on disconnect.
  private readonly onDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (this._disposed || !this.channel) return;
    if (origin === REMOTE_DOC_ORIGIN) return; // don't echo
    this.broadcastChunked("y-update", update);
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
    this.client = options.client ?? (supabase as SupabaseClient);
    this.channelName = `yjs:workbook:${this.workbookId}`;
    this.readyPromise = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });
  }

  async connect(): Promise<void> {
    if (this._disposed || this.connected) return;
    this.connected = true;

    const channel = this.client.channel(this.channelName, {
      config: {
        broadcast: { self: false, ack: false },
        presence: { key: this.clientId },
      },
    });

    channel.on("broadcast", { event: "y-update" }, ({ payload }) => {
      this.handleDocFrame(payload as ChunkFrame);
    });

    channel.on("broadcast", { event: "y-awareness" }, ({ payload }) => {
      this.handleAwarenessFrame(payload as AwarenessFrame);
    });

    channel.on("broadcast", { event: "y-request-state" }, ({ payload }) => {
      this.handleStateRequest(payload as RequestStateFrame);
    });

    channel.on("broadcast", { event: "y-state" }, ({ payload }) => {
      this.handleStateResponse(payload as StateFrame);
    });

    this.channel = channel;
    this.doc.on("updateV2", this.onDocUpdate);
    this.awareness.on("update", this.onAwarenessUpdate);

    // Resolve on success OR terminal failure OR hard timeout — a blocked
    // WebSocket must never hang the caller. On failure we degrade to solo
    // mode: the editor keeps working, just without live peers, and ready()
    // resolves so nothing upstream awaits forever.
    const subscribed = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), SUBSCRIBE_TIMEOUT_MS);
      channel.subscribe((status, err) => {
        if (typeof process !== "undefined" && process.env?.COLLAB_DEBUG) {
          console.debug(
            `[collab:debug] ${this.channelName} status=${status}${err ? ` err=${String(err)}` : ""}`,
          );
        }
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          resolve(true);
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          clearTimeout(timer);
          resolve(false);
        }
      });
    });

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
    void channel.send({ type: "broadcast", event: "y-request-state", payload: req });

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
    this._disposed = true;
    this.connected = false;

    this.doc.off("updateV2", this.onDocUpdate);
    this.awareness.off("update", this.onAwarenessUpdate);

    if (this.aloneTimer) {
      clearTimeout(this.aloneTimer);
      this.aloneTimer = null;
    }
    if (this.awarenessFlushTimer) {
      clearTimeout(this.awarenessFlushTimer);
      this.awarenessFlushTimer = null;
    }
    this.awarenessFlushQueue.clear();

    for (const batch of this.pendingDocBatches.values()) clearTimeout(batch.timer);
    for (const batch of this.pendingStateBatches.values()) clearTimeout(batch.timer);
    this.pendingDocBatches.clear();
    this.pendingStateBatches.clear();

    if (this.channel) {
      void this.client.removeChannel(this.channel);
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

  // ─── Internals ───────────────────────────────────────────────────────────

  private broadcastChunked(event: "y-update" | "y-state", update: Uint8Array, extra?: Record<string, string>): void {
    if (!this.channel) return;
    const b64 = toBase64(update);
    const batchId = this.makeBatchId();

    if (b64.length <= this.chunkSize) {
      const payload: ChunkFrame = { batchId, seq: 0, total: 1, u: b64 };
      void this.channel.send({
        type: "broadcast",
        event,
        payload: extra ? { ...payload, ...extra } : payload,
      });
      return;
    }

    const total = Math.ceil(b64.length / this.chunkSize);
    for (let seq = 0; seq < total; seq++) {
      const slice = b64.slice(seq * this.chunkSize, (seq + 1) * this.chunkSize);
      const payload: ChunkFrame = { batchId, seq, total, u: slice };
      void this.channel.send({
        type: "broadcast",
        event,
        payload: extra ? { ...payload, ...extra } : payload,
      });
    }
  }

  private handleDocFrame(frame: ChunkFrame): void {
    if (this._disposed) return;
    const assembled = this.assemble(this.pendingDocBatches, frame);
    if (!assembled) return;
    const update = fromBase64(assembled);
    // V2 decoder — outbound updates come from doc.on('updateV2'). Mixing V1
    // apply with V2 frames silently corrupts the doc.
    Y.applyUpdateV2(this.doc, update, REMOTE_DOC_ORIGIN);
  }

  private handleAwarenessFrame(frame: AwarenessFrame): void {
    if (this._disposed) return;
    const update = fromBase64(frame.u);
    applyAwarenessUpdate(this.awareness, update, REMOTE_AWARENESS_ORIGIN);
  }

  private handleStateRequest(req: RequestStateFrame): void {
    if (this._disposed || !this.channel) return;
    if (req.clientId === this.clientId) return; // ignore our own (shouldn't fire with self:false)
    const sv = Y.encodeStateAsUpdateV2(this.doc);
    this.broadcastChunked("y-state", sv, { forClientId: req.clientId });
  }

  private handleStateResponse(frame: StateFrame): void {
    if (this._disposed) return;
    if (frame.forClientId !== this.clientId) return;
    if (this.hasInitialState) return; // first answer wins; ignore later ones
    const assembled = this.assemble(this.pendingStateBatches, frame);
    if (!assembled) return;
    const update = fromBase64(assembled);
    // V2 decoder — state snapshots are encoded with encodeStateAsUpdateV2.
    Y.applyUpdateV2(this.doc, update, REMOTE_DOC_ORIGIN);
    this.hasInitialState = true;
    if (this.aloneTimer) {
      clearTimeout(this.aloneTimer);
      this.aloneTimer = null;
    }
    this.resolveReady?.();
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
    if (this._disposed || !this.channel || this.awarenessFlushQueue.size === 0) return;
    const clients = Array.from(this.awarenessFlushQueue);
    this.awarenessFlushQueue.clear();
    const update = encodeAwarenessUpdate(this.awareness, clients);
    const payload: AwarenessFrame = { u: toBase64(update) };
    void this.channel.send({ type: "broadcast", event: "y-awareness", payload });
  }

  private makeBatchId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
