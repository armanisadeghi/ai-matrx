/**
 * Cartesia playback adapter.
 *
 * Imperative twin of `useCartesiaSpeaker.speak()`: token → WebSocket → send →
 * SinkAwarePlayer. Lives outside React so the singleton `playbackQueue` can
 * drive it. Output device routing is owned by the player itself — it applies
 * the preferred speaker at context creation and re-routes mid-utterance on
 * device change (see features/audio/sinkAwarePlayer.ts).
 *
 * Note: Cartesia "speed" is a synthesis-time parameter, so live rate changes are
 * not supported (no `setRate`). The queue's global rate is captured into the
 * synthesis `speed` at enqueue time by the consumer instead.
 */

import { SinkAwarePlayer } from "@/features/audio/sinkAwarePlayer";
import { connectCartesiaTts } from "@/lib/cartesia/connection";
import {
  buildGenerationConfig,
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
  // Dictionary follows the ONE global active context by default (personal +
  // global + the active org/scopes). A caller may pass an explicit surface key
  // to scope it to a specific surface's selection instead. Best-effort.
  try {
    if (item.dictionarySurfaceKey) {
      const { resolveDictionaryTtsAliases } = await import(
        "@/features/dictionary/ttsBridge"
      );
      pronunciations = await resolveDictionaryTtsAliases(item.dictionarySurfaceKey);
    } else {
      const { resolveActiveContextTtsAliases } = await import(
        "@/features/dictionary/activeContextBridge"
      );
      pronunciations = await resolveActiveContextTtsAliases();
    }
  } catch {
    pronunciations = [];
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

    // Auth + WebSocket via the single Cartesia connection chokepoint.
    const { ws } = await connectCartesiaTts();

    let stopped = false;
    const player = new SinkAwarePlayer({
      bufferDuration: TTS_PLAYBACK_BUFFER_SEC,
    });

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
