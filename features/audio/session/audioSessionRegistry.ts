/**
 * audioSessionRegistry — the single, app-wide registry of ALL audio activity.
 *
 * Framework-free singleton (the third member of the audio "lock family" beside
 * `captureLock` and `playbackLock`/`playbackQueue`). It allocates nothing until
 * the first session, holds NO audio itself and imports NO SDK — it only tracks
 * what audio has happened this browser session (in + out, live + history) and
 * how to control each one, so the Audio panel can show and replay everything.
 *
 * Two write modes:
 *   - Imperative (`registerSession` / `updateSession` / `endSession`) for
 *     self-driven producers (the streaming speaker, recorders, podcasts, xAI).
 *   - Declarative (`syncSource`) for the playback QUEUE bridge, which already
 *     maintains its own ordered item list and just projects it in wholesale.
 *
 * Control callbacks live in a side-table keyed by id (functions can't go in
 * Redux). A thin host (`AudioSessionHost`) subscribes and mirrors the
 * serializable snapshot into Redux for the panel.
 *
 * Lockdown: `beginPlaybackSession` is the atomic "claim the playback lock AND
 * register a session" helper. New audio-OUT producers must go through it (or
 * register a session directly) — producing audio with no session trips the
 * runtime bypass guard (`reportAudioBypassViolation`).
 */

import {
  claimPlayback,
  releasePlayback,
} from "@/features/audio/playback/playbackLock";
import type {
  AudioSession,
  AudioSessionControls,
  AudioSessionPatch,
  AudioSessionSource,
  AudioSnapshot,
  PlaybackSessionHandle,
  RegisterSessionInput,
} from "./types";

/**
 * Cap on retained sessions so a long-lived tab can't grow the history without
 * bound. We keep ALL non-terminal sessions plus the most recent terminal ones.
 */
const MAX_SESSIONS = 200;

let sessions: AudioSession[] = [];
const controlsById = new Map<string, AudioSessionControls>();

type Listener = (snapshot: AudioSnapshot) => void;
const listeners = new Set<Listener>();

let seq = 0;
function nextId(prefix = "as"): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

function snapshot(): AudioSnapshot {
  return { sessions: sessions.map((s) => ({ ...s })) };
}

function notify(): void {
  const snap = snapshot();
  listeners.forEach((l) => {
    try {
      l(snap);
    } catch (err) {
      console.error("[audioSessionRegistry] listener error", err);
    }
  });
}

const TERMINAL = new Set(["done", "error"]);

/** Prune oldest terminal sessions when over the cap (live sessions are kept). */
function prune(): void {
  if (sessions.length <= MAX_SESSIONS) return;
  const overflow = sessions.length - MAX_SESSIONS;
  let removed = 0;
  sessions = sessions.filter((s) => {
    if (removed >= overflow) return true;
    if (TERMINAL.has(s.status)) {
      controlsById.delete(s.id);
      removed += 1;
      return false;
    }
    return true;
  });
}

// ─── Imperative API ────────────────────────────────────────────────────────

export function registerSession(input: RegisterSessionInput): string {
  const id = nextId(input.direction === "recording" ? "rec" : "pb");
  const session: AudioSession = {
    id,
    direction: input.direction,
    source: input.source,
    label: input.label,
    text: input.text,
    status: input.status ?? "loading",
    createdAtMs: Date.now(),
    canReplay: input.canReplay,
  };
  sessions = [...sessions, session];
  prune();
  notify();
  return id;
}

export function updateSession(id: string, patch: AudioSessionPatch): void {
  let changed = false;
  sessions = sessions.map((s) => {
    if (s.id !== id) return s;
    changed = true;
    const next = { ...s, ...patch };
    if (patch.status && TERMINAL.has(patch.status) && !next.endedAtMs) {
      next.endedAtMs = Date.now();
    }
    return next;
  });
  if (changed) {
    prune();
    notify();
  }
}

export function endSession(
  id: string,
  finalStatus: "done" | "error" = "done",
  error?: string,
): void {
  updateSession(id, { status: finalStatus, error });
  // Controls are kept (so a terminal session can still expose `replay`), but the
  // live transport (pause/resume/stop) for a finished session is moot.
}

export function setSessionControls(
  id: string,
  controls: AudioSessionControls,
): void {
  controlsById.set(id, controls);
}

export function getSessionControls(id: string): AudioSessionControls | undefined {
  return controlsById.get(id);
}

// ─── Declarative API (queue bridge) ──────────────────────────────────────────

/**
 * Replace ALL sessions belonging to `source` with `incoming`, preserving the
 * original `createdAtMs` for ids that already existed (so ordering is stable as
 * the queue mutates). Sessions of other sources are untouched. Controls for
 * removed ids are dropped.
 */
export function syncSource(
  source: AudioSessionSource,
  incoming: AudioSession[],
): void {
  const prevById = new Map(
    sessions.filter((s) => s.source === source).map((s) => [s.id, s]),
  );
  const incomingIds = new Set(incoming.map((s) => s.id));

  // Drop controls for sessions that left this source.
  for (const prev of prevById.keys()) {
    if (!incomingIds.has(prev)) controlsById.delete(prev);
  }

  const merged = incoming.map((s) => {
    const prev = prevById.get(s.id);
    return prev ? { ...s, createdAtMs: prev.createdAtMs } : s;
  });

  sessions = [...sessions.filter((s) => s.source !== source), ...merged];
  prune();
  notify();
}

// ─── Atomic playback-session helper (lockdown entry point) ───────────────────

/**
 * Begin a playback session: register it in the registry AND claim the app-wide
 * playback lock in one call, so audio-OUT can never be produced without a
 * visible, controllable session. `controls.stop` is required — it's both the
 * panel's Stop and the lock's takeover handler.
 */
export function beginPlaybackSession(input: {
  source: AudioSessionSource;
  label: string;
  text?: string;
  controls: AudioSessionControls & { stop: () => void };
}): PlaybackSessionHandle {
  const id = registerSession({
    direction: "playback",
    source: input.source,
    label: input.label,
    text: input.text,
    status: "loading",
    canReplay: !!input.text,
  });
  setSessionControls(id, input.controls);
  claimPlayback({
    id,
    label: input.label,
    stop: () => {
      try {
        input.controls.stop();
      } catch (err) {
        console.error("[audioSessionRegistry] stop() threw on takeover", err);
      }
    },
  });
  return {
    id,
    update: (patch) => updateSession(id, patch),
    end: (finalStatus = "done", error) => {
      endSession(id, finalStatus, error);
      releasePlayback(id);
    },
  };
}

// ─── Recording-session helper ────────────────────────────────────────────────

/**
 * Begin a recording (audio-IN) session. Unlike playback there is no lock claim
 * here — the mic arbiter is `captureLock`, which the recorder already holds;
 * this only makes the recording visible in the Audio panel (live + history).
 */
export function beginRecordingSession(input: {
  source?: AudioSessionSource;
  label: string;
  controls?: AudioSessionControls;
}): PlaybackSessionHandle {
  const id = registerSession({
    direction: "recording",
    source: input.source ?? "recording",
    label: input.label,
    status: "active",
  });
  if (input.controls) setSessionControls(id, input.controls);
  return {
    id,
    update: (patch) => updateSession(id, patch),
    end: (finalStatus = "done", error) => endSession(id, finalStatus, error),
  };
}

// ─── Reads / subscription ────────────────────────────────────────────────────

export function getAudioSnapshot(): AudioSnapshot {
  return snapshot();
}

export function subscribeAudioSessions(listener: Listener): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => {
    listeners.delete(listener);
  };
}

/** Test/diagnostics escape hatch — clears everything. Not used in product flow. */
export function __resetAudioSessions(): void {
  sessions = [];
  controlsById.clear();
  notify();
}
