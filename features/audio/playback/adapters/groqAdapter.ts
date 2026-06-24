/**
 * Groq / PlayAI playback adapter.
 *
 * Imperative twin of `useTextToSpeech`: POST text → WAV blob → HTMLAudioElement.
 * Routes through the selected output device via `applySinkToMediaElement`
 * (HTMLMediaElement.setSinkId, Chromium) and supports live playback-rate change.
 */

import { applySinkToMediaElement } from "@/features/audio/audioOutputSink";
import { parseMarkdownToText } from "@/utils/markdown-processors/parse-markdown-for-speech";
import type {
  ActivePlayback,
  PlaybackAdapter,
  PlaybackAdapterCallbacks,
  PlaybackItem,
} from "../types";

export const groqAdapter: PlaybackAdapter = {
  provider: "groq",

  async start(
    item: PlaybackItem,
    cb: PlaybackAdapterCallbacks,
    rate: number,
  ): Promise<ActivePlayback> {
    cb.onLoading();

    const processMarkdown = item.processMarkdown ?? true;
    const processed = (
      processMarkdown ? parseMarkdownToText(item.text) : item.text
    ).trim();
    if (!processed) {
      throw new Error("Nothing to speak");
    }

    const res = await fetch("/api/audio/text-to-speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: processed,
        voice: item.groq?.voice,
        model: item.groq?.model || "playai-tts",
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Speech generation failed: ${res.status}`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const audio = new Audio(url);
    audio.playbackRate = rate;
    void applySinkToMediaElement(audio);

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      try {
        audio.pause();
      } catch {
        /* noop */
      }
      audio.src = "";
      URL.revokeObjectURL(url);
    };

    audio.addEventListener("ended", () => {
      if (released) return;
      release();
      cb.onEnded();
    });
    audio.addEventListener("error", () => {
      if (released) return;
      release();
      cb.onError("Audio playback failed");
    });

    try {
      await audio.play();
    } catch (err) {
      release();
      throw err instanceof Error ? err : new Error("Playback failed");
    }
    cb.onPlaying();

    return {
      pause: () => audio.pause(),
      resume: () => audio.play().catch(() => {}),
      stop: () => release(),
      setRate: (r: number) => {
        audio.playbackRate = r;
      },
    };
  },
};
