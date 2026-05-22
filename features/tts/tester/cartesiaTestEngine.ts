"use client";

/**
 * cartesiaTestEngine — a thin, config-driven Cartesia TTS playback runner for
 * the admin Voice Tester. It exists to make every knob that affects perceived
 * quality observable side-by-side:
 *
 *   - model id           (sonic-2 / sonic-3 / sonic-3.5 / turbo)
 *   - voice id
 *   - speed / language
 *   - server buffering   (maxBufferDelayMs: 0 = custom/immediate, >0 = managed)
 *   - client playback buffer (WebPlayer bufferDuration) ← prime suspect for the
 *                            choppy "pauses" in the standard path (0.25s)
 *
 * It also reports time-to-first-audio and total synth time so tradeoffs are
 * measurable, not just audible. This is deliberately standalone (not wired into
 * any production hook) so we can settle the ideal Sonic 3.5 config before
 * changing the shared TTS path.
 */

import cartesia from "@/lib/cartesia/client";
import { WebPlayer } from "@cartesia/cartesia-js";
import Source from "@cartesia/cartesia-js/wrapper/source";
import {
  AudioEncoding,
  Language,
  OutputContainer,
} from "@/lib/cartesia/cartesia.types";
import { availableVoices } from "@/lib/cartesia/voices";

export type TtsSpeed = "slow" | "normal" | "fast";

export const TEST_MODEL_OPTIONS: ReadonlyArray<{ value: string; label: string }> =
  [
    { value: "sonic-3.5", label: "Sonic 3.5 (latest)" },
    { value: "sonic-3", label: "Sonic 3" },
    { value: "sonic-2-2025-03-07", label: "Sonic 2" },
    { value: "sonic-turbo-2025-03-07", label: "Sonic Turbo" },
  ];

export const STUDIO_VOICE_ID = "a0e99841-438c-4a64-b679-ae501e7d6091";
export const DEFAULT_VOICE_ID = "156fb8d2-335b-4950-9cb3-a2d33befec77";

/** Voice dropdown: the two voices in play first, then the rest of the library. */
export const TEST_VOICE_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: STUDIO_VOICE_ID, label: "Studio voice (current studio Read-aloud)" },
  { id: DEFAULT_VOICE_ID, label: "App default (standard Read-aloud)" },
  ...availableVoices
    .filter((v) => v.id !== STUDIO_VOICE_ID && v.id !== DEFAULT_VOICE_ID)
    .map((v) => ({ id: v.id, label: v.name })),
];

export const SPEED_OPTIONS: ReadonlyArray<TtsSpeed> = ["slow", "normal", "fast"];

export interface TtsTestConfig {
  modelId: string;
  voiceId: string;
  language: string;
  speed: TtsSpeed;
  /** Client-side WebPlayer buffer (seconds) before playback starts. */
  playbackBufferSec: number;
  /** Server-side text buffering. 0 = custom (immediate); >0 = managed. */
  maxBufferDelayMs: number;
}

export interface TtsRunMetrics {
  connectMs: number | null;
  firstAudioMs: number | null;
  totalMs: number | null;
  chunkCount: number;
  error: string | null;
}

export type TtsRunPhase =
  | "idle"
  | "connecting"
  | "synthesizing"
  | "playing"
  | "done"
  | "error";

export interface TtsRunHandle {
  stop: () => Promise<void>;
}

export const EMPTY_METRICS: TtsRunMetrics = {
  connectMs: null,
  firstAudioMs: null,
  totalMs: null,
  chunkCount: 0,
  error: null,
};

interface RunCallbacks {
  onMetrics: (m: TtsRunMetrics) => void;
  onPhase: (phase: TtsRunPhase) => void;
}

/**
 * Run one synthesis+playback pass for `config`. Must be called from a user
 * gesture so the browser unlocks the AudioContext. Returns a handle to stop.
 */
export async function runTtsTest(
  config: TtsTestConfig,
  transcript: string,
  callbacks: RunCallbacks,
): Promise<TtsRunHandle> {
  const metrics: TtsRunMetrics = { ...EMPTY_METRICS };
  const emit = () => callbacks.onMetrics({ ...metrics });

  callbacks.onPhase("connecting");
  // Create the player first so its AudioContext is constructed as close to the
  // triggering user gesture as possible (browser autoplay policy).
  const player = new WebPlayer({ bufferDuration: config.playbackBufferSec });
  const t0 = performance.now();
  const ws = cartesia.tts.websocket({
    container: OutputContainer.Raw,
    encoding: AudioEncoding.PCM_F32LE,
    sampleRate: 44100,
  });
  await ws.connect();
  metrics.connectMs = Math.round(performance.now() - t0);
  emit();

  callbacks.onPhase("synthesizing");
  const sendStart = performance.now();
  const response = await ws.send({
    modelId: config.modelId,
    voice: { mode: "id", id: config.voiceId },
    transcript,
    language: (config.language || Language.EN) as string,
    speed: config.speed,
    maxBufferDelayMs: config.maxBufferDelayMs,
  });

  response.on("message", (raw: string) => {
    let msg: { type?: string; error?: string };
    try {
      msg = JSON.parse(raw) as { type?: string; error?: string };
    } catch {
      return;
    }
    if (msg.type === "chunk") {
      metrics.chunkCount += 1;
      if (metrics.firstAudioMs === null) {
        metrics.firstAudioMs = Math.round(performance.now() - sendStart);
        callbacks.onPhase("playing");
      }
      emit();
    } else if (msg.type === "done") {
      metrics.totalMs = Math.round(performance.now() - sendStart);
      emit();
      callbacks.onPhase("done");
    } else if (msg.type === "error") {
      metrics.error = msg.error ?? "Unknown TTS error";
      emit();
      callbacks.onPhase("error");
    }
  });

  if (response.source instanceof Source) {
    void player.play(response.source).catch(() => {
      /* playback errors surface via the message stream */
    });
  }

  return {
    stop: async () => {
      try {
        await player.stop();
      } catch {
        /* not yet playing */
      }
      try {
        ws.disconnect();
      } catch {
        /* already closed */
      }
    },
  };
}
