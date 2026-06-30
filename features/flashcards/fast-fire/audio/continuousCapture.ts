// features/flashcards/fast-fire/audio/continuousCapture.ts
//
// CONTINUOUS CAPTURE — the heart of the new audio model (REQUIREMENTS §6, hard-
// requirement #3). One warm mic stream for the WHOLE session (a single
// permission prompt), one MediaRecorder running with 250ms timeslices for the
// entire drill. We never cut the mic on/off per card. Instead we keep every
// 250ms chunk with a wall-clock timestamp, and when we need a card's grading
// clip we ASSEMBLE it from the chunks that overlap [cardStart−1s, cardEnd+1s] —
// so an early start or a trailing word after the buzzer is still captured.
//
// WHY A MODULE SINGLETON, NOT REDUX: blobs are binary; putting them in Redux
// would break serialization and balloon state. This store holds the
// MediaRecorder, the chunk ring, and timing — pure refs. Only durable `file_id`s
// (after upload) ever reach the slice. Hard-requirement #1's "audio blobs live
// in a module-scoped ref store, NOT in Redux" is enforced here.
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

// The id this drill holds the app-wide capture lock under. One drill = one
// continuous recorder = one capture holder for the entire session.
const CAPTURE_ID = "fast-fire-drill";

/** ~1 second of overlap each side of a card window (REQUIREMENTS §6). */
const OVERLAP_MS = 1000;
/** MediaRecorder timeslice — small enough that clip boundaries are tight. */
const TIMESLICE_MS = 250;

interface TimedChunk {
  blob: Blob;
  /** performance.now() at the moment the chunk arrived. */
  t: number;
}

interface CaptureStore {
  stream: MediaStream | null;
  recorder: MediaRecorder | null;
  mimeType: string;
  /** Every 250ms chunk, in arrival order, with a timestamp. */
  chunks: TimedChunk[];
  /** Index of the first chunk that is NOT part of an already-extracted clip —
   *  lets us discard consumed audio so memory doesn't grow without bound while
   *  still keeping the OVERLAP_MS of lookback for the next card's left edge. */
  pruneBefore: number;
  /** performance.now() when recording started (t=0 for the session). */
  startedAt: number;
  /** Live audio level 0..1 for the meter (sampled by the analyser tap). */
  level: number;
  analyser: AnalyserNode | null;
  source: MediaStreamAudioSourceNode | null;
  rafId: number | null;
  levelListeners: Set<(level: number) => void>;
}

const store: CaptureStore = {
  stream: null,
  recorder: null,
  mimeType: "audio/webm",
  chunks: [],
  pruneBefore: 0,
  startedAt: 0,
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
 * Start the ONE continuous recording for the whole session. Acquires the warm
 * mic stream (single prompt), claims the app-wide capture lock, opens a 250ms-
 * timeslice MediaRecorder, and starts the level meter. Idempotent — a second
 * call while already recording is a no-op.
 *
 * Must be called from a user gesture (the Start button) so iOS can resume the
 * shared AudioContext and grant the mic.
 */
export async function startContinuousCapture(): Promise<void> {
  if (store.recorder && store.recorder.state === "recording") return;

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
  store.chunks = [];
  store.pruneBefore = 0;
  store.mimeType = pickMimeType();

  const recorder = new MediaRecorder(stream, { mimeType: store.mimeType });
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      store.chunks.push({ blob: e.data, t: performance.now() });
    }
  };
  store.recorder = recorder;
  store.startedAt = performance.now();
  recorder.start(TIMESLICE_MS);

  startLevelMeter();
}

/**
 * The session origin (performance.now() at recording start). Card windows are
 * measured against this so per-card clips line up with the chunk timeline.
 */
export function captureOrigin(): number {
  return store.startedAt;
}

export function isCapturing(): boolean {
  return store.recorder?.state === "recording";
}

export function subscribeLevel(listener: (level: number) => void): () => void {
  store.levelListeners.add(listener);
  return () => {
    store.levelListeners.delete(listener);
  };
}

/**
 * Assemble the grading clip for a card from the chunks overlapping
 * [startMs − 1s, endMs + 1s] (timestamps are performance.now()). Prepending the
 * recording's chunks preserves the WebM/Opus init segment that lives in chunk 0
 * — WITHOUT it a mid-stream slice is an undecodable fragment (plan risk #4). So
 * a card clip is always `[chunk0 (header) ... overlapping chunks]`. For card 0
 * this is naturally just the head of the stream.
 *
 * Returns null if no audio covers the window (e.g. capture failed) — the caller
 * treats that as "no clip" and records the attempt without one.
 */
export function sliceCardClip(startMs: number, endMs: number): Blob | null {
  if (store.chunks.length === 0) return null;
  const lo = startMs - OVERLAP_MS;
  const hi = endMs + OVERLAP_MS;

  const overlapping = store.chunks.filter((c) => c.t >= lo && c.t <= hi);
  if (overlapping.length === 0) return null;

  // Always prepend chunk 0 (the init segment / WebM header) unless it's already
  // in the window — otherwise the slice can't be decoded by the grader.
  const parts: Blob[] = [];
  const head = store.chunks[0];
  if (!overlapping.includes(head)) parts.push(head.blob);
  for (const c of overlapping) parts.push(c.blob);

  return new Blob(parts, { type: store.mimeType });
}

/**
 * The full-session recording so far (every chunk, decodable end-to-end). Used
 * at finalize to upload as `study_session.session_audio_file_id` (§6/§8).
 */
export function fullSessionClip(): Blob | null {
  if (store.chunks.length === 0) return null;
  return new Blob(
    store.chunks.map((c) => c.blob),
    { type: store.mimeType },
  );
}

/**
 * Play the card-boundary buzzer through the shared AudioContext (REQUIREMENTS §6
 * — "audible buzzer markers" the grader hears as card boundaries). `start` =
 * 880Hz (a bright "go"); `stop` = 440Hz (a lower "done"). Short, ~120ms, quiet.
 * Never throws — a failed beep must never interrupt the drill.
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

/**
 * Stop the continuous recording and release the mic + lock. Returns the full-
 * session blob (captured before teardown) so the caller can upload it. Safe to
 * call multiple times.
 */
export function stopContinuousCapture(): Blob | null {
  const full = fullSessionClip();
  if (store.recorder && store.recorder.state !== "inactive") {
    try {
      store.recorder.stop();
    } catch {
      /* ignore */
    }
  }
  stopLevelMeter();
  store.recorder = null;
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
  if (store.recorder && store.recorder.state !== "inactive") {
    try {
      store.recorder.stop();
    } catch {
      /* ignore */
    }
  }
  stopLevelMeter();
  store.recorder = null;
  if (store.stream) {
    releaseMicStream();
    store.stream = null;
  }
  store.chunks = [];
  releaseCapture(CAPTURE_ID);
}
