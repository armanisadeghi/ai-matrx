"use client";

/**
 * The Flashcards jobs shown in the existing header Agents menu.
 *
 * This is deliberately UI-free: action-bearing Flashcards components register
 * only the fixed jobs they can actually launch. The shell owns the visible
 * menu and the canonical mandate opener.
 */

import {
  useDeclaredSurfaceMandates,
  type SurfaceMandateRef,
} from "@/features/surfaces/runtime/surface-mandates";
import { FC_MANDATES, type FcMandateKey } from "./mandates";

const FLASHCARDS_SURFACE = "matrx-user/education-flashcards";

const descriptions: Record<FcMandateKey, string> = {
  generateCards: "Creates a new flashcard deck from the learner's topic.",
  generateFromSource:
    "Creates or extends a flashcard deck from the learner's source material.",
  enrichCard: "Adds examples, memory aids, and explanations to a card.",
  expandCard: "Splits a card into deeper, focused sub-cards.",
  gradeSpoken: "Grades a learner's spoken flashcard answer.",
  gradeTypedAnswer: "Grades a typed answer by meaning, not exact wording.",
  helpLive: "Explains the current card when the learner asks for help.",
  reviewBatch: "Reviews the learner's completed flashcard session.",
  microCoach: "Gives brief coaching after a flashcard attempt.",
  makeQuizItems: "Creates multiple-choice questions from flashcards.",
  verifyAgainstSource:
    "Checks a flashcard against the source material it came from.",
  spokenFrontTts: "Creates the spoken question audio for a flashcard.",
  helperTts: "Creates the prepared spoken explanation for a flashcard.",
};

export function flashcardMandateRefs(
  keys: readonly FcMandateKey[],
): SurfaceMandateRef[] {
  return keys.map((key) => ({
    mandateKey: FC_MANDATES[key],
    does: descriptions[key],
    surfaceName: FLASHCARDS_SURFACE,
  }));
}

export function useFlashcardMandates(keys: readonly FcMandateKey[]): void {
  useDeclaredSurfaceMandates(flashcardMandateRefs(keys));
}
