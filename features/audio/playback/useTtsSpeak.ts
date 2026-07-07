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
  /**
   * When set, on (re)mount this hook re-adopts the queue's currently-active item
   * if that item's text equals `adoptText` — so a Speak button that unmounted
   * (tab switch / navigation) while its audio kept playing in the persistent
   * queue re-attaches to it (reflects status + can pause/resume) instead of
   * resetting to idle and enqueuing a duplicate.
   */
  adoptText?: string;
}

export function useTtsSpeak({
  processMarkdown = true,
  purpose = "assistant",
  dictionarySurfaceKey,
  label,
  adoptText,
}: TtsSpeakOptions = {}) {
  const { enqueue, items, pause, resume, skip, remove, playItem, currentId } =
    useAudioPlayback();
  const prefs = useAppSelector(selectVoicePreferences);
  const [itemId, setItemId] = useState<string | null>(null);

  // Effective utterance = our own spoken item, OR (derived — no state/effect)
  // the queue's currently-active item when its text matches `adoptText`. That
  // makes a button remounted after a tab switch / navigation re-adopt audio
  // still playing in the persistent queue instead of resetting to idle.
  const adoptedId =
    !itemId && adoptText && currentId
      ? (items.find(
          (i) =>
            i.id === currentId &&
            i.text === adoptText &&
            (i.status === "playing" ||
              i.status === "paused" ||
              i.status === "loading"),
        )?.id ?? null)
      : null;
  const effectiveId = itemId ?? adoptedId;

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

  const status: PlaybackItemStatus | null = effectiveId
    ? (items.find((i) => i.id === effectiveId)?.status ?? null)
    : null;

  const isMine = effectiveId !== null && effectiveId === currentId;

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
