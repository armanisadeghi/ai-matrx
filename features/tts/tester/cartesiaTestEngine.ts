"use client";

/**
 * cartesiaTestEngine — config-driven Cartesia TTS runner for the admin Voice
 * Tester. Mirrors the production request shape (latest API: model + voice +
 * generation_config { speed, volume, emotion } + client playback buffer +
 * server max_buffer_delay_ms) so what you hear here is what ships.
 *
 * Playback control (pause/resume/stop) is owned by the returned handle and
 * driven by the WebPlayer — NOT the synthesis lifecycle — so pause works even
 * after all audio has been received.
 */

import type { Cartesia, WebPlayer } from "@cartesia/cartesia-js";
import Source from "@cartesia/cartesia-js/wrapper/source";
import cartesia from "@/lib/cartesia/client";
import {
  AudioEncoding,
  Language,
  OutputContainer,
} from "@/lib/cartesia/cartesia.types";
import {
  ASSISTANT_VOICE_ID,
  buildGenerationConfig,
  READING_VOICE_ID,
  TTS_DEFAULT_SPEED,
  TTS_DEFAULT_VOLUME,
  TTS_MODEL_ID,
} from "@/lib/cartesia/config";
import { availableVoices } from "@/lib/cartesia/voices";

export const TEST_MODEL_OPTIONS: ReadonlyArray<{ value: string; label: string }> =
  [
    { value: TTS_MODEL_ID, label: "Sonic 3.5 (latest)" },
    { value: "sonic-3", label: "Sonic 3" },
    { value: "sonic-2-2025-03-07", label: "Sonic 2" },
    { value: "sonic-turbo-2025-03-07", label: "Sonic Turbo" },
  ];

/** Voice dropdown: the two system voices first, then the rest of the library. */
export const TEST_VOICE_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: READING_VOICE_ID, label: "Skylar — reading default" },
  { id: ASSISTANT_VOICE_ID, label: "Daniel — assistant default" },
  ...availableVoices
    .filter((v) => v.id !== READING_VOICE_ID && v.id !== ASSISTANT_VOICE_ID)
    .map((v) => ({ id: v.id, label: v.name })),
];

/** A curated subset of the (large) emotion list; "" = none (the normal case). */
export const EMOTION_OPTIONS: ReadonlyArray<string> = [
  "",
  "Neutral",
  "Happy",
  "Excited",
  "Enthusiastic",
  "Calm",
  "Serene",
  "Curious",
  "Confident",
  "Determined",
  "Sad",
  "Angry",
  "Sarcastic",
];

export interface TtsTestConfig {
  modelId: string;
  voiceId: string;
  language: string;
  /** generation_config.speed (0.6–1.5; 1.0 original). */
  speed: number;
  /** generation_config.volume (0.5–2.0; 1.0 original). */
  volume: number;
  /** generation_config.emotion; "" = none. */
  emotion: string;
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
  | "paused"
  | "ended"
  | "error";

export interface TtsRunHandle {
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
}

export const EMPTY_METRICS: TtsRunMetrics = {
  connectMs: null,
  firstAudioMs: null,
  totalMs: null,
  chunkCount: 0,
  error: null,
};

export const DEFAULT_TEST_CONFIG: Omit<TtsTestConfig, "voiceId"> = {
  modelId: TTS_MODEL_ID,
  language: "en",
  speed: TTS_DEFAULT_SPEED,
  volume: TTS_DEFAULT_VOLUME,
  emotion: "",
  playbackBufferSec: 0.7,
  maxBufferDelayMs: 0,
};

interface RunCallbacks {
  onMetrics: (m: TtsRunMetrics) => void;
  onPhase: (phase: TtsRunPhase) => void;
  onPlaybackEnded: () => void;
}

/**
 * Run one synthesis + playback pass on the supplied {@link WebPlayer}. The
 * caller owns the player (one per panel, recreated only when the playback buffer
 * changes) to avoid exhausting the browser's AudioContext budget. Call from a
 * user gesture so the browser can unlock the AudioContext.
 */
export async function runTtsTest(
  player: WebPlayer,
  config: TtsTestConfig,
  transcript: string,
  callbacks: RunCallbacks,
): Promise<TtsRunHandle> {
  const metrics: TtsRunMetrics = { ...EMPTY_METRICS };
  const emit = () => callbacks.onMetrics({ ...metrics });
  let cancelled = false;

  callbacks.onPhase("connecting");
  const t0 = performance.now();
  const ws = cartesia.tts.websocket({
    container: OutputContainer.Raw,
    encoding: AudioEncoding.PCM_F32LE,
    sampleRate: 44100,
  });
  await ws.connect();
  metrics.connectMs = Math.round(performance.now() - t0);
  emit();

  const request: Cartesia.WebSocketTtsRequest = {
    modelId: config.modelId,
    voice: { mode: "id", id: config.voiceId },
    transcript,
    language: config.language || Language.EN,
    continue: false,
    maxBufferDelayMs: config.maxBufferDelayMs,
    generationConfig: buildGenerationConfig({
      speed: config.speed,
      volume: config.volume,
      emotion: config.emotion || undefined,
    }),
  };

  callbacks.onPhase("synthesizing");
  const sendStart = performance.now();
  const response = await ws.send(request);

  response.on("message", (raw: string) => {
    if (cancelled) return;
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
    } else if (msg.type === "error") {
      metrics.error = msg.error ?? "Unknown TTS error";
      emit();
      callbacks.onPhase("error");
    }
  });

  if (response.source instanceof Source) {
    player
      .play(response.source)
      .then(() => {
        if (!cancelled) callbacks.onPhase("ended");
        callbacks.onPlaybackEnded();
      })
      .catch(() => {
        if (!cancelled) {
          metrics.error = metrics.error ?? "Playback failed";
          emit();
          callbacks.onPhase("error");
        }
      });
  } else if (!cancelled) {
    callbacks.onPhase("error");
    metrics.error = "No audio source returned";
    emit();
  }

  return {
    pause: () => player.pause().catch(() => {}),
    resume: () => player.resume().catch(() => {}),
    stop: async () => {
      cancelled = true;
      try {
        await player.stop();
      } catch {
        /* not playing */
      }
      try {
        ws.disconnect();
      } catch {
        /* already closed */
      }
    },
  };
}
