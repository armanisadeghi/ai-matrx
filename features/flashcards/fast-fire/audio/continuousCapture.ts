// features/flashcards/fast-fire/audio/continuousCapture.ts
//
// PER-CARD CAPTURE — the heart of the audio model (REQUIREMENTS §6). One warm mic
// stream for the WHOLE session (a single permission prompt), and on that stream
// TWO MediaRecorders run side by side:
//
//   1. A FULL-SESSION recorder (continuous, 1s timeslices) whose chunks are
//      assembled ONCE at session end into the durable session blob → uploaded to
//      `study_session.session_audio_file_id` (REQUIREMENTS §6 full-session
//      retention).
//   2. A PER-CARD recorder that is stop()-ed at each card boundary and a fresh
//      one start()-ed for the next card. Each card's blob is therefore a COMPLETE,
//      self-contained, decodable WebM/MP4 — header (EBML/init segment) through the
//      final Cluster — collected in that recorder's `onstop` and handed to the
//      grading lane keyed by card id.
//
// WHY PER-CARD RESTART, NOT MID-STREAM SLICING (the C1 bug this kills): a single
// continuous recorder emits ONE header chunk (chunk 0) carrying the EBML header +
// first Cluster; every later timeslice blob is a raw byte-stream continuation, NOT
// a self-contained Cluster. Concatenating `chunk0 + later chunks` does NOT produce
// a valid container — only card 0 (the head of the stream) decoded; every card
// after it sent the grader an undecodable fragment. Restarting the recorder per
// card makes each card's blob a full container by construction — no header
// surgery, no arrival-timestamp window math.
//
// Restarting the per-card recorder on the ALREADY-WARM stream causes NO permission
// re-prompt (the mic grant is held by `acquireMicStream`; we never touch
// getUserMedia or stop a track here).
//
// OVERLAP: the old ±1s cross-boundary overlap was also broken and is dropped for
// v1 — a clean per-card clip is correct and gradeable. Sample-accurate overlap is
// a documented fast-follow (REQUIREMENTS §14 open-decision #2: upload the whole
// session + slice it server-side). We do NOT fake overlap here.
//
// WHY A MODULE SINGLETON, NOT REDUX: blobs are binary; putting them in Redux would
// break serialization and balloon state. This store holds the two MediaRecorders,
// the full-session chunk buffer, and the per-card blob hand-off — pure refs. Only
// durable `file_id`s (after upload) ever reach the slice.
//
// REUSE, DON'T REBUILD: the mic singleton (`acquireMicStream`/`releaseMicStream`
// — one warm grant, no iOS re-prompt), the app-wide capture lock
// (`claimCapture`/`releaseCapture` — only one recorder app-wide), and the shared
// AudioContext (the level meter + the buzzer oscillator) all come straight from
// `features/audio/**`. This module orchestrates them; it owns no getUserMedia,
// no `new AudioContext`, no `track.stop()`.

import {
  acquireMicStream,
  releaseMicStream,
} from "@/features/audio/micStream";
import {
  getSharedAudioContext,
  resumeSharedAudioContext,
} from "@/features/audio/audioContext";
import { claimCapture, releaseCapture } from "@/features/audio/captureLock";
import { beginRecordingSession } from "@/features/audio/session/audioSessionRegistry";
import type { PlaybackSessionHandle } from "@/features/audio/session/types";

// The id this drill holds the app-wide capture lock under. One drill = one warm
// stream = one capture holder for the entire session.
const CAPTURE_ID = "fast-fire-drill";

/** Full-session recorder timeslice — coarse; it's only flushing the durable buffer. */
const FULL_TIMESLICE_MS = 1000;

interface CaptureStore {
  stream: MediaStream | null;
  mimeType: string;
  /** The continuous full-session recorder (assembled ONCE at session end). */
  fullRecorder: MediaRecorder | null;
  /** Full-session chunks — the ONLY retained buffer (assembled once at finalize). */
  fullChunks: Blob[];
  /** The per-card recorder; stop()-ed and replaced at every card boundary. Its
   *  chunk buffer is closure-local to each recorder (see `startCardClip`). */
  cardRecorder: MediaRecorder | null;
  /** The card id the live per-card recorder is capturing (convenience marker). */
  cardId: string | null;
  /**
   * Where each completed per-card blob is delivered, keyed by card id. The drill
   * registers a resolver before stopping a card; `onstop` fulfills it. Functions
   * can't live in Redux, so the hand-off lives here in the module store.
   */
  cardResolvers: Map<string, (blob: Blob | null) => void>;
  /** The unified-Audio-panel recording session handle (M1) — visible + controllable. */
  audioSession: PlaybackSessionHandle | null;
  /** Live audio level 0..1 for the meter (sampled by the analyser tap). */
  level: number;
  analyser: AnalyserNode | null;
  source: MediaStreamAudioSourceNode | null;
  rafId: number | null;
  levelListeners: Set<(level: number) => void>;
}

const store: CaptureStore = {
  stream: null,
  mimeType: "audio/webm",
  fullRecorder: null,
  fullChunks: [],
  cardRecorder: null,
  cardId: null,
  cardResolvers: new Map(),
  audioSession: null,
  level: 0,
  analyser: null,
  source: null,
  rafId: null,
  levelListeners: new Set(),
};

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    return "audio/webm;codecs=opus";
  }
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return "audio/webm";
}

function emitLevel(level: number): void {
  store.level = level;
  for (const l of store.levelListeners) {
    try {
      l(level);
    } catch {
      // never let a meter listener break capture
    }
  }
}

function startLevelMeter(): void {
  const ctx = getSharedAudioContext();
  if (!ctx || !store.stream) return;
  store.analyser = ctx.createAnalyser();
  store.analyser.fftSize = 256;
  store.source = ctx.createMediaStreamSource(store.stream);
  store.source.connect(store.analyser);
  const data = new Uint8Array(store.analyser.frequencyBinCount);
  const tick = () => {
    if (!store.analyser) return;
    store.analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    emitLevel(data.length > 0 ? sum / data.length / 255 : 0);
    store.rafId = requestAnimationFrame(tick);
  };
  tick();
}

function stopLevelMeter(): void {
  if (store.rafId !== null) {
    cancelAnimationFrame(store.rafId);
    store.rafId = null;
  }
  if (store.source) {
    try {
      store.source.disconnect();
    } catch {
      /* ignore */
    }
    store.source = null;
  }
  if (store.analyser) {
    try {
      store.analyser.disconnect();
    } catch {
      /* ignore */
    }
    store.analyser = null;
  }
  emitLevel(0);
}

/**
 * Start the session capture: acquire the warm mic stream (single prompt), claim
 * the app-wide capture lock, register a visible recording session in the unified
 * Audio panel (M1), open the continuous FULL-SESSION recorder, and start the level
 * meter. The PER-CARD recorder is started separately at each card boundary via
 * `startCardClip`. Idempotent — a second call while already recording is a no-op.
 *
 * Must be called from a user gesture (the Start button) so iOS can resume the
 * shared AudioContext and grant the mic.
 */
export async function startContinuousCapture(): Promise<void> {
  if (store.fullRecorder && store.fullRecorder.state === "recording") return;

  // Claim the app-wide lock first (start-always-wins). `stop` here only stops
  // CAPTURE; the drill hook handles the rest of teardown when notified.
  claimCapture({
    id: CAPTURE_ID,
    label: "FastFire drill",
    stop: () => {
      // Another recorder took the mic — stop ours immediately. The drill hook
      // listens for the abandon path separately.
      hardStopCapture();
    },
  });

  await resumeSharedAudioContext();
  const stream = await acquireMicStream({ channelCount: 1 });
  store.stream = stream;
  store.mimeType = pickMimeType();
  store.fullChunks = [];
  store.cardId = null;
  store.cardResolvers.clear();

  // Visible, controllable recording session in the unified Audio panel (M1). The
  // mic arbiter is captureLock (already claimed) — this only surfaces the session.
  store.audioSession = beginRecordingSession({
    source: "recording",
    label: "FastFire drill",
    controls: { stop: () => hardStopCapture() },
  });

  // The continuous full-session recorder — its chunks are the ONLY retained buffer
  // and are assembled exactly once at finalize.
  const full = new MediaRecorder(stream, { mimeType: store.mimeType });
  full.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) store.fullChunks.push(e.data);
  };
  store.fullRecorder = full;
  full.start(FULL_TIMESLICE_MS);

  startLevelMeter();
}

/**
 * Open a fresh per-card recorder for `cardId`. Stops any previous per-card
 * recorder first (delivering its blob to a registered resolver), then starts a NEW
 * recorder so this card's clip is a complete, self-contained container from header
 * to final Cluster. No timeslice arg → a single blob is emitted on stop.
 *
 * No-op (and resolves the previous card cleanly) if capture isn't running.
 */
export function startCardClip(cardId: string): void {
  // Close out any still-running previous card first.
  if (store.cardRecorder && store.cardRecorder.state !== "inactive") {
    try {
      store.cardRecorder.stop();
    } catch {
      /* the onstop handler delivers whatever it has */
    }
  }
  if (!store.stream) return;

  store.cardId = cardId;

  // CLOSURE-LOCAL state per recorder: bind the card id and a private chunk array
  // to THIS recorder, so the next card's `startCardClip` (which may run before
  // this recorder's `onstop` settles) can never cross-contaminate which card a
  // blob belongs to. The shared `store.cardId` is only a convenience marker.
  const id = cardId;
  const chunks: Blob[] = [];
  const rec = new MediaRecorder(store.stream, { mimeType: store.mimeType });
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  rec.onstop = () => {
    const blob =
      chunks.length > 0 ? new Blob(chunks, { type: store.mimeType }) : null;
    const resolve = store.cardResolvers.get(id);
    if (resolve) {
      store.cardResolvers.delete(id);
      resolve(blob);
    }
  };
  store.cardRecorder = rec;
  // No timeslice: the recorder buffers internally and emits ONE complete,
  // decodable container in `ondataavailable` right before `onstop`.
  rec.start();
}

/**
 * Stop the per-card recorder for `cardId` and resolve with its COMPLETE, self-
 * contained clip (header → final Cluster), decodable on its own. Returns a promise
 * because `MediaRecorder.stop()` flushes the final blob asynchronously via
 * `ondataavailable`/`onstop`. Resolves null if no audio was captured.
 *
 * The drill calls this fire-and-forget at each card boundary; the next card's
 * `startCardClip` opens a fresh recorder.
 */
export function stopCardClip(cardId: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const rec = store.cardRecorder;
    // The live per-card recorder must be the one for this card; if it's already
    // gone or for a different card, there's nothing self-contained to return.
    if (!rec || rec.state === "inactive" || store.cardId !== cardId) {
      resolve(null);
      return;
    }
    store.cardResolvers.set(cardId, resolve);
    try {
      rec.stop();
    } catch {
      store.cardResolvers.delete(cardId);
      resolve(null);
    }
  });
}

export function subscribeLevel(listener: (level: number) => void): () => void {
  store.levelListeners.add(listener);
  return () => {
    store.levelListeners.delete(listener);
  };
}

/**
 * The full-session recording so far (every chunk, decodable end-to-end). Used at
 * finalize to upload as `study_session.session_audio_file_id` (§6/§8). Assembled
 * ONCE from the only retained buffer — no per-card retention, so memory is bounded
 * to one continuous recording's chunks (H2).
 */
export function fullSessionClip(): Blob | null {
  if (store.fullChunks.length === 0) return null;
  return new Blob(store.fullChunks, { type: store.mimeType });
}

/**
 * Play the card-boundary buzzer through the shared AudioContext (REQUIREMENTS §6
 * — "audible buzzer markers" the grader hears as card boundaries). `start` =
 * 880Hz (a bright "go"); `stop` = 440Hz (a lower "done"). Short, ~120ms, quiet.
 * Never throws — a failed beep must never interrupt the drill. The tones land in
 * the full-session recording and the head/tail of per-card clips — fine.
 */
export function playBuzzer(kind: "start" | "stop"): void {
  const ctx = getSharedAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = kind === "start" ? 880 : 440;
    // Quick attack + decay so it reads as a marker, not a sustained tone.
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  } catch {
    // best-effort — silence is fine if Web Audio refuses
  }
}

/** End the unified-Audio-panel recording session (M1), if one is live. */
function endAudioSession(status: "done" | "error" = "done"): void {
  if (store.audioSession) {
    try {
      store.audioSession.end(status);
    } catch {
      /* ignore */
    }
    store.audioSession = null;
  }
}

/** Stop the per-card recorder without resolving (teardown paths). */
function stopCardRecorder(): void {
  if (store.cardRecorder && store.cardRecorder.state !== "inactive") {
    try {
      store.cardRecorder.stop();
    } catch {
      /* ignore */
    }
  }
  store.cardRecorder = null;
  store.cardId = null;
  // Resolve any pending per-card waiters so callers never hang on teardown.
  for (const [, resolve] of store.cardResolvers) resolve(null);
  store.cardResolvers.clear();
}

/**
 * Stop the session capture and release the mic + lock. Returns the full-session
 * blob (captured before teardown) so the caller can upload it. Safe to call
 * multiple times.
 */
export function stopContinuousCapture(): Blob | null {
  const full = fullSessionClip();
  stopCardRecorder();
  if (store.fullRecorder && store.fullRecorder.state !== "inactive") {
    try {
      store.fullRecorder.stop();
    } catch {
      /* ignore */
    }
  }
  stopLevelMeter();
  store.fullRecorder = null;
  endAudioSession("done");
  if (store.stream) {
    // Never stop tracks directly (that defeats the warm-grant keepalive).
    releaseMicStream();
    store.stream = null;
  }
  releaseCapture(CAPTURE_ID);
  return full;
}

/** Hard teardown for the takeover / abandon path — drops everything, no return. */
export function hardStopCapture(): void {
  stopCardRecorder();
  if (store.fullRecorder && store.fullRecorder.state !== "inactive") {
    try {
      store.fullRecorder.stop();
    } catch {
      /* ignore */
    }
  }
  stopLevelMeter();
  store.fullRecorder = null;
  store.fullChunks = [];
  endAudioSession("done");
  if (store.stream) {
    releaseMicStream();
    store.stream = null;
  }
  releaseCapture(CAPTURE_ID);
}
