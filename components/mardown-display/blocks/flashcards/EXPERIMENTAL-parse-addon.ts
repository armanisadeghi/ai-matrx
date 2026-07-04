import type { FlashcardsBlockData } from "@/types/python-generated/stream-events";
import {
  parseSubcardsFromDetails,
  type FlashcardSubcard,
} from "./flashcard-subcards";

export type EXPERIMENTAL_RenderFlashcard = {
  front: string;
  back: string | null;
  additionalDetails?: Record<string, unknown>;
  subcards?: FlashcardSubcard[];
};

const KNOWN_FLASHCARD_KEYS = new Set(["front", "back", "additionalDetails"]);
const UNRECOGNIZED_FLASHCARD_KEY_PREFIX = "card_extra_";

function isNonEmptyRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  );
}

/**
 * TEMPORARY OVERRIDE — KNOWN WRONG: Generated `FlashcardItem` omits
 * `additionalDetails` and extra per-card fields until the Python/OpenAPI
 * schema catches up. Pre-parsed serverData cards may include those fields;
 * we widen only at this extraction site.
 */
type PreParsedFlashcardRecord = FlashcardsBlockData["cards"][number] &
  Record<string, unknown>;

function EXPERIMENTAL_resolveCardAdditionalDetails(
  card: PreParsedFlashcardRecord,
  blockAdditionalDetails?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const merged: Record<string, unknown> = {};

  if (isNonEmptyRecord(blockAdditionalDetails)) {
    Object.assign(merged, blockAdditionalDetails);
  }

  const existing = card.additionalDetails;
  if (isNonEmptyRecord(existing)) {
    Object.assign(merged, existing);
  }

  for (const [key, value] of Object.entries(card)) {
    if (KNOWN_FLASHCARD_KEYS.has(key)) continue;
    const destKey =
      key in merged ? `${UNRECOGNIZED_FLASHCARD_KEY_PREFIX}${key}` : key;
    merged[destKey] = value;
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}

/** EXPERIMENTAL — test hook for pre-parsed serverData card extras. Not production parser logic. */
export function EXPERIMENTAL_normalizePreParsedFlashcards(
  cards: FlashcardsBlockData["cards"],
  blockAdditionalDetails?: Record<string, unknown>,
): EXPERIMENTAL_RenderFlashcard[] {
  return cards.map((card) => {
    const raw = card as PreParsedFlashcardRecord;
    const additionalDetails = EXPERIMENTAL_resolveCardAdditionalDetails(
      raw,
      blockAdditionalDetails,
    );
    return {
      front: raw.front ?? "",
      back: raw.back ?? null,
      additionalDetails,
      subcards: parseSubcardsFromDetails(additionalDetails),
    };
  });
}
