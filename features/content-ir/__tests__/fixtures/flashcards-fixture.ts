/**
 * Shared golden fixture: the flashcard_set / flashcard kind pair and a
 * canonical sample payload. Used by parser goldens, normalize idempotence,
 * and (Phase 3) the stream-vs-splitter parity suite.
 */

import type { KindSchema } from "../../core/kind-schema.types";

export const FLASHCARD_SCHEMAS: Record<string, KindSchema> = {
  flashcard_set: {
    kind: "flashcard_set",
    fields: {
      set_title: { type: "string", required: true },
      cards: { type: "array", itemKinds: ["flashcard"], required: true },
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
      topic: { type: "string" },
    },
  },
};

export const FLASHCARD_SET_JSON = JSON.stringify({
  __kind: "flashcard_set",
  set_title: "Cell Biology",
  cards: [
    { __kind: "flashcard", front: "What is a mitochondrion?", back: "The powerhouse of the cell", topic: "organelles" },
    { __kind: "flashcard", front: "What is a ribosome?", back: "Protein synthesis machine" },
  ],
});

/** Same set but with keys the schema does not know — residue material. */
export const FLASHCARD_SET_WITH_EXTRAS_JSON = JSON.stringify({
  __kind: "flashcard_set",
  set_title: "Chemistry",
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

export const UNKNOWN_KIND_JSON = JSON.stringify({
  __kind: "quantum_widget",
  title: "nobody registered me",
});

export const MISSING_KIND_JSON = JSON.stringify({
  set_title: "No discriminator here",
  cards: [],
});
