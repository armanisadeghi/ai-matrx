/**
 * Cartesia playback adapter.
 *
 * Imperative twin of `useCartesiaSpeaker.speak()`: token → WebSocket → send →
 * WebPlayer. Lives outside React so the singleton `playbackQueue` can drive it.
 * Output device routing is handled passively by the app-root AudioContext sink
 * patch (`installAudioContextSinkRouting`) — WebPlayer's internal context picks
 * up the selected sink on creation.
 *
 * Note: Cartesia "speed" is a synthesis-time parameter, so live rate changes are
 * not supported (no `setRate`). The queue's global rate is captured into the
 * synthesis `speed` at enqueue time by the consumer instead.
 */

import { CartesiaClient, WebPlayer } from "@cartesia/cartesia-js";
import {
  buildGenerationConfig,
  CARTESIA_API_VERSION,
  TTS_MODEL_ID,
  TTS_PLAYBACK_BUFFER_SEC,
} from "@/lib/cartesia/config";
import { parseMarkdownToText } from "@/utils/markdown-processors/parse-markdown-for-speech";
import type {
  ActivePlayback,
  PlaybackAdapter,
  PlaybackAdapterCallbacks,
  PlaybackItem,
} from "../types";

async function resolveText(item: PlaybackItem): Promise<string> {
  let pronunciations: Awaited<
    ReturnType<typeof import("@/features/dictionary/ttsBridge").resolveDictionaryTtsAliases>
  > = [];
  if (item.dictionarySurfaceKey) {
    const { resolveDictionaryTtsAliases } = await import(
      "@/features/dictionary/ttsBridge"
    );
    pronunciations = await resolveDictionaryTtsAliases(item.dictionarySurfaceKey);
  }
  const processMarkdown = item.processMarkdown ?? true;
  return processMarkdown
    ? parseMarkdownToText(
        item.text,
        pronunciations.length ? { pronunciations } : undefined,
      )
    : item.text;
}

export const cartesiaAdapter: PlaybackAdapter = {
  provider: "cartesia",

  async start(
    item: PlaybackItem,
    cb: PlaybackAdapterCallbacks,
  ): Promise<ActivePlayback> {
    cb.onLoading();

    const voice = item.cartesia;
    if (!voice) {
      throw new Error("Cartesia playback requires resolved voice parameters");
    }

    const processed = (await resolveText(item)).trim();
    if (!processed) {
      throw new Error("Nothing to speak");
    }

    // Token → WebSocket
    const res = await fetch("/api/cartesia");
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Token fetch failed: ${res.status}`);
    }
    const { token } = (await res.json()) as { token: string };

    const client = new CartesiaClient({
      cartesiaVersion: CARTESIA_API_VERSION as unknown as "2024-06-10",
    });
    const ws = client.tts.websocket({
      container: "raw",
      encoding: "pcm_f32le",
      sampleRate: 44100,
    });
    await ws.connect({ accessToken: token });

    let stopped = false;
    const player = new WebPlayer({ bufferDuration: TTS_PLAYBACK_BUFFER_SEC });

    const cleanup = () => {
      try {
        ws.disconnect();
      } catch {
        /* already closed */
      }
    };

    const response = await ws.send({
      modelId: TTS_MODEL_ID,
      voice: { mode: "id" as const, id: voice.voiceId },
      language: voice.language || "en",
      transcript: processed,
      generationConfig: buildGenerationConfig({ speed: voice.speed }),
    });

    if (stopped) {
      cleanup();
      throw new Error("Playback cancelled before it started");
    }

    cb.onPlaying();

    // play() resolves when playback FINISHES — do NOT await it here.
    player
      .play(response.source)
      .then(() => {
        if (stopped) return;
        cleanup();
        cb.onEnded();
      })
      .catch((err) => {
        if (stopped) return;
        cleanup();
        cb.onError(err instanceof Error ? err.message : "Playback failed");
      });

    return {
      pause: () => player.pause().catch(() => {}),
      resume: () => player.resume().catch(() => {}),
      stop: async () => {
        stopped = true;
        try {
          await player.stop();
        } catch {
          /* noop */
        }
        cleanup();
      },
    };
  },
};
