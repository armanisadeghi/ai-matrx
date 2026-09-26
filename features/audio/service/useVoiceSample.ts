"use client";

// features/audio/service/useVoiceSample.ts
//
// Hear a voice before you keep it — for EVERY voice set, through the ONE
// playback queue (speak()), so a sample obeys the same lock, iOS unlock and
// Media panel as every other sound in the app.
//
//   cartesia → the read-aloud engine speaks the sample line in that voice.
//   xai      → the catalog's xai-tts model speaks it (the same five voice
//              identities xAI Realtime uses), so no live session is opened.

import { useState } from "react";
import { useAudioPlayback } from "@/features/audio/playback/useAudioPlayback";
import {
  LIVE_CONVERSATION_SAMPLE_MODEL,
  type VoiceSetId,
} from "@/lib/voices/voiceSets";
import { speak } from "./speak";

/** The line every sample speaks. Short, and the same one every time. */
export const VOICE_SAMPLE_LINE =
  "Hi — this is how I sound. I can read anything back to you in this voice.";

export function useVoiceSample() {
  const { items, remove } = useAudioPlayback();
  const [active, setActive] = useState<{ key: string; itemId: string } | null>(
    null,
  );
  const item = active ? items.find((i) => i.id === active.itemId) : undefined;
  const live =
    item?.status === "queued" ||
    item?.status === "loading" ||
    item?.status === "playing";
  const playingKey = active && live ? active.key : null;
  const error =
    item?.status === "error"
      ? (item.error ?? "The sample could not play.")
      : null;

  const stop = () => {
    if (active) void remove(active.itemId);
    setActive(null);
  };

  const play = (set: VoiceSetId, voiceId: string, voiceName: string) => {
    const key = `${set}:${voiceId}`;
    if (playingKey === key) {
      stop();
      return;
    }
    if (active) void remove(active.itemId);
    const label = `Voice sample — ${voiceName}`;
    const { id } =
      set === "xai"
        ? speak({
            text: VOICE_SAMPLE_LINE,
            label,
            sample: { model: LIVE_CONVERSATION_SAMPLE_MODEL, voice: voiceId },
          })
        : speak({
            text: VOICE_SAMPLE_LINE,
            label,
            engine: "cartesia",
            voice: voiceId,
            processMarkdown: false,
          });
    setActive({ key, itemId: id });
  };

  /** Any catalogue voice (ai.voices) — the server renders a one-line sample for that model. */
  const playCatalogVoice = (model: string, voice: string, voiceName: string) => {
    const key = `catalog:${model}:${voice}`;
    if (playingKey === key) {
      stop();
      return;
    }
    if (active) void remove(active.itemId);
    const { id } = speak({
      text: VOICE_SAMPLE_LINE,
      label: `Voice sample — ${voiceName}`,
      sample: { model, voice },
    });
    setActive({ key, itemId: id });
  };

  return {
    play,
    playCatalogVoice,
    stop,
    /** `${set}:${voiceId}` (or `catalog:${model}:${voice}`) of the sample now sounding, or null. */
    playingKey,
    /** Whether the active sample is still starting up. */
    starting: Boolean(
      active && (item?.status === "queued" || item?.status === "loading"),
    ),
    error,
  };
}
