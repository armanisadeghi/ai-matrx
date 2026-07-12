// features/audio/sinkAwarePlayer.ts
//
// SinkAwarePlayer — our fork of the Cartesia SDK `WebPlayer` (~140 lines
// upstream), kept drop-in compatible with its playback contract
// (`play(source)` / `pause()` / `resume()` / `toggle()` / `stop()`), but
// OWNING its AudioContext so output-device (speaker) routing is explicit
// instead of relying on a global `AudioContext` constructor monkeypatch.
//
// WHY THE FORK EXISTS (FOUND_DEFECTS D13)
// ---------------------------------------
// The SDK's WebPlayer builds a hard-private AudioContext per `play()` call
// with no accessible handle, so the only way to route it to the user's chosen
// speaker was patching the global `AudioContext` constructor
// (`installAudioContextSinkRouting`, now deleted). That patch was invisible
// action-at-a-distance: every context in the app inherited the sink unless it
// opted out via a sentinel, and a device change could never reach a live
// utterance. This fork:
//
//   1. Applies the preferred output device (from the same store the
//      `userPreferences.audioDevices` module feeds via
//      `providers/AudioDeviceProviderImpl` → `applyOutputDevice`) to its own
//      context at creation, and
//   2. Subscribes to `subscribeOutputDevice` while a context is live, so a
//      device change re-routes MID-UTTERANCE (`AudioContext.setSinkId`).
//
// BROWSER SUPPORT: `AudioContext.setSinkId` is Chromium-only. On Firefox and
// Safari the sink calls feature-detect and no-op — playback continues on the
// SYSTEM DEFAULT device (the user picks output in OS settings), never a crash.
// A real setSinkId failure (device unplugged mid-play) is reported loudly and
// playback continues on the default device.
//
// CONTRACT PARITY WITH THE SDK WebPlayer
// --------------------------------------
// - `play(source)` builds a fresh AudioContext per utterance at the source's
//   sample rate, reads `bufferDuration`-sized chunks, schedules them
//   back-to-back, and resolves when playback finishes.
// - `pause()` / `resume()` / `toggle()` suspend/resume the context and throw
//   "AudioContext not initialized." before the first play — callers guard
//   with hasPlayed refs / try-catch exactly as they did against the SDK.
// - `stop()` closes the context. Unlike the SDK it is close-idempotent: a
//   second stop on an already-closed context is a silent no-op (the SDK threw
//   "Cannot close a closed AudioContext", which every caller had to catch).

import {
  getPreferredOutputDeviceId,
  subscribeOutputDevice,
} from "@/features/audio/audioOutputSink";

/**
 * The slice of the Cartesia `Source` contract the player actually consumes.
 * Structural — `@cartesia/cartesia-js`'s `Source` satisfies it — so the
 * player has no hard SDK type dependency and is unit-testable with a stub.
 */
export interface PlayableSource {
  readonly sampleRate: number;
  /** Read up to `dst.length` samples; resolves with the count actually read.
   *  A short read (< dst.length) signals the end of the source. */
  read(dst: Float32Array): Promise<number>;
  /** Number of samples covering `durationSecs` at this source's sample rate. */
  durationToSampleCount(durationSecs: number): number;
}

/** Minimal AudioContext surface the player uses — injectable for tests. */
export interface SinkAwareAudioContext {
  readonly currentTime: number;
  readonly state: AudioContextState;
  readonly destination: AudioNode;
  createBufferSource(): AudioBufferSourceNode;
  createBuffer(
    channels: number,
    length: number,
    sampleRate: number,
  ): AudioBuffer;
  suspend(): Promise<void>;
  resume(): Promise<void>;
  close(): Promise<void>;
  /** Chromium-only; absent on Firefox/Safari. */
  setSinkId?: (deviceId: string) => Promise<void>;
}

export interface SinkAwarePlayerOptions {
  /** Seconds of audio to buffer per scheduling chunk (same as the SDK). */
  bufferDuration: number;
  /**
   * Test seam: build the per-utterance context. Defaults to
   * `new AudioContext({ sampleRate })`.
   */
  createContext?: (sampleRate: number) => SinkAwareAudioContext;
}

function defaultCreateContext(sampleRate: number): SinkAwareAudioContext {
  return new AudioContext({ sampleRate });
}

export class SinkAwarePlayer {
  #context: SinkAwareAudioContext | null = null;
  #startNextPlaybackAt = 0;
  #bufferDuration: number;
  #createContext: (sampleRate: number) => SinkAwareAudioContext;
  #unsubscribeSink: (() => void) | null = null;

  constructor({ bufferDuration, createContext }: SinkAwarePlayerOptions) {
    this.#bufferDuration = bufferDuration;
    this.#createContext = createContext ?? defaultCreateContext;
  }

  /**
   * Play audio from a source. Resolves when the audio has finished playing.
   * Builds a fresh AudioContext per call (matching the SDK), routed to the
   * user's preferred output device and re-routed live on device change.
   */
  async play(source: PlayableSource): Promise<void> {
    this.#startNextPlaybackAt = 0;
    this.#detachSinkSubscription();
    const context = this.#createContext(source.sampleRate);
    this.#context = context;
    this.#attachSinkRouting(context);

    try {
      const buffer = new Float32Array(
        source.durationToSampleCount(this.#bufferDuration),
      );
      const plays: Promise<void>[] = [];
      while (true) {
        const read = await source.read(buffer);
        // A short read means the source is exhausted — only play what was
        // actually filled, otherwise the tail of the previous chunk repeats.
        const playableAudio = buffer.subarray(0, read);
        plays.push(this.#playBuffer(playableAudio, source.sampleRate));
        if (read < buffer.length) break;
      }
      await Promise.all(plays);
    } finally {
      // The utterance is over (or failed) — stop tracking device changes for
      // this context. The context itself stays open until stop(), matching
      // the SDK (pause/resume after natural completion remain valid).
      this.#detachSinkSubscription();
    }
  }

  /** Suspend playback. Throws before the first play (contract parity). */
  async pause(): Promise<void> {
    await this.#requireContext().suspend();
  }

  /** Resume suspended playback. Throws before the first play. */
  async resume(): Promise<void> {
    await this.#requireContext().resume();
  }

  /** Pause when running, resume otherwise. Throws before the first play. */
  async toggle(): Promise<void> {
    if (this.#requireContext().state === "running") {
      await this.pause();
    } else {
      await this.resume();
    }
  }

  /**
   * Stop playback by closing the context. Throws before the first play
   * (contract parity); a repeat stop on an already-closed context is a
   * silent no-op.
   */
  async stop(): Promise<void> {
    const context = this.#requireContext();
    this.#detachSinkSubscription();
    if (context.state === "closed") return;
    await context.close();
  }

  #requireContext(): SinkAwareAudioContext {
    if (!this.#context) {
      throw new Error("AudioContext not initialized.");
    }
    return this.#context;
  }

  /**
   * Route `context` to the current preferred output device and keep it
   * routed while it lives. Feature-detected: on Firefox/Safari (no
   * `AudioContext.setSinkId`) this is a clean no-op and audio plays on the
   * system default device.
   */
  #attachSinkRouting(context: SinkAwareAudioContext): void {
    if (typeof context.setSinkId !== "function") return;

    const applySink = (deviceId: string) => {
      if (this.#context !== context || context.state === "closed") return;
      // "" = system default. Unlike HTMLMediaElement.setSinkId, passing ""
      // to AudioContext.setSinkId is valid and means the default device.
      context.setSinkId?.(deviceId).catch((err: unknown) => {
        console.error(
          "[SinkAwarePlayer] setSinkId failed — playback continues on the " +
            "system default device. The requested device may be unavailable.",
          { deviceId, error: err },
        );
      });
    };

    // Apply the persisted choice now (skip "" — a fresh context already IS
    // the system default)…
    const initial = getPreferredOutputDeviceId();
    if (initial) applySink(initial);
    // …and follow changes mid-utterance.
    this.#unsubscribeSink = subscribeOutputDevice(applySink);
  }

  #detachSinkSubscription(): void {
    this.#unsubscribeSink?.();
    this.#unsubscribeSink = null;
  }

  async #playBuffer(buf: Float32Array, sampleRate: number): Promise<void> {
    const context = this.#requireContext();
    if (buf.length === 0) return;
    const startAt = this.#startNextPlaybackAt;
    const duration = buf.length / sampleRate;
    this.#startNextPlaybackAt =
      duration + Math.max(context.currentTime, this.#startNextPlaybackAt);

    const sourceNode = context.createBufferSource();
    const audioBuffer = context.createBuffer(1, buf.length, sampleRate);
    audioBuffer.getChannelData(0).set(buf);
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(context.destination);
    sourceNode.start(startAt);
    await new Promise<void>((resolve) => {
      sourceNode.onended = () => resolve();
    });
  }
}
