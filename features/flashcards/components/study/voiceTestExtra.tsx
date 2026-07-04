// features/flashcards/components/study/voiceTestExtra.tsx
//
// The `renderCardExtra` StudyDeck slot filled with the "Test me" voice-quiz button
// for the current card — pulling the card's cached spoken-front (fc_detail
// kind='spoken_front') so the question can be asked aloud. Shared by every study
// surface (set study + adaptive review) so they don't each re-derive it.

import type { ReactNode } from "react";
import type { CardWithDetails } from "../../data/types";
import { VoiceTestButton } from "../../fast-fire/voice-test/VoiceTestButton";

export function renderVoiceTestExtra(card: CardWithDetails): ReactNode {
  const spokenFrontFileId =
    card.details.find((d) => d.kind === "spoken_front" && !!d.audio_file_id)
      ?.audio_file_id ?? null;
  return (
    <div className="mb-2 flex justify-end">
      <VoiceTestButton
        card={{ id: card.id, front: card.front, back: card.back }}
        spokenFrontFileId={spokenFrontFileId}
      />
    </div>
  );
}
