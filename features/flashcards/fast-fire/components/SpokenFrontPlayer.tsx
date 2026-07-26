"use client";

// features/flashcards/fast-fire/components/SpokenFrontPlayer.tsx
//
// Plays a card's pre-generated spoken front (the question, read aloud) the instant
// the card appears. The audio is a durable, cached fc_detail(kind='spoken_front'),
// resolved via useFileSrc (re-mints from the file_id per media-durability rules).
// Keyed on the card id so it remounts + autoplays per card — no delay, since the
// audio was generated ahead of time (never on the turn).
//
// In VOICE MODE the drill does NOT start the answer timer until this audio
// finishes: `onEnded(cardId)` fires the moment playback completes (or errors), and
// the drill opens the answer window then — so the clock never runs down while the
// question is still being read. `onEnded` also fires on error so a bad clip can't
// hang the drill (the drill additionally has a max-wait fallback).
//
// NOTE (iOS follow-up): <audio autoPlay> relies on the page's media engagement
// from the Start tap. If iOS Safari blocks it, `ended` won't fire; the drill's
// fallback opens the window after a max-wait. The robust fix is to play the
// decoded buffer through the Start-resumed AudioContext (like the buzzer).

import { useEffect, useRef } from "react";
import { useFileSrc } from "@/features/files";

export function SpokenFrontPlayer({
  fileId,
  cardId,
  onEnded,
}: {
  fileId: string | null | undefined;
  cardId: string;
  /** Fired when the question finishes playing (or errors) — starts the timer. */
  onEnded?: (cardId: string) => void;
}) {
  const src = useFileSrc(fileId ? { kind: "file_id", fileId } : null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // autoPlay alone is unreliable after async URL resolution (and on iOS). Explicit
  // play() when src lands keeps voice-test + FastFire aligned with the Start gesture.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !src) return;
    void el.play().catch((err) => {
      console.warn(
        "[SpokenFrontPlayer] play() failed — fallback timer will open the answer window:",
        err,
      );
    });
  }, [src, cardId]);

  if (!fileId || !src) return null;
  return (
    <audio
      ref={audioRef}
      key={cardId}
      src={src}
      autoPlay
      preload="auto"
      className="sr-only"
      onEnded={() => onEnded?.(cardId)}
      onError={() => onEnded?.(cardId)}
    >
      <track kind="captions" />
    </audio>
  );
}
