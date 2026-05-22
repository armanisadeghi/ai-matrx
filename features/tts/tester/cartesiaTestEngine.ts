"use client";

/**
 * cartesiaTestEngine — config-driven Cartesia TTS runner for the admin Voice
 * Tester. Every knob that affects perceived quality is observable side-by-side:
 * model, voice, speed, emotions (experimental), client playback buffer, and
 * server buffering (max_buffer_delay_ms), with time-to-first-audio / total-synth
 * metrics.
 *
 * Crucially, playback control (pause/resume/stop) is owned by the returned
 * handle and driven by the WebPlayer — NOT by the synthesis lifecycle — so the
 * user can pause real playback even after all audio has been received.
 */

import type { Cartesia, WebPlayer } from "@cartesia/cartesia-js";
import Source from "@cartesia/cartesia-js/wrapper/source";
import cartesia from "@/lib/cartesia/client";
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

export const TEST_VOICE_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: STUDIO_VOICE_ID, label: "Studio voice (current studio Read-aloud)" },
  { id: DEFAULT_VOICE_ID, label: "App default (standard Read-aloud)" },
  ...availableVoices
    .filter((v) => v.id !== STUDIO_VOICE_ID && v.id !== DEFAULT_VOICE_ID)
    .map((v) => ({ id: v.id, label: v.name })),
];

export const SPEED_OPTIONS: ReadonlyArray<TtsSpeed> = ["slow", "normal", "fast"];

/** Experimental emotion controls (Sonic 2-era; ignored by Sonic 3+). */
export const EMOTION_NAMES = [
  "positivity",
  "curiosity",
  "surprise",
  "sadness",
  "anger",
] as const;
export type EmotionName = (typeof EMOTION_NAMES)[number];
export const EMOTION_LEVELS = ["lowest", "low", "medium", "high", "highest"] as const;
export type EmotionLevel = (typeof EMOTION_LEVELS)[number];

/** Build a Cartesia emotion tag from a name + level ("medium" omits the level). */
export function emotionTag(
  name: EmotionName,
  level: EmotionLevel,
): Cartesia.EmotionDeprecated {
  const tag = level === "medium" ? name : `${name}:${level}`;
  return tag as Cartesia.EmotionDeprecated;
}

export interface TtsTestConfig {
  modelId: string;
  voiceId: string;
  language: string;
  speed: TtsSpeed;
  /** Client-side WebPlayer buffer (seconds) before playback starts. */
  playbackBufferSec: number;
  /** Server-side text buffering. 0 = custom (immediate); >0 = managed. */
  maxBufferDelayMs: number;
  /** Experimental emotion tags applied via voice.experimentalControls. */
  emotions: Cartesia.EmotionDeprecated[];
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

interface RunCallbacks {
  onMetrics: (m: TtsRunMetrics) => void;
  onPhase: (phase: TtsRunPhase) => void;
  /** Fires when actual audio playback finishes (not when synthesis completes). */
  onPlaybackEnded: () => void;
}

const NUMERIC_SPEED: Record<TtsSpeed, number> = {
  slow: -0.4,
  normal: 0,
  fast: 0.4,
};

/**
 * Run one synthesis + playback pass on the supplied {@link WebPlayer}. The
 * caller owns the player (one per panel, recreated only when the playback buffer
 * changes) to avoid exhausting the browser's AudioContext budget across many
 * runs. Returns a handle that controls the *actual* playback. Call from a user
 * gesture so the browser can unlock the AudioContext.
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

  const voice: Cartesia.TtsRequestIdSpecifier = {
    mode: "id",
    id: config.voiceId,
  };
  if (config.emotions.length > 0) {
    voice.experimentalControls = {
      speed: NUMERIC_SPEED[config.speed],
      emotion: config.emotions,
    };
  }

  const request: Cartesia.WebSocketTtsRequest = {
    modelId: config.modelId,
    voice,
    transcript,
    language: config.language || Language.EN,
    continue: false,
    maxBufferDelayMs: config.maxBufferDelayMs,
    // Top-level model speed only when not using the experimental controls speed.
    ...(config.emotions.length === 0 ? { speed: config.speed } : {}),
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
    // Resolves when playback *finishes* — the source of truth for "ended".
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
