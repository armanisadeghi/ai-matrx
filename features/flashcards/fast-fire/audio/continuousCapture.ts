// features/flashcards/fast-fire/audio/continuousCapture.ts
//
// PER-CARD CAPTURE — rebuilt on the Web Audio API (REQUIREMENTS §6, owner
// direction 2026-06-30). One warm mic stream for the WHOLE session (a single
// permission prompt) feeds an AudioWorklet that taps raw PCM into ONE growing
// Float32 buffer with a sample clock. Per-card clips and the full-session
// recording are SAMPLE-ACCURATE SLICES of that buffer, encoded as WAV.
//
// WHY PCM/WAV, NOT MediaRecorder (the bug this kills): MediaRecorder emits codec
// containers (WebM/Opus). A continuous recorder's later timeslices are raw
// byte-stream continuations, not self-contained clusters — concatenated slices
// don't decode; restarting per card produced clips that were full-length or
// silent. Raw PCM has no container: byte offset N maps to sample N at a known
// rate, so a clip is just `buffer.slice(startSample, endSample)`. No codec
// fragments, no chunk-arrival jitter, decodable everywhere. iOS-robust.
//
// PER-CARD GRADING CONTEXT (REQUIREMENTS §6): each per-card clip includes a short
// configurable pad BEFORE the card start and AFTER the card stop, with an audible
// beep SYNTHESIZED INTO the clip at the exact start/stop sample offsets. The beep
// is mixed into the PCM at encode time (sample-accurate, immune to echo-
// cancellation stripping a speaker beep) so the grader always hears the
// boundaries. The learner still hears the live `playBuzzer` for UX. Because
// capture is continuous, the trailing pad is real audio captured during the
// advance — so `stopCardClip` resolves a moment AFTER the card ends (grading is
// fire-and-forget, so this delay is free).
//
// THE ONE CLOCK — why timing can never drift again (the bug this kills): card
// boundaries are marked on the AUDIO HARDWARE CLOCK (`ctx.currentTime`), NOT on
// the buffer write-head (`sampleCount`). The write-head only counts PCM already
// delivered from the worklet to the main thread and appended — it LAGS real audio
// whenever the main thread is busy, and the main thread is busiest at a card
// boundary (that card's grade upload + agent launch just fired). Marking a
// boundary at the lagged write-head put the recorded start/stop BEHIND where the
// learner actually spoke, and — because the live `playBuzzer` runs on the audio
// clock — left the audible buzzer and the clip's beep marker at DIFFERENT real-
// audio positions ("buzzer and timing not in sync"), compounding across skips.
// `audioClockSamples()` derives the offset from `ctx.currentTime` instead, so the
// live buzzer, the recorded audio, and the clip's beep all share ONE clock and
// stay aligned by construction — identically whether the card timed out or the
// learner hit Next.
//
// REUSE, DON'T REBUILD: the mic singleton (`acquireMicStream`/`releaseMicStream`
// — one warm grant, no iOS re-prompt), the app-wide capture lock
// (`claimCapture`/`releaseCapture`), the shared AudioContext, and the unified
// Audio-panel session registry all come straight from `features/audio/**`. The
// WAV encoding + PCM math are the reusable `lib/audio/{wav,pcm}` primitives.
//
// PUBLIC API is unchanged from the MediaRecorder version, so the drill
// orchestrator / timer / slice are untouched: startContinuousCapture,
// startCardClip, stopCardClip, playBuzzer, stopContinuousCapture, hardStopCapture,
// subscribeLevel, fullSessionClip (+ new subscribeDebug / getCaptureDebug for the
// admin debug panel).

import { acquireMicStream, releaseMicStream } from "@/features/audio/micStream";
import {
  getSharedAudioContext,
  resumeSharedAudioContext,
} from "@/features/audio/audioContext";
import { claimCapture, releaseCapture } from "@/features/audio/captureLock";
import { beginRecordingSession } from "@/features/audio/session/audioSessionRegistry";
import type { PlaybackSessionHandle } from "@/features/audio/session/types";
import { makeSineFloat32, mixInto } from "@/lib/audio/pcm";
import { encodeWavFromFloat32 } from "@/lib/audio/wav";

// The id this drill holds the app-wide capture lock under. One drill = one warm
// stream = one capture holder for the entire session.
const CAPTURE_ID = "fast-fire-drill";

/**
 * Per-card grading context: DEFAULT audio kept on each side of the card window
 * (§6 — "~1 second of overlap each side"). Configurable per session via
 * `startContinuousCapture({ padBeforeSec, padAfterSec })` so a mode with a
 * different timing rule can widen/narrow it without forking the core. Kept short
 * on purpose: a large fixed pad captured a fast-answered neighbour's whole answer
 * into this card's clip (the "responses were not the correct clips" bug).
 */
const DEFAULT_PAD_BEFORE_SEC = 1.0;
const DEFAULT_PAD_AFTER_SEC = 1.0;

/** Boundary beep markers synthesized into the clip (the grader hears these). */
const BEEP_START_HZ = 880;
const BEEP_STOP_HZ = 440;
const BEEP_DUR_SEC = 0.15;
const BEEP_AMP = 0.25;

/** WAV target rate — speech-optimal, tiny uploads, universally decodable. */
const WAV_TARGET_RATE = 16000;

/** Initial PCM capacity (30s) before the growable buffer doubles. */
const INITIAL_CAPACITY_SEC = 30;

type CapturePath = "worklet" | "scriptprocessor";

interface CardWindow {
  startSample: number;
  endSample: number | null;
}

interface PendingClip {
  timer: ReturnType<typeof setTimeout> | null;
  resolve: (blob: Blob | null) => void;
}

interface CaptureStore {
  stream: MediaStream | null;
  capturePath: CapturePath | null;
  /** The ONE growing PCM buffer (mono Float32 at ctx.sampleRate). */
  pcm: Float32Array;
  sampleCount: number;
  sampleRate: number;
  /** The AudioContext this capture is bound to — the source of the audio clock. */
  ctx: AudioContext | null;
  /** `ctx.currentTime` captured the instant the graph started recording. Card
   *  boundaries are `round((ctx.currentTime - baseTime) * sampleRate)` — the
   *  authoritative audio-clock position, immune to main-thread write-head lag. */
  baseTime: number;
  /** Per-session grading-context pads (seconds each side of a card window). */
  padBeforeSec: number;
  padAfterSec: number;
  // Web Audio graph nodes (kept so teardown can disconnect them).
  source: MediaStreamAudioSourceNode | null;
  workletNode: AudioWorkletNode | null;
  scriptNode: ScriptProcessorNode | null;
  sinkGain: GainNode | null;
  analyser: AnalyserNode | null;
  rafId: number | null;
  // Per-card windows + deferred clip resolvers, keyed by stable card id.
  cards: Map<string, CardWindow>;
  cardOrder: string[];
  activeCardId: string | null;
  pending: Map<string, PendingClip>;
  // Unified Audio panel handle.
  audioSession: PlaybackSessionHandle | null;
  // Level meter.
  level: number;
  levelListeners: Set<(level: number) => void>;
  // Admin debug.
  debugListeners: Set<(snap: CaptureDebugSnapshot) => void>;
  lastDebugEmit: number;
}

const store: CaptureStore = {
  stream: null,
  capturePath: null,
  pcm: new Float32Array(0),
  sampleCount: 0,
  sampleRate: 0,
  ctx: null,
  baseTime: 0,
  padBeforeSec: DEFAULT_PAD_BEFORE_SEC,
  padAfterSec: DEFAULT_PAD_AFTER_SEC,
  source: null,
  workletNode: null,
  scriptNode: null,
  sinkGain: null,
  analyser: null,
  rafId: null,
  cards: new Map(),
  cardOrder: [],
  activeCardId: null,
  pending: new Map(),
  audioSession: null,
  level: 0,
  levelListeners: new Set(),
  debugListeners: new Set(),
  lastDebugEmit: 0,
};

// ── AudioWorklet processor (loaded once per context via a Blob URL — no public
// asset, no Turbopack config). Posts each render quantum's mono PCM (transferred,
// zero-copy) to the main thread. ──────────────────────────────────────────────
const PCM_WORKLET_SOURCE = `
class PcmRecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0 && input[0]) {
      const copy = new Float32Array(input[0]);
      this.port.postMessage(copy, [copy.buffer]);
    }
    return true;
  }
}
registerProcessor('pcm-recorder', PcmRecorderProcessor);
`;

let workletModulePromise: Promise<boolean> | null = null;
/** The context the cached module promise belongs to. The shared AudioContext can
 *  be RECREATED (iOS/Safari may close it under memory pressure / backgrounding,
 *  and `getSharedAudioContext` re-mints a fresh one), and an `addModule` is bound
 *  to a specific context — a stale cached promise would let us build an
 *  AudioWorkletNode on a context that never registered the processor. */
let workletModuleCtx: AudioContext | null = null;

/** Load the PCM worklet module once PER context. Returns false (so the caller can
 *  fall back to ScriptProcessor) if AudioWorklet is unavailable. */
async function ensureWorkletModule(ctx: AudioContext): Promise<boolean> {
  if (!ctx.audioWorklet) return false;
  if (workletModuleCtx !== ctx) {
    // Context changed (or first load) — the old module promise is for a dead
    // context; reload on this one.
    workletModulePromise = null;
    workletModuleCtx = ctx;
  }
  if (!workletModulePromise) {
    workletModulePromise = (async () => {
      const url = URL.createObjectURL(
        new Blob([PCM_WORKLET_SOURCE], { type: "text/javascript" }),
      );
      try {
        await ctx.audioWorklet.addModule(url);
        return true;
      } catch (err) {
        console.error("[fastfire.capture] worklet addModule failed:", err);
        workletModulePromise = null; // allow a retry next session
        workletModuleCtx = null;
        return false;
      } finally {
        URL.revokeObjectURL(url);
      }
    })();
  }
  return workletModulePromise;
}

// ── PCM buffer (growable, doubling capacity) ──────────────────────────────────
/** Hard safety cap so a forgotten/runaway session can't grow the buffer without
 *  bound (~30 min at 48kHz ≈ 345MB). Fast Fire drills are far shorter by design;
 *  this only guards against an abandoned, never-stopped capture. */
const MAX_BUFFER_SEC = 1800;
let bufferCapWarned = false;

function appendFrame(frame: Float32Array): void {
  if (frame.length === 0) return;
  const maxSamples = Math.round((store.sampleRate || 48000) * MAX_BUFFER_SEC);
  if (store.sampleCount + frame.length > maxSamples) {
    if (!bufferCapWarned) {
      bufferCapWarned = true;
      console.warn(
        `[fastfire.capture] PCM buffer hit the ${MAX_BUFFER_SEC}s safety cap — dropping further audio. End the session.`,
      );
    }
    return;
  }
  if (store.sampleCount + frame.length > store.pcm.length) {
    let cap = Math.max(store.pcm.length, 1);
    while (store.sampleCount + frame.length > cap) cap *= 2;
    const grown = new Float32Array(cap);
    grown.set(store.pcm.subarray(0, store.sampleCount));
    store.pcm = grown;
  }
  store.pcm.set(frame, store.sampleCount);
  store.sampleCount += frame.length;
}

// ── Level meter (AnalyserNode tap, rAF) — also drives debug emission ──────────
function emitLevel(level: number): void {
  store.level = level;
  for (const l of store.levelListeners) {
    try {
      l(level);
    } catch {
      /* never let a meter listener break capture */
    }
  }
}

function startLevelMeter(ctx: AudioContext): void {
  if (!store.source) return;
  store.analyser = ctx.createAnalyser();
  store.analyser.fftSize = 256;
  store.source.connect(store.analyser);
  const data = new Uint8Array(store.analyser.frequencyBinCount);
  const tick = () => {
    if (!store.analyser) return;
    store.analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    emitLevel(data.length > 0 ? sum / data.length / 255 : 0);
    maybeEmitDebug();
    store.rafId = requestAnimationFrame(tick);
  };
  tick();
}

function stopLevelMeter(): void {
  if (store.rafId !== null) {
    cancelAnimationFrame(store.rafId);
    store.rafId = null;
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

/** True while the continuous PCM capture graph is wired and recording. */
export function isContinuousCaptureActive(): boolean {
  return store.capturePath !== null;
}

/**
 * Start the session capture: acquire the warm mic stream (single prompt), claim
 * the app-wide capture lock, register a visible recording session, and wire the
 * mic → AudioWorklet (PCM tap) + AnalyserNode (level meter). Idempotent.
 *
 * Must be called from a user gesture (Start) so iOS can resume the AudioContext
 * and grant the mic. Throws if the mic graph cannot be started (callers must
 * catch — a silent no-op used to leave voice-test UIs in a broken "capturing"
 * state with no audio).
 *
 * `opts.padBeforeSec` / `opts.padAfterSec` set the per-session grading-context
 * pad on each side of a card window (config-driven; defaults ~1s). A mode with a
 * different timing rule tunes these without forking the core.
 */
export interface StartCaptureOptions {
  padBeforeSec?: number;
  padAfterSec?: number;
}

export async function startContinuousCapture(
  opts: StartCaptureOptions = {},
): Promise<void> {
  if (store.capturePath) return; // already capturing

  claimCapture({
    id: CAPTURE_ID,
    label: "FastFire drill",
    stop: () => hardStopCapture(),
  });

  await resumeSharedAudioContext();
  const ctx = getSharedAudioContext();
  if (!ctx) {
    console.error("[fastfire.capture] no AudioContext — capture unavailable");
    releaseCapture(CAPTURE_ID);
    throw new Error("Audio capture is unavailable in this browser.");
  }

  const stream = await acquireMicStream({ channelCount: 1 });
  store.stream = stream;
  store.ctx = ctx;
  store.sampleRate = ctx.sampleRate;
  store.padBeforeSec =
    typeof opts.padBeforeSec === "number" && opts.padBeforeSec >= 0
      ? opts.padBeforeSec
      : DEFAULT_PAD_BEFORE_SEC;
  store.padAfterSec =
    typeof opts.padAfterSec === "number" && opts.padAfterSec >= 0
      ? opts.padAfterSec
      : DEFAULT_PAD_AFTER_SEC;
  store.pcm = new Float32Array(
    Math.round(ctx.sampleRate * INITIAL_CAPACITY_SEC),
  );
  store.sampleCount = 0;
  // The audio-clock time base: every card boundary is measured against this, so
  // it is set the instant before the graph starts pumping samples.
  store.baseTime = ctx.currentTime;
  bufferCapWarned = false;
  store.cards.clear();
  store.cardOrder = [];
  store.activeCardId = null;
  store.pending.clear();

  store.source = ctx.createMediaStreamSource(stream);

  // A muted gain → destination keeps the worklet/script node's process() pumping
  // in every browser (a node connected to nothing may be culled).
  store.sinkGain = ctx.createGain();
  store.sinkGain.gain.value = 0;
  store.sinkGain.connect(ctx.destination);

  const haveWorklet = await ensureWorkletModule(ctx);
  let started = false;
  if (haveWorklet) {
    try {
      const node = new AudioWorkletNode(ctx, "pcm-recorder", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
      });
      node.port.onmessage = (e: MessageEvent<Float32Array>) =>
        appendFrame(e.data);
      store.source.connect(node);
      node.connect(store.sinkGain);
      store.workletNode = node;
      store.capturePath = "worklet";
      started = true;
    } catch (err) {
      // e.g. InvalidStateError if the module isn't registered on THIS context
      // (a recreated context that slipped past the cache guard). Reset the cache
      // and fall through to the ScriptProcessor path so capture still works.
      console.error(
        "[fastfire.capture] AudioWorkletNode failed — ScriptProcessor fallback:",
        err,
      );
      workletModulePromise = null;
      workletModuleCtx = null;
    }
  }
  if (!started) {
    // Universal fallback (older engines / worklet failure): ScriptProcessorNode.
    const node = ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (e: AudioProcessingEvent) => {
      appendFrame(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    store.source.connect(node);
    node.connect(store.sinkGain);
    store.scriptNode = node;
    store.capturePath = "scriptprocessor";
  }

  store.audioSession = beginRecordingSession({
    source: "recording",
    label: "FastFire drill",
    controls: { stop: () => hardStopCapture() },
  });

  startLevelMeter(ctx);
  maybeEmitDebug(true);

  if (!store.capturePath) {
    hardStopCapture();
    throw new Error("Could not start the microphone capture graph.");
  }
}

/**
 * The authoritative recording position RIGHT NOW, in samples, on the audio
 * hardware clock — `round((ctx.currentTime - baseTime) * sampleRate)`. This is
 * what every card boundary is marked with. Unlike `store.sampleCount` (the
 * write-head, which lags whenever the main thread is busy — worst at a card
 * boundary), this tracks real audio time, so a boundary marked here lands at the
 * same real-audio position as the audible buzzer and the captured speech. Clamped
 * to ≥ 0; never past the write-head is NOT enforced here (the pad timeout ensures
 * the buffer catches up before we slice).
 */
function audioClockSamples(): number {
  if (!store.ctx || store.sampleRate <= 0) return store.sampleCount;
  const offset = Math.round(
    (store.ctx.currentTime - store.baseTime) * store.sampleRate,
  );
  return Math.max(0, offset);
}

/** Mark the start sample of `cardId`'s answer window. No recorder to start — the
 *  continuous PCM buffer is already running; we only record the boundary on the
 *  audio clock (see `audioClockSamples`). */
export function startCardClip(cardId: string): void {
  if (!store.capturePath) return;
  if (!store.cards.has(cardId)) store.cardOrder.push(cardId);
  store.cards.set(cardId, { startSample: audioClockSamples(), endSample: null });
  store.activeCardId = cardId;
  maybeEmitDebug(true);
}

/**
 * Close `cardId`'s answer window and resolve with its WAV clip — the PCM span
 * `[start - PAD_BEFORE, end + PAD_AFTER]` with boundary beeps mixed in. Resolves
 * ~PAD_AFTER seconds later so the trailing pad (captured during the advance) is
 * real audio. Grading is fire-and-forget, so the delay costs nothing. Resolves
 * null if the card was never opened or capture is gone.
 */
export function stopCardClip(cardId: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const win = store.cards.get(cardId);
    if (!win || !store.capturePath) {
      resolve(null);
      return;
    }
    win.endSample = audioClockSamples();
    if (store.activeCardId === cardId) store.activeCardId = null;
    maybeEmitDebug(true);

    // Wait for the post-card pad to be captured, then build the clip. Tracked so
    // teardown can flush (last card) or discard (abandon) it deterministically.
    const padMs = store.padAfterSec * 1000;
    const timer = setTimeout(() => {
      const pending = store.pending.get(cardId);
      if (!pending) return; // already flushed by teardown
      store.pending.delete(cardId);
      resolve(buildCardClip(cardId));
    }, padMs);
    store.pending.set(cardId, { timer, resolve });
  });
}

/** Slice the PCM for a card window, mix in the boundary beeps, encode WAV. */
function buildCardClip(cardId: string): Blob | null {
  const win = store.cards.get(cardId);
  if (!win || store.sampleCount === 0) return null;
  const rate = store.sampleRate;
  const end = win.endSample ?? store.sampleCount;
  const clipStart = Math.max(
    0,
    Math.floor(win.startSample - store.padBeforeSec * rate),
  );
  const clipEnd = Math.min(
    store.sampleCount,
    Math.ceil(end + store.padAfterSec * rate),
  );
  if (clipEnd <= clipStart) return null;

  const clip = store.pcm.slice(clipStart, clipEnd);
  // Boundary beeps at the REAL card start/stop offsets within the clip, clamped
  // so the whole beep fits (the last card's post-pad can be clipped to the buffer
  // end, putting the stop offset AT clip.length where mixInto would drop it).
  const beepLen = Math.round(BEEP_DUR_SEC * rate);
  const startAt = Math.max(
    0,
    Math.min(win.startSample - clipStart, clip.length - beepLen),
  );
  const stopAt = Math.max(0, Math.min(end - clipStart, clip.length - beepLen));
  mixInto(
    clip,
    makeSineFloat32(BEEP_START_HZ, BEEP_DUR_SEC, rate, BEEP_AMP),
    startAt,
  );
  mixInto(
    clip,
    makeSineFloat32(BEEP_STOP_HZ, BEEP_DUR_SEC, rate, BEEP_AMP),
    stopAt,
  );
  return encodeWavFromFloat32(clip, rate, { targetRate: WAV_TARGET_RATE });
}

export function subscribeLevel(listener: (level: number) => void): () => void {
  store.levelListeners.add(listener);
  return () => {
    store.levelListeners.delete(listener);
  };
}

/**
 * The full-session recording so far, encoded as one WAV (REQUIREMENTS §6/§8),
 * with each card's start/stop boundary beeps mixed in at their audio-clock
 * offsets. `slice` returns a COPY, so mixing the markers never corrupts the live
 * buffer (per-card clips still slice clean PCM). The markers give the end-of-
 * session coach — and the learner scrubbing the recording — real, aligned card
 * boundaries instead of one undifferentiated block of speech.
 */
export function fullSessionClip(): Blob | null {
  if (store.sampleCount === 0) return null;
  const rate = store.sampleRate;
  const full = store.pcm.slice(0, store.sampleCount);
  const beepLen = Math.round(BEEP_DUR_SEC * rate);
  const startBeep = makeSineFloat32(BEEP_START_HZ, BEEP_DUR_SEC, rate, BEEP_AMP);
  const stopBeep = makeSineFloat32(BEEP_STOP_HZ, BEEP_DUR_SEC, rate, BEEP_AMP);
  for (const cardId of store.cardOrder) {
    const win = store.cards.get(cardId);
    if (!win) continue;
    // Clamp each marker so the whole beep fits inside the buffer (the audio clock
    // can sit a quantum ahead of the write-head at the tail).
    const startAt = Math.max(0, Math.min(win.startSample, full.length - beepLen));
    mixInto(full, startBeep, startAt);
    if (win.endSample !== null) {
      const stopAt = Math.max(0, Math.min(win.endSample, full.length - beepLen));
      mixInto(full, stopBeep, stopAt);
    }
  }
  return encodeWavFromFloat32(full, rate, { targetRate: WAV_TARGET_RATE });
}

/**
 * The learner-audible cue kinds (UX only — the grader's boundary markers are
 * synthesized into the clip separately in buildCardClip):
 *   - `start`   : card begins — light rising blip.
 *   - `stop`    : card closed by a manual "Next" — gentle falling blip (the
 *                 learner chose to move on, so no alarm).
 *   - `warning` : "a few seconds left" — a single light, higher blip, same
 *                 family as `start` so it reads as a nudge, not an error.
 *   - `timesup` : time RAN OUT — a prominent, unmistakable buzzer (harsher tone,
 *                 louder, longer, two pulses) so a learner still mid-answer
 *                 cannot miss that the window closed.
 */
export type BuzzerKind = "start" | "stop" | "warning" | "timesup";

/** One short tone. `type`/`peak`/`attack`/`release` shape it. Best-effort. */
function playTone(
  ctx: AudioContext,
  opts: {
    freq: number;
    type: OscillatorType;
    peak: number;
    durSec: number;
    startAt?: number;
  },
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type;
  osc.frequency.value = opts.freq;
  const at = opts.startAt ?? ctx.currentTime;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(opts.peak, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + opts.durSec);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(at);
  osc.stop(at + opts.durSec + 0.02);
}

/**
 * Play a learner cue audibly through the shared AudioContext. Never throws —
 * silence is an acceptable degradation if Web Audio refuses.
 */
export function playBuzzer(kind: BuzzerKind): void {
  const ctx = getSharedAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    switch (kind) {
      case "start":
        playTone(ctx, { freq: BEEP_START_HZ, type: "sine", peak: 0.15, durSec: 0.13 });
        return;
      case "stop":
        playTone(ctx, { freq: BEEP_STOP_HZ, type: "sine", peak: 0.15, durSec: 0.13 });
        return;
      case "warning":
        // Light, higher single blip — a nudge, not an alarm.
        playTone(ctx, { freq: 1174, type: "sine", peak: 0.12, durSec: 0.12 });
        return;
      case "timesup":
        // Prominent two-pulse buzzer — harsher `square` timbre, louder, longer.
        playTone(ctx, { freq: 320, type: "square", peak: 0.22, durSec: 0.26, startAt: now });
        playTone(ctx, { freq: 240, type: "square", peak: 0.22, durSec: 0.34, startAt: now + 0.3 });
        return;
    }
  } catch {
    /* best-effort — silence is fine if Web Audio refuses */
  }
}

// ── Teardown ──────────────────────────────────────────────────────────────────
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

/** Resolve every pending per-card clip. `flush` = build it from the buffer NOW
 *  (clean finalize keeps the last card's grade); otherwise resolve null (abandon
 *  discards in-flight clips). Always clears the pad timers. */
function settlePending(flush: boolean): void {
  for (const [cardId, pending] of store.pending) {
    if (pending.timer) clearTimeout(pending.timer);
    pending.resolve(flush ? buildCardClip(cardId) : null);
  }
  store.pending.clear();
}

function disconnectGraph(): void {
  for (const node of [
    store.workletNode,
    store.scriptNode,
    store.source,
    store.sinkGain,
  ]) {
    if (node) {
      try {
        node.disconnect();
      } catch {
        /* ignore */
      }
    }
  }
  if (store.workletNode) {
    try {
      store.workletNode.port.onmessage = null;
    } catch {
      /* ignore */
    }
  }
  if (store.scriptNode) store.scriptNode.onaudioprocess = null;
  store.workletNode = null;
  store.scriptNode = null;
  store.source = null;
  store.sinkGain = null;
}

/**
 * Stop the session capture and release the mic + lock. Builds + returns the
 * full-session WAV (before teardown) so the caller can upload it. Flushes any
 * pending last-card clip so its grade still fires. Safe to call multiple times.
 */
export function stopContinuousCapture(): Blob | null {
  if (!store.capturePath) return null;
  const full = fullSessionClip();
  settlePending(true); // build last-card clips from the buffer BEFORE clearing
  stopLevelMeter();
  disconnectGraph();
  endAudioSession("done");
  if (store.stream) {
    releaseMicStream(); // never stop tracks directly (keepalive owns that)
    store.stream = null;
  }
  releaseCapture(CAPTURE_ID);
  store.capturePath = null;
  store.pcm = new Float32Array(0);
  store.sampleCount = 0;
  store.ctx = null;
  store.baseTime = 0;
  // Clear the per-card windows too (parity with hardStopCapture) so a debug read
  // between sessions never reports stale cards from the prior drill.
  store.cards.clear();
  store.cardOrder = [];
  store.activeCardId = null;
  maybeEmitDebug(true);
  return full;
}

/** Hard teardown for the takeover / abandon path — discards everything, no return. */
export function hardStopCapture(): void {
  if (!store.capturePath && store.sampleCount === 0 && !store.stream) return;
  settlePending(false); // discard in-flight clips (deliberate abandon)
  stopLevelMeter();
  disconnectGraph();
  endAudioSession("done");
  if (store.stream) {
    releaseMicStream();
    store.stream = null;
  }
  releaseCapture(CAPTURE_ID);
  store.capturePath = null;
  store.pcm = new Float32Array(0);
  store.sampleCount = 0;
  store.ctx = null;
  store.baseTime = 0;
  store.cards.clear();
  store.cardOrder = [];
  store.activeCardId = null;
  maybeEmitDebug(true);
}

// ── Admin debug (Step 6 — surface internal state; gated by the panel, not here) ─
export interface CaptureDebugCard {
  cardId: string;
  startSample: number;
  endSample: number | null;
  durationSec: number | null;
  clipReady: boolean;
}

export interface CaptureDebugSnapshot {
  capturePath: CapturePath | null;
  sampleRate: number;
  sampleCount: number;
  durationSec: number;
  bufferBytes: number;
  level: number;
  activeCardId: string | null;
  pendingCount: number;
  cards: CaptureDebugCard[];
}

export function getCaptureDebug(): CaptureDebugSnapshot {
  const rate = store.sampleRate || 1;
  return {
    capturePath: store.capturePath,
    sampleRate: store.sampleRate,
    sampleCount: store.sampleCount,
    durationSec: store.sampleCount / rate,
    bufferBytes: store.pcm.byteLength,
    level: store.level,
    activeCardId: store.activeCardId,
    pendingCount: store.pending.size,
    cards: store.cardOrder.flatMap((cardId) => {
      const w = store.cards.get(cardId);
      if (!w) return [];
      return [
        {
          cardId,
          startSample: w.startSample,
          endSample: w.endSample,
          durationSec:
            w.endSample !== null ? (w.endSample - w.startSample) / rate : null,
          clipReady: w.endSample !== null && !store.pending.has(cardId),
        },
      ];
    }),
  };
}

export function subscribeDebug(
  listener: (snap: CaptureDebugSnapshot) => void,
): () => void {
  store.debugListeners.add(listener);
  listener(getCaptureDebug());
  return () => {
    store.debugListeners.delete(listener);
  };
}

/** Emit a debug snapshot, throttled to ~8Hz unless `force`d (boundary events). */
function maybeEmitDebug(force = false): void {
  if (store.debugListeners.size === 0) return;
  const now = Date.now();
  if (!force && now - store.lastDebugEmit < 125) return;
  store.lastDebugEmit = now;
  const snap = getCaptureDebug();
  for (const l of store.debugListeners) {
    try {
      l(snap);
    } catch {
      /* never let a debug listener break capture */
    }
  }
}
