// selectors/flashcardSelectors.ts

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { FlashcardState } from "@/lib/redux/slices/flashcardChatSlice";
import type { ChatMessage } from "@/types/flashcards.types";

const selectFlashcardsRecord = (state: RootState) =>
  state.flashcardChat.flashcards;

/** Memoized — stable array reference when the flashcards record is unchanged. */
const selectAllFlashcards = createSelector([selectFlashcardsRecord], (record) =>
  Object.values(record),
);

const selectCurrentIndex = (state: RootState) =>
  state.flashcardChat.currentIndex;

const selectActiveFlashcard = createSelector(
  [selectAllFlashcards, selectCurrentIndex],
  (flashcards, currentIndex) => {
    if (currentIndex >= 0 && currentIndex < flashcards.length) {
      return flashcards[currentIndex];
    }
    return null;
  },
);

const EMPTY_CHAT: ChatMessage[] = [];

// Select all flashcard data (without chat history)
const selectAllFlashcardData = createSelector(
  [selectAllFlashcards],
  (flashcards) => flashcards.map(({ chat, ...rest }) => rest),
);

// Select chat history for the active flashcard
const selectActiveFlashcardChat = createSelector(
  [selectActiveFlashcard],
  (activeFlashcard) => activeFlashcard?.chat ?? EMPTY_CHAT,
);

// Select total correct and incorrect counts
const selectPerformanceCounts = createSelector(
  [selectAllFlashcards],
  (flashcards) => ({
    totalCorrect: flashcards.reduce((sum, card) => sum + card.correctCount, 0),
    totalIncorrect: flashcards.reduce(
      (sum, card) => sum + card.incorrectCount,
      0,
    ),
    totalCount: flashcards.length,
  }),
);

const flashcardByIdSelectorCache = new Map<
  string,
  (state: RootState) => FlashcardState | undefined
>();

/** Memoized lookup for a single flashcard id — stable ref when record unchanged. */
const selectFlashcardById = (id: string) => {
  if (!flashcardByIdSelectorCache.has(id)) {
    flashcardByIdSelectorCache.set(
      id,
      createSelector(
        [selectFlashcardsRecord],
        (flashcards): FlashcardState | undefined => flashcards[id],
      ),
    );
  }
  return flashcardByIdSelectorCache.get(id)!;
};

export {
  selectAllFlashcards,
  selectCurrentIndex,
  selectActiveFlashcard,
  selectAllFlashcardData,
  selectActiveFlashcardChat,
  selectPerformanceCounts,
  selectFlashcardById,
};
