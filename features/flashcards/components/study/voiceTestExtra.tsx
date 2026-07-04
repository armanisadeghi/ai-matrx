// features/flashcards/components/study/voiceTestExtra.tsx
//
// Builds the optional FlashcardItem `voiceTest` prop from a study card — pulls
// the cached spoken-front (fc_detail kind='spoken_front') so the question can be
// asked aloud. Shared by every study surface (set study + adaptive review).

import type { CardWithDetails } from "../../data/types";

export interface FlashcardVoiceTestProps {
  cardId: string;
  spokenFrontFileId: string | null;
}

export function getVoiceTestForCard(
  card: CardWithDetails,
): FlashcardVoiceTestProps {
  const spokenFrontFileId =
    card.details.find((d) => d.kind === "spoken_front" && !!d.audio_file_id)
      ?.audio_file_id ?? null;
  return { cardId: card.id, spokenFrontFileId };
}
