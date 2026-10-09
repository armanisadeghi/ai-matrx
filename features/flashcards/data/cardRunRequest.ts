// features/flashcards/data/cardRunRequest.ts
//
// What a card run asked for, as the JSON `useTabBoundRun` keeps on the device
// (lib/wizard-draft/useTabBoundRun.ts): the count, the topic, and the Sources
// exactly as chosen (the same frozen shape the deck itself records —
// `deckSourceSetPatch`). Make the deck and Add more cards both use it, so a run
// that stopped with its page is offered again with the SAME count and material.

import type { SourceSet } from "@ai-matrx/agents/sources";
import type { SourceDraft } from "@ai-matrx/agents/sources/runtime";
import { asCardKind, type CardKind } from "@/features/flashcards/utils/cardVariants";
import { deckDraftsFromMetadata, deckSourceSetPatch, type DeckSourceName } from "./deckSourceSet";

export interface CardRunRequest {
  count: number;
  topic: string;
  drafts: SourceDraft[];
  /** Card types the person asked for (empty = any). */
  cardKinds: CardKind[];
  /** What the new cards should focus on, in the person's words. */
  instruction: string;
}

/** The tab-bound run key for one deck's "Add more cards". */
export function addMoreRunKey(setId: string): string {
  return `flashcards:add-more:${setId}`;
}

/** The tab-bound run key for the new-deck page. */
export const CREATE_DECK_RUN_KEY = "flashcards:new";

export function cardRunRequest(
  count: number,
  sourceSet: SourceSet,
  names: Record<string, DeckSourceName>,
  topic = "",
  steer: { cardKinds?: readonly CardKind[]; instruction?: string } = {},
): Record<string, unknown> {
  return {
    count,
    topic,
    ...(steer.cardKinds?.length ? { cardKinds: [...steer.cardKinds] } : {}),
    ...(steer.instruction?.trim() ? { instruction: steer.instruction.trim() } : {}),
    ...deckSourceSetPatch(sourceSet, names),
  };
}

/** The stored request back, or null when it is not one we can repeat. */
export function restoreCardRunRequest(data: Record<string, unknown>): CardRunRequest | null {
  const count = data.count;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1) return null;
  const topic = typeof data.topic === "string" ? data.topic : "";
  const drafts = deckDraftsFromMetadata(data) ?? [];
  if (drafts.length === 0 && !topic.trim()) return null;
  const cardKinds = Array.isArray(data.cardKinds)
    ? [...new Set(data.cardKinds.filter((k): k is string => typeof k === "string").map(asCardKind))]
    : [];
  const instruction = typeof data.instruction === "string" ? data.instruction : "";
  return { count, topic, drafts, cardKinds, instruction };
}
