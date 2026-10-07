// features/flashcards/components/study/useFlashcardStudySurface.ts
//
// Registers the study surface (`matrx-user/education-flashcard-study`) for every study
// driver of ONE deck — flip study, learn, write and the study window — so an agent asked
// about "this card" receives that card, the side in view, whether the learner has seen
// the answer, time on page and the session score. The server turns these values into the
// surface's `situation` sentence and puts it first (Applets AP-6).
//
// Values are read at send time (getScope), so time on page is always current.

"use client";

import { useState } from "react";
import { useSurfaceRuntimeRegistration } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import {
  EDUCATION_FLASHCARD_STUDY_SURFACE,
  createEducationFlashcardStudyScope,
  type FlashcardStudySurfaceValues,
} from "@/features/surfaces/manifests/education-flashcard-study.manifest";
import type { UseFlashcardStudyResult } from "../../data/useFlashcardStudy";
import { asCardKind, studyFaces } from "../../utils/cardVariants";
import { deckSurfaceCards, deckSurfaceDetails } from "../set-detail/deckSurfaceValues";
import { formatDurationSeconds } from "@ai-matrx/kit/format";

export type FlashcardStudyMode = "flip cards" | "learn" | "write the answer";

export interface FlashcardStudySurfaceOptions {
  setId: string | null | undefined;
  study: UseFlashcardStudyResult;
  mode: FlashcardStudyMode;
  /** Write mode reveals the back on submit, not on flip. Defaults to `study.isFlipped`. */
  backSeen?: boolean;
}

/** "2 minutes 30 seconds" — the words the situation sentence reads. */
export function durationInWords(totalSeconds: number): string {
  return formatDurationSeconds(Math.max(0, totalSeconds), { style: "long", parts: 2 });
}

export function scoreInWords(graded: number, correct: number): string {
  if (graded === 0) return "no cards graded yet";
  const pct = Math.round((correct / graded) * 100);
  return `${correct} of ${graded} graded cards right (${pct}%)`;
}

export function buildFlashcardStudyValues(
  options: FlashcardStudySurfaceOptions,
  secondsOnPage: number,
): FlashcardStudySurfaceValues {
  const { setId, study, mode } = options;
  const loaded = !study.loading && !study.error && !!study.set;
  const values: FlashcardStudySurfaceValues = {
    // The deck as data — the deck page's own values, through the same builder.
    set_loaded: loaded,
    set_id: setId ?? "",
    study_mode: mode,
    seconds_on_page: Math.floor(secondsOnPage),
    time_on_page: durationInWords(secondsOnPage),
  };
  if (study.error) values.load_error = study.error;
  if (study.set) values.set_details = deckSurfaceDetails(study.set);
  if (loaded) {
    values.cards = deckSurfaceCards(study.cards);
    values.card_count = study.deckSize ?? study.progress.total ?? study.cards.length;
    values.cards_in_round = study.cards.length;
    values.cards_graded = study.progress.done;
    values.cards_correct = study.progress.correct;
    values.score = scoreInWords(study.progress.done, study.progress.correct);
  }
  const card = study.cards[study.currentIndex];
  if (card) {
    const faces = studyFaces(card);
    const backSeen = options.backSeen ?? study.isFlipped;
    values.card_id = card.id;
    values.card_number = study.currentIndex + 1;
    values.card_kind = asCardKind(card.card_kind);
    values.side_shown = study.isFlipped ? "back" : "front";
    values.card_front = faces.front;
    values.card_back = faces.back.trim() ? faces.back : "(this card has no back text)";
    values.back_status = backSeen
      ? "they have already seen the answer"
      : "they have not seen the answer yet";
    const mastery = study.masteryByCard[card.id];
    const attempts = mastery?.attempt_count ?? 0;
    const lapses = mastery?.lapses ?? 0;
    const thisSession = study.resultsByCard[card.id];
    values.card_history =
      attempts === 0
        ? "They have never reviewed this card before."
        : `They have reviewed this card ${attempts} time${attempts === 1 ? "" : "s"} and forgotten it ${lapses} time${lapses === 1 ? "" : "s"}.` +
          (thisSession ? ` This session they graded it ${thisSession}.` : "");
  }
  return values;
}

export function useFlashcardStudySurface(options: FlashcardStudySurfaceOptions): void {
  // When this study page opened; time on page is measured from here at send time.
  const [openedAt] = useState(() => Date.now());
  useSurfaceRuntimeRegistration(
    options.setId
      ? {
          surfaceName: EDUCATION_FLASHCARD_STUDY_SURFACE,
          getScope: () =>
            createEducationFlashcardStudyScope(
              buildFlashcardStudyValues(
                options,
                (Date.now() - openedAt) / 1000,
              ),
            ),
        }
      : null,
  );
}
