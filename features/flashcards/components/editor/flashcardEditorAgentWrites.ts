import { CARD_KIND, type MatchingPair } from "../../utils/cardVariants";

type RecordValue = Record<string, unknown>;

export type MatchingCardSnapshot = {
  id: string;
  version: number;
  card_kind: string | null;
};

export type MatchingCardUpdatePlan = {
  id: string;
  expectedVersion: number;
  prompt?: string;
  pairs?: MatchingPair[];
};

function object(value: unknown, where: string): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${where} must be an object.`);
  return value as RecordValue;
}

function text(value: unknown, where: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${where} must be non-empty plain text.`);
  return value.trim();
}

export function parseMatchingPairs(value: unknown, where: string): MatchingPair[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new Error(`${where} must be a non-empty array of { left, right } pairs.`);
  return value.map((entry, index) => {
    const pair = object(entry, `${where}[${index}]`);
    const keys = Object.keys(pair);
    if (keys.some((key) => key !== "left" && key !== "right"))
      throw new Error(`${where}[${index}] only accepts left and right.`);
    return {
      left: text(pair.left, `${where}[${index}].left`),
      right: text(pair.right, `${where}[${index}].right`),
    };
  });
}

/** Parse an approved agent update against the card snapshot it was shown. */
export function parseMatchingCardUpdate(
  value: unknown,
  cards: readonly MatchingCardSnapshot[],
): MatchingCardUpdatePlan {
  const record = object(value, "matching_card_content");
  const keys = Object.keys(record);
  if (
    keys.some(
      (key) =>
        key !== "card_id" &&
        key !== "expected_version" &&
        key !== "prompt" &&
        key !== "pairs",
    )
  )
    throw new Error(
      "matching_card_content only accepts card_id, expected_version, prompt, and pairs.",
    );
  const id = text(record.card_id, "matching_card_content.card_id");
  if (!Number.isSafeInteger(record.expected_version) || record.expected_version < 1)
    throw new Error(
      "matching_card_content.expected_version must be the positive version from cards.",
    );
  const current = cards.find((card) => card.id === id);
  if (!current)
    throw new Error("matching_card_content names no card in this open set.");
  if (current.card_kind !== CARD_KIND.matching)
    throw new Error("matching_card_content only updates matching cards.");
  if (current.version !== record.expected_version)
    throw new Error(
      "matching_card_content: this card changed. Reload before editing it.",
    );
  const prompt =
    record.prompt === undefined
      ? undefined
      : text(record.prompt, "matching_card_content.prompt");
  const pairs =
    record.pairs === undefined
      ? undefined
      : parseMatchingPairs(record.pairs, "matching_card_content.pairs");
  if (prompt === undefined && pairs === undefined)
    throw new Error("matching_card_content must provide prompt and/or pairs.");
  return { id, expectedVersion: current.version, ...(prompt ? { prompt } : {}), ...(pairs ? { pairs } : {}) };
}

/** Parse the matching-only fields accepted by the existing add_cards target. */
export function parseNewMatchingCard(value: unknown, where: string): {
  front: string;
  pairs: MatchingPair[];
} {
  const record = object(value, where);
  return {
    front: text(record.front, `${where}.front`),
    pairs: parseMatchingPairs(record.pairs, `${where}.pairs`),
  };
}
