/**
 * useSpeech — the React face of `speak()`.
 *
 * Gives one surface (a Speaker button, a read-aloud menu) its OWN view of the
 * shared playback queue: it speaks through the single service, then tracks the
 * status of just its own utterance so the button can show queued / loading /
 * playing / paused without knowing anything about the queue's other items.
 *
 * Engine choice is a prop (`engine`), not a hardcoded provider — that is the
 * whole point of the service layer. Omit it and the app default applies.
 *
 * (Was `features/audio/playback/useTtsSpeak.ts`, which could only ever speak
 * Cartesia because it resolved that engine's voice params inline.)
 */

"use client";

import { useCallback, useState } from "react";
import { useAudioPlayback } from "@/features/audio/playback/useAudioPlayback";
import type { PlaybackItemStatus } from "@/features/audio/playback/types";
import type { VoicePurpose } from "@/lib/cartesia/config";
import { speak as speakText } from "./speak";
import type { SpeakEngineId } from "./engines";

export interface UseSpeechOptions {
  processMarkdown?: boolean;
  purpose?: VoicePurpose;
  dictionarySurfaceKey?: string;
  label?: string;
  /** Which engine synthesizes. Omit for the app default. */
  engine?: SpeakEngineId;
  /**
   * When set, on (re)mount this hook re-adopts the queue's currently-active item
   * if that item's text equals `adoptText` — so a Speak button that unmounted
   * (tab switch / navigation) while its audio kept playing in the persistent
   * queue re-attaches to it (reflects status + can pause/resume) instead of
   * resetting to idle and enqueuing a duplicate.
   */
  adoptText?: string;
}

export function useSpeech({
  processMarkdown = true,
  purpose = "assistant",
  dictionarySurfaceKey,
  label,
  engine,
  adoptText,
}: UseSpeechOptions = {}) {
  const { items, pause, resume, skip, remove, playItem, currentId } =
    useAudioPlayback();
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
      const { id } = speakText({
        text,
        engine,
        purpose,
        processMarkdown,
        label,
        dictionarySurfaceKey,
      });
      setItemId(id);
      return id;
    },
    [engine, purpose, processMarkdown, label, dictionarySurfaceKey],
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
