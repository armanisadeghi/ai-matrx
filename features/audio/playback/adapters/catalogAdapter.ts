/**
 * Catalog speech playback adapter — the non-streaming lane.
 *
 * The browser never names a vendor: it asks the server catalog for speech and
 * the catalog decides who synthesizes it, so changing that vendor is a server
 * change with no client release. (This adapter was keyed "groq" until the AV
 * service layer landed; the vendor name never belonged in the client.)
 *
 * POST text → durable URL → HTMLAudioElement.
 * Routes through the selected output device via `applySinkToMediaElement`
 * (HTMLMediaElement.setSinkId, Chromium) and supports live playback-rate change.
 */

import { applySinkToMediaElement } from "@/features/audio/audioOutputSink";
import { getPrimedMediaElement } from "@/features/audio/unlock";
import { parseMarkdownToText } from "@/utils/markdown-processors/parse-markdown-for-speech";
import { generateSpeech } from "@/features/audio/services/speechApi";
import type {
  ActivePlayback,
  PlaybackAdapter,
  PlaybackAdapterCallbacks,
  PlaybackItem,
} from "../types";

export const catalogAdapter: PlaybackAdapter = {
  provider: "catalog",

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

    const speech = await generateSpeech(processed, { voice: item.catalog?.voice });
    const url = speech.url;

    // iOS/WebKit blocks `.play()` outside a user gesture, and we arrive here
    // AFTER the synthesis round-trip. Reuse the app's gesture-activated
    // element (features/audio/unlock.ts) — element activation persists, so
    // playing new sources through it is allowed. Falls back to a fresh
    // element where no gesture has primed one (desktop is lenient).
    const audio = getPrimedMediaElement() ?? new Audio();
    audio.muted = false;
    audio.src = url;
    audio.playbackRate = rate;
    void applySinkToMediaElement(audio);

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      // The element is SHARED across utterances — detach handlers before
      // touching src so teardown can't fire a stale error/ended callback.
      audio.onended = null;
      audio.onerror = null;
      try {
        audio.pause();
      } catch {
        /* noop */
      }
      audio.removeAttribute("src");
      try {
        audio.load();
      } catch {
        /* noop */
      }
    };

    audio.onended = () => {
      release();
      cb.onEnded();
    };
    audio.onerror = () => {
      release();
      cb.onError("Audio playback failed");
    };

    try {
      await audio.play();
    } catch (err) {
      release();
      // WebKit's autoplay refusal — tell the truth and name the remedy: the
      // retry tap itself is the user gesture that unblocks output.
      if (err instanceof Error && err.name === "NotAllowedError") {
        throw new Error(
          "The browser blocked audio output — tap play again to start sound.",
        );
      }
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
