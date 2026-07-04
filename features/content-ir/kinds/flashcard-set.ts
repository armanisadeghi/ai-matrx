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
import {
  additionalDetailsSection,
  collectExtras,
  extrasList,
  formatInlineValue,
  isRecordValue,
  joinBlocks,
} from "./kind-markdown-utils";

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

  // Set title: `title` is canonical; `set_title` is the OLD agent payload
  // key, tolerated as a transition alias.
  const rawTitle = envelope.root.value.title ?? envelope.root.value.set_title;
  if (typeof rawTitle === "string" && rawTitle !== "") {
    serverData.title = rawTitle;
  }

  return serverData;
}

// ---------------------------------------------------------------------------
// toMarkdown facet — flashcard_set → human-readable Q&A markdown.
//
// Mirrors the established "Front: / Back:" copy convention
// (components/mardown-display/blocks/flashcards/flashcards-set-parts.tsx
// `cardsToMarkdown`) upgraded to real markdown structure: one heading per
// card, bold Front/Back labels, card metadata as a small bullet list,
// tiered subcards as a nested list. Unknown keys (card-level inline; set-
// level under "Additional details") never silently vanish.
// ---------------------------------------------------------------------------

const CARD_KNOWN_KEYS = [
  "front",
  "back",
  "card_kind",
  "difficulty",
  "topic",
  "tags",
  "audio_explanation",
  "detailed_explanation",
  "subcards",
];

const SET_KNOWN_KEYS = ["title", "set_title", "cards"];

function subcardLine(subcard: Record<string, unknown>): string {
  const front = typeof subcard.front === "string" ? subcard.front : "";
  const back = typeof subcard.back === "string" ? subcard.back : "";
  const parts = [`- **Front:** ${front} — **Back:** ${back}`];
  const meta = extrasList(collectExtras(subcard, ["front", "back"]));
  // Nested bullets stay inside the parent list item (no blank lines).
  if (meta) parts.push(meta.replace(/^- /gm, "  - "));
  return parts.join("\n");
}

function cardMarkdown(card: Record<string, unknown>, index: number): string {
  const blocks: Array<string | null> = [`## Card ${index + 1}`];

  blocks.push(
    `**Front:** ${typeof card.front === "string" ? card.front : ""}`,
  );
  if (typeof card.back === "string" && card.back !== "") {
    blocks.push(`**Back:** ${card.back}`);
  }

  const meta: string[] = [];
  if (typeof card.topic === "string" && card.topic !== "") {
    meta.push(`- **Topic:** ${card.topic}`);
  }
  if (typeof card.difficulty === "string" && card.difficulty !== "") {
    meta.push(`- **Difficulty:** ${card.difficulty}`);
  }
  if (Array.isArray(card.tags) && card.tags.length > 0) {
    meta.push(`- **Tags:** ${formatInlineValue(card.tags)}`);
  }
  // Card-level unknown keys ride the same list — nothing vanishes.
  const cardExtras = extrasList(collectExtras(card, CARD_KNOWN_KEYS));
  if (cardExtras) meta.push(cardExtras);
  if (meta.length > 0) blocks.push(meta.join("\n"));

  if (
    typeof card.detailed_explanation === "string" &&
    card.detailed_explanation !== ""
  ) {
    blocks.push(`**Detailed explanation:** ${card.detailed_explanation}`);
  }
  if (
    typeof card.audio_explanation === "string" &&
    card.audio_explanation !== ""
  ) {
    blocks.push(`**Audio explanation:** ${card.audio_explanation}`);
  }

  if (Array.isArray(card.subcards) && card.subcards.length > 0) {
    const lines = card.subcards.filter(isRecordValue).map(subcardLine);
    if (lines.length > 0) {
      blocks.push(`**Subcards:**\n\n${lines.join("\n")}`);
    }
  }

  return joinBlocks(blocks);
}

export function flashcardsMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const rawTitle = value.title ?? value.set_title;
  const title =
    typeof rawTitle === "string" && rawTitle !== "" ? rawTitle : "Flashcards";

  const cards = Array.isArray(value.cards)
    ? value.cards.filter(isRecordValue)
    : [];

  return joinBlocks([
    `# ${title}`,
    ...cards.map(cardMarkdown),
    additionalDetailsSection(collectExtras(value, SET_KNOWN_KEYS)),
  ]);
}
