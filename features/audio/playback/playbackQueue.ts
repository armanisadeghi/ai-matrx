/**
 * playbackQueue — the single, app-wide audio playback queue.
 *
 * Framework-free singleton (the playback twin of `captureLock`). Every "speak
 * this" request becomes an item; audio plays ONE at a time. New requests while
 * something is playing are appended (queued, never overlapped). Finished items
 * stay in history (status `done`) until cleared so the UI can offer replay.
 *
 * Providers plug in via `PlaybackAdapter`s, so the queue never knows about
 * Cartesia WebSockets or Groq blobs.
 *
 * A thin host (`AudioPlaybackHost`) subscribes and mirrors snapshots into Redux
 * for the window-panel UI; consumers drive it through `useAudioPlayback`.
 */

import { claimPlayback, releasePlayback } from "./playbackLock";
import type {
  ActivePlayback,
  PlaybackAdapter,
  PlaybackItem,
  PlaybackProvider,
  PlaybackRequest,
  PlaybackSnapshot,
} from "./types";

/** This queue's identity in the app-wide playback lock. */
const QUEUE_HOLDER_ID = "playback-queue";

// Adapters are loaded lazily on first use so the heavy provider SDKs (Cartesia
// WebSocket client, etc.) stay OUT of the app shell — this module is imported by
// the always-mounted AudioPlaybackHost. Nothing TTS loads until the first
// `speak`. Cached after first load (engage once, stay engaged).
const adapterCache = new Map<PlaybackProvider, PlaybackAdapter>();

async function getAdapter(
  provider: PlaybackProvider,
): Promise<PlaybackAdapter> {
  const cached = adapterCache.get(provider);
  if (cached) return cached;
  let adapter: PlaybackAdapter;
  switch (provider) {
    case "cartesia":
      adapter = (await import("./adapters/cartesiaAdapter")).cartesiaAdapter;
      break;
    case "groq":
      adapter = (await import("./adapters/groqAdapter")).groqAdapter;
      break;
    default:
      throw new Error(`Unknown playback provider: ${provider}`);
  }
  adapterCache.set(provider, adapter);
  return adapter;
}

type Listener = (snapshot: PlaybackSnapshot) => void;

let items: PlaybackItem[] = [];
let currentId: string | null = null;
let rate = 1;
let active: ActivePlayback | null = null;
let runToken = 0;
const listeners = new Set<Listener>();

let seq = 0;
function nextId(): string {
  seq += 1;
  return `pb_${Date.now().toString(36)}_${seq}`;
}

function snapshot(): PlaybackSnapshot {
  return { items: items.map((i) => ({ ...i })), currentId, rate };
}

function notify(): void {
  const snap = snapshot();
  listeners.forEach((l) => {
    try {
      l(snap);
    } catch (err) {
      console.error("[playbackQueue] listener error", err);
    }
  });
}

function patch(id: string, changes: Partial<PlaybackItem>): void {
  items = items.map((i) => (i.id === id ? { ...i, ...changes } : i));
}

function isBusy(): boolean {
  return active !== null || currentId !== null;
}

/** Begin playing a specific item id, taking over any active playback. */
async function startItem(id: string): Promise<void> {
  const item = items.find((i) => i.id === id);
  if (!item) return;

  // Claim app-wide playback BEFORE producing audio — this stops any other
  // playback path (streaming auto-voice, etc.) so two voices can never overlap.
  // Re-claiming with our own id (item→item within the queue) is a no-op refresh.
  claimPlayback({
    id: QUEUE_HOLDER_ID,
    label: "Playback queue",
    stop: forcePreemptFromLock,
  });

  // Take over anything currently active.
  if (active) {
    const prev = active;
    active = null;
    try {
      await prev.stop();
    } catch {
      /* noop */
    }
  }

  const token = ++runToken;
  currentId = id;
  patch(id, { status: "loading", error: undefined });
  notify();

  const stale = () => token !== runToken;

  try {
    const adapter = await getAdapter(item.provider);
    if (stale()) return;
    const handle = await adapter.start(
      item,
      {
        onLoading: () => {
          if (stale()) return;
          patch(id, { status: "loading" });
          notify();
        },
        onPlaying: () => {
          if (stale()) return;
          patch(id, { status: "playing" });
          notify();
        },
        onEnded: () => {
          if (stale()) return;
          patch(id, { status: "done" });
          active = null;
          void advance();
        },
        onError: (message: string) => {
          if (stale()) return;
          patch(id, { status: "error", error: message });
          active = null;
          void advance();
        },
      },
      rate,
    );

    if (stale()) {
      // Taken over while we were connecting — discard this handle.
      try {
        await handle.stop();
      } catch {
        /* noop */
      }
      return;
    }
    active = handle;
  } catch (err) {
    if (stale()) return;
    patch(id, {
      status: "error",
      error: err instanceof Error ? err.message : "Playback failed",
    });
    active = null;
    void advance();
  }
}

/** Move to the next queued item, or go idle (releasing the playback lock). */
async function advance(): Promise<void> {
  const next = items.find((i) => i.status === "queued");
  if (next) {
    await startItem(next.id);
  } else {
    currentId = null;
    releasePlayback(QUEUE_HOLDER_ID);
    notify();
  }
}

/**
 * Called by the playback lock when ANOTHER path (e.g. streaming auto-voice)
 * takes over. Stop our audio and drop the queue — the user deliberately started
 * something else. Does NOT touch the lock (it already cleared us).
 */
function forcePreemptFromLock(): void {
  runToken += 1;
  if (active) {
    const prev = active;
    active = null;
    try {
      void prev.stop();
    } catch {
      /* noop */
    }
  }
  items = [];
  currentId = null;
  notify();
}

export interface EnqueueResult {
  id: string;
}

/** Add a request to the queue. Plays immediately if nothing is active. */
export function enqueuePlayback(request: PlaybackRequest): EnqueueResult {
  const id = nextId();
  const item: PlaybackItem = {
    ...request,
    id,
    status: "queued",
    enqueuedAtMs: Date.now(),
  };
  items = [...items, item];
  notify();
  if (!isBusy()) {
    void startItem(id);
  }
  return { id };
}

export async function pausePlayback(): Promise<void> {
  if (!active || !currentId) return;
  await active.pause();
  patch(currentId, { status: "paused" });
  notify();
}

export async function resumePlayback(): Promise<void> {
  if (!active || !currentId) return;
  await active.resume();
  patch(currentId, { status: "playing" });
  notify();
}

/** Stop the active item (marks it done) and advance to the next queued item. */
export async function skipPlayback(): Promise<void> {
  if (currentId) patch(currentId, { status: "done" });
  if (active) {
    const prev = active;
    active = null;
    try {
      await prev.stop();
    } catch {
      /* noop */
    }
  }
  await advance();
}

/** Play (or replay) a specific item now, taking over anything active. */
export async function playPlaybackItem(id: string): Promise<void> {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  // Replay finished/errored items by resetting them to queued.
  if (item.status === "done" || item.status === "error") {
    patch(id, { status: "queued", error: undefined });
  }
  if (currentId && currentId !== id) {
    patch(currentId, { status: "done" });
  }
  await startItem(id);
}

/** Remove an item. If it's the active one, advance. */
export async function removePlaybackItem(id: string): Promise<void> {
  if (id === currentId) {
    await skipPlayback();
    items = items.filter((i) => i.id !== id);
    notify();
    return;
  }
  items = items.filter((i) => i.id !== id);
  notify();
}

/** Stop everything and clear the queue + history. */
export async function clearPlayback(): Promise<void> {
  runToken += 1;
  if (active) {
    const prev = active;
    active = null;
    try {
      await prev.stop();
    } catch {
      /* noop */
    }
  }
  items = [];
  currentId = null;
  releasePlayback(QUEUE_HOLDER_ID);
  notify();
}

export function setPlaybackRate(value: number): void {
  rate = Math.max(0.25, Math.min(4, value));
  active?.setRate?.(rate);
  notify();
}

export function getPlaybackSnapshot(): PlaybackSnapshot {
  return snapshot();
}

export function subscribePlayback(listener: Listener): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => {
    listeners.delete(listener);
  };
}
