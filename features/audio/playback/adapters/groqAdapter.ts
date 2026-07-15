/**
 * Catalog-routed durable speech playback adapter (legacy queue key: "groq").
 *
 * Imperative twin of `useTextToSpeech`: POST text → durable URL → HTMLAudioElement.
 * Routes through the selected output device via `applySinkToMediaElement`
 * (HTMLMediaElement.setSinkId, Chromium) and supports live playback-rate change.
 */

import { applySinkToMediaElement } from "@/features/audio/audioOutputSink";
import { parseMarkdownToText } from "@/utils/markdown-processors/parse-markdown-for-speech";
import { generateSpeech } from "@/features/audio/services/speechApi";
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

    const speech = await generateSpeech(processed, { voice: item.groq?.voice });
    const url = speech.url;

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
