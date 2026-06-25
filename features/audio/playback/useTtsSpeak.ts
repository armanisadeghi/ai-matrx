/**
 * useTtsSpeak — convenience layer over `useAudioPlayback` for "speak this text"
 * surfaces (Speaker buttons, read-aloud menus).
 *
 * Resolves the user's Cartesia voice prefs from Redux, enqueues onto the single
 * playback queue, and tracks the id of THIS surface's most recent utterance so
 * the button can reflect its own status (queued / loading / playing / paused).
 */

"use client";

import { useCallback, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectVoicePreferences } from "@/lib/redux/preferences/userPreferenceSelectors";
import { resolveVoiceId, type VoicePurpose } from "@/lib/cartesia/config";
import { useAudioPlayback } from "./useAudioPlayback";
import type { PlaybackItemStatus } from "./types";

export interface TtsSpeakOptions {
  processMarkdown?: boolean;
  purpose?: VoicePurpose;
  dictionarySurfaceKey?: string;
  label?: string;
}

export function useTtsSpeak({
  processMarkdown = true,
  purpose = "assistant",
  dictionarySurfaceKey,
  label,
}: TtsSpeakOptions = {}) {
  const { enqueue, items, pause, resume, skip, remove, playItem, currentId } =
    useAudioPlayback();
  const prefs = useAppSelector(selectVoicePreferences);
  const [itemId, setItemId] = useState<string | null>(null);

  const speak = useCallback(
    (text: string) => {
      const voiceId = resolveVoiceId(prefs.voice, purpose);
      const { id } = enqueue({
        provider: "cartesia",
        text,
        processMarkdown,
        label,
        dictionarySurfaceKey,
        cartesia: {
          voiceId,
          language: prefs.language || "en",
          speed: prefs.speed,
        },
      });
      setItemId(id);
      return id;
    },
    [
      enqueue,
      prefs.voice,
      prefs.language,
      prefs.speed,
      purpose,
      processMarkdown,
      label,
      dictionarySurfaceKey,
    ],
  );

  const status: PlaybackItemStatus | null = itemId
    ? (items.find((i) => i.id === itemId)?.status ?? null)
    : null;

  const isMine = itemId !== null && itemId === currentId;

  return {
    speak,
    status,
    itemId,
    isMine,
    pause,
    resume,
    skip,
    remove,
    playItem,
  };
}
