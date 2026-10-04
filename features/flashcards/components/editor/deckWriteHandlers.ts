// features/flashcards/components/editor/deckWriteHandlers.ts
//
// THE DECK'S AGENT WRITES — one set of handlers for the deck's surface targets, shared by every
// page that lets a person change the deck: the deck page / Board tile (`SetDetailView`,
// surface `matrx-user/education-flashcard-set`) and the Edit page (`EditSetView`, surface
// `matrx-user/education-flashcard-editor`). The targets are declared on both manifests with the
// same names. Every handler goes through the SAME fcService call the person's own controls use —
// never a parallel write path — and throws on a bad shape or a failed save so the seam can hand
// the agent a real error. The host reacts to what landed through the `on…` callbacks.

import { fcService } from "../../data/fcService";
import type { NewCardInput, SetWithCards } from "../../data/types";
import type { SurfaceWriteHandlers } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import {
  asCardKind,
  CARD_KIND,
  matchingDynamicContent,
} from "../../utils/cardVariants";
import { parseMatchingCardUpdate, parseNewMatchingCard } from "./flashcardEditorAgentWrites";

type SavedSet = NonNullable<Awaited<ReturnType<typeof fcService.updateSet>>["data"]>;
type SavedCard = NonNullable<Awaited<ReturnType<typeof fcService.updateCard>>["data"]>;

export interface DeckWriteContext {
  setId: string;
  /** The deck as the page shows it now (null while it has not loaded). */
  getData: () => SetWithCards | null;
  /** The name / topic / description as the page shows them now (fields a write omits keep these). */
  currentSetFields: () => { name: string; topic: string; description: string };
  /** The deck's own row was saved (the service returned it). */
  onSetSaved: (saved: SavedSet) => void;
  /** One card was saved (the service returned it). */
  onCardSaved: (saved: SavedCard) => void;
  /** Cards were added (positions are assigned server-side: re-read for the true order). */
  onCardsChanged: () => void;
  /** One card was archived. */
  onCardDeleted: (id: string) => void;
  /** Throws a sentence when the person may not change this deck (view only): called first by every handler. */
  assertWritable?: (target: string) => void;
}

// ─── Agent write-target input validation ─────────────────────────────────────
// The seam turns a throw into the safe error envelope the agent reads, so these
// throw loudly rather than coercing. The "plain text, not JSON" wording is
// deliberate and load-bearing: the inline-tool layer PARSES a JSON-looking
// argument before the handler sees it, and without being told, a model that
// gets a shape error "fixes" it by double-encoding — which lands escaped \n and
// stray quotes in the learner's card.
const PLAIN_TEXT_RULE =
  "It must be a plain text string, not JSON and not JSON-encoded — no code fence, no surrounding quotes.";

function writeRecord(value: unknown, target: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${target} expects an object value.`);
  }
  return value as Record<string, unknown>;
}

/** A present-but-optional text field. Returns undefined when omitted. */
function writeText(
  obj: Record<string, unknown>,
  key: string,
  target: string,
): string | undefined {
  const raw = obj[key];
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") {
    throw new Error(
      `${target}: ${key} must be a string when provided. ${PLAIN_TEXT_RULE}`,
    );
  }
  return raw;
}

export function buildDeckWriteHandlers(ctx: DeckWriteContext): SurfaceWriteHandlers {
  return {
    set_details: async (value: unknown) => {
      ctx.assertWritable?.("set_details");
      const data = ctx.getData();
      const obj = writeRecord(value, "set_details");
      const name = writeText(obj, "name", "set_details");
      const topic = writeText(obj, "topic", "set_details");
      const description = writeText(obj, "description", "set_details");
      if (name === undefined && topic === undefined && description === undefined) {
        throw new Error(
          "set_details: provide at least one of name, topic, or description.",
        );
      }
      if (name !== undefined && !name.trim()) {
        throw new Error(
          `set_details: name cannot be empty. ${PLAIN_TEXT_RULE}`,
        );
      }
      // Omitted fields keep their CURRENT value — a topic proposal must never
      // wipe the description the learner wrote.
      const current = ctx.currentSetFields();
      const next = {
        name: name ?? current.name,
        topic: topic ?? current.topic,
        description: description ?? current.description,
      };
      const res = await fcService.updateSet(ctx.setId, {
        name: next.name.trim() || "Untitled set",
        description: next.description.trim() || null,
        topic: next.topic.trim() || null,
      });
      if (res.error || !res.data) {
        throw new Error(res.error ?? "Couldn't save the set details.");
      }
      ctx.onSetSaved(res.data);
    },

    card_content: async (value: unknown) => {
      ctx.assertWritable?.("card_content");
      const data = ctx.getData();
      const obj = writeRecord(value, "card_content");
      const cardId = writeText(obj, "card_id", "card_content");
      if (!cardId?.trim()) {
        throw new Error(
          "card_content: card_id is required — read the `cards` value to get the id of the card you mean.",
        );
      }
      const card = data?.cards.find((c) => c.id === cardId.trim());
      if (!card) {
        throw new Error(
          `card_content: no card with id "${cardId.trim()}" is in this set. Read the \`cards\` value for the ids actually on this page.`,
        );
      }
      const kind = asCardKind(card.card_kind);
      if (kind === CARD_KIND.matching) {
        throw new Error(
          "card_content: card " +
            cardId.trim() +
            " is a MATCHING card — its content is structured left/right pairs, not a front/back, so it can only be edited on the page.",
        );
      }
      const front = writeText(obj, "front", "card_content");
      const back = writeText(obj, "back", "card_content");
      if (front === undefined && back === undefined) {
        throw new Error(
          `card_content: provide front and/or back. ${PLAIN_TEXT_RULE}`,
        );
      }
      if (front !== undefined && !front.trim()) {
        throw new Error(
          `card_content: front cannot be empty — a card with no question is unstudyable. ${PLAIN_TEXT_RULE}`,
        );
      }
      const res = await fcService.updateCard(card.id, {
        front: (front ?? card.front).trim(),
        back: (back ?? card.back ?? "").trim(),
        ...(kind === CARD_KIND.cloze ? { card_kind: CARD_KIND.cloze } : {}),
      });
      if (res.error || !res.data) {
        throw new Error(res.error ?? "Couldn't save the card.");
      }
      ctx.onCardSaved(res.data);
    },

    matching_card_content: async (value: unknown) => {
      ctx.assertWritable?.("matching_card_content");
      const data = ctx.getData();
      if (!data) throw new Error("matching_card_content: the set has not loaded.");
      const plan = parseMatchingCardUpdate(value, data.cards);
      const card = data.cards.find((current) => current.id === plan.id);
      if (!card) throw new Error("matching_card_content: this card is no longer in the open set.");
      const result = await fcService.updateCardVersioned(card.id, plan.expectedVersion, {
        ...(plan.prompt === undefined ? {} : { front: plan.prompt }),
        ...(plan.pairs === undefined
          ? {}
          : { dynamic_content: matchingDynamicContent(plan.pairs) }),
        card_kind: CARD_KIND.matching,
      });
      if (result.error || !result.data)
        throw new Error(result.error ?? "Couldn't save the matching card.");
      ctx.onCardSaved(result.data);
    },

    add_cards: async (value: unknown) => {
      ctx.assertWritable?.("add_cards");
      const data = ctx.getData();
      const obj = writeRecord(value, "add_cards");
      const raw = obj.cards;
      if (!Array.isArray(raw) || raw.length === 0) {
        throw new Error(
          "add_cards: cards must be a non-empty array of { front, back?, card_kind? }.",
        );
      }
      const cards = raw.map((entry, index): NewCardInput => {
        const record = writeRecord(entry, `add_cards: cards[${index}]`);
        const front = writeText(record, "front", `add_cards: cards[${index}]`);
        if (!front?.trim()) {
          throw new Error(
            `add_cards: cards[${index}].front must be a non-empty string. ${PLAIN_TEXT_RULE}`,
          );
        }
        const back =
          writeText(record, "back", `add_cards: cards[${index}]`) ?? "";
        const rawKind = writeText(
          record,
          "card_kind",
          `add_cards: cards[${index}]`,
        );
        // Enum check against the real vocabulary constant, never a re-typed
        // literal. Matching cards carry structured pairs in dynamic_content.
        const kind = rawKind?.trim();
        if (
          kind !== undefined &&
          kind !== CARD_KIND.basic &&
          kind !== CARD_KIND.cloze &&
          kind !== CARD_KIND.matching
        ) {
          throw new Error(
            `add_cards: cards[${index}].card_kind must be "${CARD_KIND.basic}", "${CARD_KIND.cloze}", or "${CARD_KIND.matching}".`,
          );
        }
        if (kind === CARD_KIND.matching) {
          const matching = parseNewMatchingCard(
            record,
            `add_cards: cards[${index}]`,
          );
          return {
            front: matching.front,
            back: "",
            card_kind: CARD_KIND.matching,
            dynamic_content: matchingDynamicContent(matching.pairs),
          };
        }
        return {
          front: front.trim(),
          back: back.trim(),
          ...(kind ? { card_kind: kind } : {}),
        };
      });
      const res = await fcService.addCards(ctx.setId, cards);
      if (res.error) {
        throw new Error(res.error);
      }
      // Positions are assigned server-side, so refetch for the true order.
      ctx.onCardsChanged();
    },
    delete_cards: async (value: unknown) => {
      ctx.assertWritable?.("delete_cards");
      const data = ctx.getData();
      if (!data) throw new Error("delete_cards: the set has not loaded.");
      const request = writeRecord(value, "delete_cards");
      const id = writeText(request, "card_id", "delete_cards")?.trim();
      const version = request.version;
      if (!id || !Number.isSafeInteger(version) || Object.keys(request).some((key) => key !== "card_id" && key !== "version")) {
        throw new Error("delete_cards: provide { card_id, version } from this loaded set.");
      }
      const current = data.cards.find((card) => card.id === id);
      if (!current) {
        throw new Error(`delete_cards: card ${id} is no longer in the open set.`);
      }
      if (current.version !== version) {
        throw new Error("delete_cards: this card changed. Reload before deleting it.");
      }
      const result = await fcService.deleteCard(id, current.version);
      if (result.error) throw new Error(`delete_cards: ${result.error}`);
      ctx.onCardDeleted(id);
    },
  };
}
