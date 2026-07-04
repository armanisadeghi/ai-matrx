/**
 * Eager (compiled-in) system kinds. These are available before any network
 * fetch — the parser can speculate and validate against them from the first
 * streamed byte.
 *
 * flashcard_set / flashcard are the founding pair (the concept-proof). The
 * eight JSON_BLOCK_PATTERNS types join here as they migrate (Phase 4).
 */

import type { KindDefinition } from "./kind-registry.types";

export const SYSTEM_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "flashcard_set",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "flashcards",
    artifact: { canvasType: "flashcards" },
    persistence: { persistStructured: true },
    schema: {
      kind: "flashcard_set",
      fields: {
        set_title: { type: "string", required: true },
        cards: { type: "array", itemKinds: ["flashcard"], required: true },
        additionalDetails: { type: "inline_object", fields: {} },
      },
    },
  },
  {
    kind: "flashcard",
    schemaSource: "system",
    tier: "eager",
    schema: {
      kind: "flashcard",
      fields: {
        front: { type: "string", required: true },
        back: { type: "string", required: true, nullable: true },
        card_kind: { type: "string" },
        difficulty: { type: "string" },
        topic: { type: "string" },
        additionalDetails: { type: "inline_object", fields: {} },
      },
    },
  },
];
