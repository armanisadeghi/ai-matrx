/**
 * Pure card-set derivation — the exact logic `useFlashcardsSet` runs to turn
 * a block's `{ content, serverData }` into renderable cards. Extracted from
 * flashcards-set-parts.tsx (which is a "use client" module full of UI deps)
 * so tests can assert the REAL derivation against real routed blocks.
 *
 * Preference order (load-bearing):
 * - `serverData` (typed cards from Python, or envelope-derived cards from
 *   `applyIrKindRoute` for `__kind` JSON regions) wins when present.
 * - Otherwise `content` parses through the legacy "Front:/Back:" markdown
 *   parser (old payloads keep working forever).
 *
 * `flashcards.length === 0` is the "No flashcards available yet..." state in
 * FlashcardsBlock — the 2026-07-04 live-chat bug was junk
 * `serverData: { language: "json" }` reaching this function and yielding
 * zero cards while `content` held a perfect JSON payload.
 */

import type { FlashcardsBlockData } from "@/types/python-generated/stream-events";
import type { FlashcardSubcard } from "./flashcard-subcards";
import { parseFlashcards } from "./flashcard-parser";
import { EXPERIMENTAL_normalizePreParsedFlashcards } from "./EXPERIMENTAL-parse-addon";

export type NormalizedFlashcard = {
  front?: string | null;
  back?: string | null;
  additionalDetails?: Record<string, unknown>;
  subcards?: FlashcardSubcard[];
};

export interface DeriveFlashcardsSetArgs {
  content?: string;
  serverData?: FlashcardsBlockData;
  /** Optional JSON merged into each card's additionalDetails (pre-parsed paths only). */
  additionalDetails?: Record<string, unknown>;
}

export function deriveFlashcardsSet({
  content,
  serverData,
  additionalDetails,
}: DeriveFlashcardsSetArgs): {
  flashcards: NormalizedFlashcard[];
  isComplete: boolean;
} {
  if (serverData) {
    return {
      flashcards: EXPERIMENTAL_normalizePreParsedFlashcards(
        serverData.cards ?? [],
        additionalDetails,
      ),
      isComplete: serverData.isComplete ?? false,
    };
  }
  const parsed = parseFlashcards(content ?? "");
  return {
    flashcards: parsed.flashcards.map((card) => ({
      front: card.front,
      back: card.back,
    })),
    isComplete: parsed.isComplete,
  };
}
