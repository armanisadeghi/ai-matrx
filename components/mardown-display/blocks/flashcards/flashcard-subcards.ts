/**
 * Subcard extraction — core primitive for tiered / expandable flashcards.
 *
 * Subcards live on a parent card's `additionalDetails.subcards` (or as extra
 * fields on pre-parsed card payloads merged into additionalDetails).
 */

export interface FlashcardSubcard {
  front: string;
  back: string | null;
  additionalDetails?: Record<string, unknown>;
}

const SUBCARD_CORE_KEYS = new Set(["front", "back", "subcards"]);

/** Keys that may hold a nested card list on widened pre-parsed payloads. */
const SUBCARDS_DETAIL_KEYS = ["subcards", "card_extra_subcards"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceSubcardsArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function firstSubcardsArray(details: Record<string, unknown>): unknown[] {
  for (const key of SUBCARDS_DETAIL_KEYS) {
    const raw = details[key];
    const arr = coerceSubcardsArray(raw);
    if (arr.length > 0) return arr;
  }
  return [];
}

function extractSubcardExtras(
  item: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (SUBCARD_CORE_KEYS.has(key)) continue;
    extras[key] = value;
  }
  return Object.keys(extras).length > 0 ? extras : undefined;
}

function normalizeSubcardItem(item: unknown): FlashcardSubcard | null {
  if (!isRecord(item)) return null;
  const front = typeof item.front === "string" ? item.front.trim() : "";
  if (!front) return null;

  let back: string | null = null;
  if (typeof item.back === "string") {
    back = item.back;
  } else if (item.back === null) {
    back = null;
  }

  return {
    front,
    back,
    additionalDetails: extractSubcardExtras(item),
  };
}

/** Parse nested study cards from a parent card's additional details. */
export function parseSubcardsFromDetails(
  details?: Record<string, unknown> | null,
): FlashcardSubcard[] {
  if (!details) return [];
  const raw = firstSubcardsArray(details);
  if (raw.length === 0) return [];

  return raw
    .map(normalizeSubcardItem)
    .filter((card): card is FlashcardSubcard => card !== null);
}

/** Prefer explicit subcards; fall back to additionalDetails (and prefixed keys). */
export function resolveFlashcardSubcards(
  additionalDetails?: Record<string, unknown> | null,
  explicitSubcards?: FlashcardSubcard[] | null,
): FlashcardSubcard[] {
  if (explicitSubcards && explicitSubcards.length > 0) {
    return explicitSubcards;
  }
  return parseSubcardsFromDetails(additionalDetails);
}

export function hasFlashcardSubcards(
  details?: Record<string, unknown> | null,
): boolean {
  return parseSubcardsFromDetails(details).length > 0;
}

/** Title for a subcard set window — parent front or generic fallback. */
export function subcardsWindowTitle(
  parentFront: string | undefined,
  count: number,
): string {
  const base =
    parentFront && parentFront.trim().length > 0
      ? parentFront.trim().slice(0, 48) +
        (parentFront.trim().length > 48 ? "…" : "")
      : "Go deeper";
  return `${base} · ${count} card${count === 1 ? "" : "s"}`;
}
