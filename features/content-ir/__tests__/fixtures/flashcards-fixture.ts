/**
 * Shared golden fixture: the flashcard kind family and canonical sample
 * payloads, mirroring the compiled system kinds (registry/system-kinds.ts),
 * which in turn mirror the flexible_data "Block Schemas" rows. Used by parser
 * goldens, normalize idempotence, and the stream-vs-splitter parity suite.
 *
 * `title` is the canonical set-title key; `set_title` stays declared
 * (optional) as the transition alias for the OLD agent payload shape.
 */

import type { KindSchema } from "../../core/kind-schema.types";

export const FLASHCARD_SCHEMAS: Record<string, KindSchema> = {
  flashcard_set: {
    kind: "flashcard_set",
    fields: {
      title: { type: "string", required: true },
      // Transition alias — the OLD agent payload key.
      set_title: { type: "string" },
      cards: {
        type: "array",
        itemKinds: ["flashcard", "enhanced_flashcard", "tiered_flashcard"],
        required: true,
      },
      additionalDetails: {
        type: "inline_object",
        fields: {},
      },
    },
  },
  flashcard: {
    kind: "flashcard",
    fields: {
      front: { type: "string", required: true },
      back: { type: "string", required: true, nullable: true },
      card_kind: { type: "string" },
      difficulty: { type: "string" },
      topic: { type: "string" },
      tags: { type: "string[]" },
    },
  },
  enhanced_flashcard: {
    kind: "enhanced_flashcard",
    fields: {
      front: { type: "string", required: true },
      back: { type: "string", required: true },
      card_kind: { type: "string" },
      difficulty: { type: "string" },
      topic: { type: "string" },
      tags: { type: "string[]" },
      audio_explanation: { type: "string" },
      detailed_explanation: { type: "string" },
    },
  },
  tiered_flashcard: {
    kind: "tiered_flashcard",
    fields: {
      front: { type: "string", required: true },
      back: { type: "string", required: true },
      card_kind: { type: "string" },
      difficulty: { type: "string" },
      topic: { type: "string" },
      tags: { type: "string[]" },
      subcards: { type: "array", itemKinds: ["basic_card"], required: true },
    },
  },
  basic_card: {
    kind: "basic_card",
    fields: {
      front: { type: "string", required: true },
      back: { type: "string", required: true },
      topic: { type: "string" },
      difficulty: { type: "string" },
    },
  },
};

/**
 * Single-member-itemKinds variant for SPECULATION tests only. Array-item
 * speculative descent requires exactly one itemKinds member; the production
 * flashcard_set (multi-kind cards) no longer speculates on card open — cards
 * resolve via pending_kind → __kind instead.
 */
export const SPECULATION_SCHEMAS: Record<string, KindSchema> = {
  flashcard_set: {
    kind: "flashcard_set",
    fields: {
      title: { type: "string", required: true },
      set_title: { type: "string" },
      cards: { type: "array", itemKinds: ["flashcard"], required: true },
      additionalDetails: {
        type: "inline_object",
        fields: {},
      },
    },
  },
  flashcard: FLASHCARD_SCHEMAS.flashcard,
};

export const FLASHCARD_SET_JSON = JSON.stringify({
  __kind: "flashcard_set",
  title: "Cell Biology",
  cards: [
    { __kind: "flashcard", front: "What is a mitochondrion?", back: "The powerhouse of the cell", topic: "organelles" },
    { __kind: "flashcard", front: "What is a ribosome?", back: "Protein synthesis machine" },
  ],
});

/** Same set but with keys the schema does not know — residue material. */
export const FLASHCARD_SET_WITH_EXTRAS_JSON = JSON.stringify({
  __kind: "flashcard_set",
  title: "Chemistry",
  audio_url: "https://example.com/set.mp3",
  cards: [
    {
      __kind: "flashcard",
      front: "H2O?",
      back: "Water",
      image_ref: "img-123",
      sources: ["textbook-ch4"],
    },
  ],
});

/** Every card kind of the new multi-kind shape in one set. */
export const FLASHCARD_SET_MULTI_KIND_JSON = JSON.stringify({
  __kind: "flashcard_set",
  title: "Mixed Deck",
  cards: [
    { __kind: "flashcard", front: "Q1?", back: "A1" },
    {
      __kind: "enhanced_flashcard",
      front: "Q2?",
      back: "A2",
      detailed_explanation: "Because physics.",
    },
    {
      __kind: "tiered_flashcard",
      front: "Q3?",
      back: "A3",
      subcards: [{ __kind: "basic_card", front: "Q3a?", back: "A3a" }],
    },
  ],
});

export const UNKNOWN_KIND_JSON = JSON.stringify({
  __kind: "quantum_widget",
  title: "nobody registered me",
});

export const MISSING_KIND_JSON = JSON.stringify({
  title: "No discriminator here",
  cards: [],
});
