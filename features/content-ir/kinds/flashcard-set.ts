/**
 * flashcard_set kind → FlashcardsBlockData bridge.
 *
 * The founding legacy-bridge facet: a CanonicalBlockIR for a flashcard_set
 * becomes the exact `serverData` the existing FlashcardsBlock already
 * consumes — the component needs zero changes, live streaming included
 * (streaming envelopes carry partial cards; a card whose `back` hasn't
 * arrived maps to back:null, which the block renders as a per-card loader).
 *
 * Card mapping is memoized on the card's tree-value identity (structural
 * sharing means unchanged cards keep their object identity across envelope
 * flushes), so mapped items are reference-stable and memoized card
 * components bail out.
 */

import type { FlashcardsBlockData } from "@/types/python-generated/stream-events";
import type { CanonicalBlockIR, IrResidue } from "../core/ir-types";
import { KIND_KEY } from "../core/kind-schema.types";

type FlashcardsCard = FlashcardsBlockData["cards"][number] &
  Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const cardMemo = new WeakMap<object, FlashcardsCard>();

function mapCard(
  card: Record<string, unknown>,
  residue: IrResidue | null | undefined,
  cardComplete: boolean,
): FlashcardsCard {
  const cached = cardMemo.get(card);
  if (cached) return cached;

  const front = typeof card.front === "string" ? card.front : "";
  const rawBack = card.back;
  const back =
    typeof rawBack === "string"
      ? rawBack === "" && !cardComplete
        ? null // still streaming — the block shows the per-card loader
        : rawBack
      : null;

  const mapped: FlashcardsCard = { front, back };

  for (const [key, value] of Object.entries(card)) {
    if (key === "front" || key === "back" || key === KIND_KEY) continue;
    mapped[key] = value;
  }
  // Zero data loss: unknown keys ride the residue channel, not the snapshot.
  for (const [key, value] of Object.entries(residue?.extra ?? {})) {
    if (key === "front" || key === "back") continue;
    mapped[key] = value;
  }

  cardMemo.set(card, mapped);
  return mapped;
}

export function flashcardsServerDataFromEnvelope(
  envelope: CanonicalBlockIR,
): Record<string, unknown> | undefined {
  if (envelope.root.kind !== "flashcard_set") return undefined;

  const rawCards = envelope.root.value.cards;
  if (!Array.isArray(rawCards)) return undefined;

  const setComplete = envelope.root.status === "complete";
  const cards: FlashcardsCard[] = [];

  for (let i = 0; i < rawCards.length; i++) {
    const card = rawCards[i];
    if (!isRecord(card)) continue;
    if (typeof card.front !== "string" || card.front === "") continue;

    const meta = envelope.nodeIndex?.[`cards.${i}`];
    cards.push(
      mapCard(card, meta?.residue, setComplete || meta?.status === "complete"),
    );
  }

  const serverData: FlashcardsBlockData & Record<string, unknown> = {
    cards,
    isComplete: setComplete,
  };
  return serverData;
}
