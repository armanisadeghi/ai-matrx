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

import type { FlashcardsBlockData } from "@ai-matrx/agents/generated/stream-events";
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
  /**
   * The producer is done with this block — the stream ended (for ANY reason:
   * success, error, stop, provider safety stop) or the content came from a
   * saved row. A settled set is ALWAYS complete: every card that arrived
   * renders, and nothing waits for more. Without it, completion is inferred
   * from the `</flashcards>` sentinel alone, which `<artifact>` framing and
   * saved canvas rows never carry — the "Loading flashcard..." that never
   * ends (2026-10-06, a recitation-stopped Flashcard Generator turn).
   */
  settled?: boolean;
}

/** Shown on a settled card whose answer never arrived. */
export const MISSING_BACK_TEXT = "_No answer — the response stopped early._";

const COMPLETION_SENTINEL = "</flashcards>";

export function deriveFlashcardsSet({
  content,
  serverData,
  additionalDetails,
  settled = false,
}: DeriveFlashcardsSetArgs): {
  flashcards: NormalizedFlashcard[];
  isComplete: boolean;
} {
  if (serverData) {
    const cards = EXPERIMENTAL_normalizePreParsedFlashcards(
      serverData.cards ?? [],
      additionalDetails,
    );
    if (!settled) {
      return { flashcards: cards, isComplete: serverData.isComplete ?? false };
    }
    return {
      flashcards: cards.map((card) =>
        card.back === null || card.back === undefined
          ? { ...card, back: MISSING_BACK_TEXT }
          : card,
      ),
      isComplete: true,
    };
  }
  const text = content ?? "";
  // Settled text is final: append the sentinel so the parser includes the
  // last card instead of holding it as a "partial" that never completes.
  const parsed = parseFlashcards(
    settled && !text.includes(COMPLETION_SENTINEL)
      ? `${text}\n${COMPLETION_SENTINEL}`
      : text,
  );
  const flashcards: NormalizedFlashcard[] = parsed.flashcards.map((card) => ({
    front: card.front,
    back: card.back,
  }));
  // A settled card cut off after its front keeps its place, saying so.
  if (settled && parsed.partialCard?.front) {
    flashcards.push({
      front: parsed.partialCard.front,
      back: parsed.partialCard.back || MISSING_BACK_TEXT,
    });
  }
  return { flashcards, isComplete: settled || parsed.isComplete };
}
