"use client";

// features/flashcards/fast-fire/components/SpokenFrontPlayer.tsx
//
// Plays a card's pre-generated spoken front (the question, read aloud) the instant
// the card appears. The audio is a durable, cached fc_detail(kind='spoken_front'),
// resolved via useFileSrc (re-mints from the file_id per media-durability rules).
// Keyed on the card id so it remounts + autoplays per card — no delay, since the
// audio was generated ahead of time (never on the turn).
//
// NOTE (iOS follow-up): <audio autoPlay> relies on the page's media engagement
// from the Start tap. If iOS Safari blocks it, switch to playing the decoded
// buffer through the shared AudioContext (resumed in the Start gesture, like the
// buzzer) using a CORS-safe fetchable URL. Desktop autoplays fine today.

import { useFileSrc } from "@/features/files";

export function SpokenFrontPlayer({
  fileId,
  cardId,
}: {
  fileId: string | null | undefined;
  cardId: string;
}) {
  const src = useFileSrc(fileId ? { kind: "file_id", fileId } : null);
  if (!fileId || !src) return null;
  return (
    <audio key={cardId} src={src} autoPlay preload="auto" className="sr-only">
      <track kind="captions" />
    </audio>
  );
}
