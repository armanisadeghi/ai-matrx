"use client";

// features/flashcards/components/study/CardAudioHelp.tsx
//
// THE audio-help affordance for a study card (VISION §2 "supports audio
// playback", §4 "voice Q&A available at every surface"). ALWAYS offered —
// whether or not the card already has audio:
//
//   1. "Hear this card" — plays the card's cached spoken front
//      (fc_detail kind='spoken_front', durable audio_file_id). When the card
//      has none, one tap generates it through the SAME mandate-resolved TTS
//      lane Fast Fire uses (`generateSpokenFront`, mandate
//      flashcards.spoken_front_tts), caches it on the card, and plays it —
//      the learner never sees "no audio for this card".
//   2. "Talk it through" — expands the inline realtime voice tutor
//      (VoiceTutorPanel → the education.voice_tutor mandate / xAI Grok voice),
//      seeded with THIS card as context.
//
// Follows the deck's affordance pattern (AskAiPanel): full-width outline
// trigger, expanded body in a muted bordered box, page only grows downward.
// The voice panel is React.lazy — the realtime transport loads only when a
// learner actually opens it (in-gate lazy, per the code-splitting rules).

import { lazy, Suspense, useState } from "react";
import { AudioLines, Loader2, Mic, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/redux/hooks";
import { SpokenFrontPlayer } from "@/features/flashcards/fast-fire/components/SpokenFrontPlayer";
import {
  generateSpokenFront,
  getCachedSpokenFrontFileId,
} from "@/features/flashcards/fast-fire/spoken-front/generateSpokenFront.thunk";
import type { VoiceTutorCardContext } from "./VoiceTutorPanel";

const VoiceTutorPanel = lazy(() =>
  import("./VoiceTutorPanel").then((m) => ({ default: m.VoiceTutorPanel })),
);

export function CardAudioHelp({
  cardId,
  front,
  back,
  topic,
  revealed,
  spokenFrontFileId,
  className,
}: {
  cardId: string;
  front: string;
  back: string;
  topic?: string | null;
  /** Whether the learner has flipped the card (shapes the tutor's posture). */
  revealed: boolean;
  /** Cached spoken-front audio, when the card already has one. */
  spokenFrontFileId?: string | null;
  className?: string;
}) {
  const dispatch = useAppDispatch();
  const [fileId, setFileId] = useState<string | null>(
    spokenFrontFileId ?? null,
  );
  const [generating, setGenerating] = useState(false);
  const [playToken, setPlayToken] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  // The HOST MOUNTS THIS WITH key={cardId} — a card change remounts, so all
  // of the state above resets naturally (no reset effect). A file generated
  // this visit is CACHED on the card by the thunk, so returning to the card
  // finds it via the prop; local state only bridges the current visit.

  async function hearCard() {
    // Tapping while "Playing…" STOPS — the button is never a dead end, even
    // if the file URL fails to mint or autoplay is blocked (cases where the
    // player can't fire onEnded).
    if (playing) {
      setPlaying(false);
      return;
    }
    setFailed(false);
    if (fileId) {
      // Remount the player → it plays from the top.
      setPlayToken((t) => t + 1);
      setPlaying(true);
      return;
    }
    setGenerating(true);
    // The deck's details prop can be stale (audio generated on a previous
    // visit to this card, or by the voice test) — check the DB cache before
    // paying for a fresh generation.
    const cached = await getCachedSpokenFrontFileId(cardId);
    const resolved =
      cached ?? (await dispatch(generateSpokenFront({ id: cardId, front }, 0, 1)));
    setGenerating(false);
    if (!resolved) {
      setFailed(true);
      return;
    }
    setFileId(resolved);
    setPlayToken((t) => t + 1);
    setPlaying(true);
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1 gap-1.5 text-xs"
          onClick={() => void hearCard()}
          disabled={generating}
        >
          {generating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : playing ? (
            <AudioLines className="h-3.5 w-3.5" />
          ) : (
            <Volume2 className="h-3.5 w-3.5" />
          )}
          {generating
            ? "Narrating this card…"
            : playing
              ? "Playing — tap to stop"
              : "Hear this card"}
        </Button>
        <Button
          type="button"
          variant={tutorOpen ? "secondary" : "outline"}
          size="sm"
          className="flex-1 gap-1.5 text-xs"
          onClick={() => setTutorOpen((o) => !o)}
        >
          <Mic className="h-3.5 w-3.5" />
          {tutorOpen ? "Close voice tutor" : "Talk it through"}
        </Button>
      </div>

      {failed && (
        <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
          Couldn&apos;t narrate this card right now — try again in a moment.
        </p>
      )}

      {playing && fileId && (
        <SpokenFrontPlayer
          key={`${cardId}-${playToken}`}
          fileId={fileId}
          cardId={cardId}
          onEnded={() => setPlaying(false)}
        />
      )}

      {tutorOpen && (
        <Suspense
          fallback={
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Getting your tutor ready…
            </div>
          }
        >
          <VoiceTutorPanel
            key={cardId}
            card={
              {
                front,
                back,
                topic,
                revealed,
              } satisfies VoiceTutorCardContext
            }
            className="mt-2 rounded-lg border border-border bg-muted/30 p-3"
          />
        </Suspense>
      )}
    </div>
  );
}
