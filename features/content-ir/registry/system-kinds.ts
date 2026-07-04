/**
 * Eager (compiled-in) system kinds. These are available before any network
 * fetch — the parser can speculate and validate against them from the first
 * streamed byte. They are the pre-warm BOOTSTRAP FALLBACK only: once
 * `ensureWarm()` delivers the flexible_data Block Schemas rows, the DB
 * schemas override these (facets survive — see kind-registry.ts).
 *
 * Shapes mirror the flexible_data "Block Schemas" rows (category
 * `block-schemas`): flashcard_set / flashcard / enhanced_flashcard /
 * tiered_flashcard / basic_card. `set_title` stays declared (optional) on
 * flashcard_set as a transition alias for `title` — the OLD agent payload
 * key — until every producer emits `title`.
 */

import type { KindDefinition } from "./kind-registry.types";
import { flashcardsServerDataFromEnvelope } from "../kinds/flashcard-set";

export const SYSTEM_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "flashcard_set",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "flashcards",
    toLegacyServerData: flashcardsServerDataFromEnvelope,
    artifact: { canvasType: "flashcards" },
    persistence: { persistStructured: true },
    schema: {
      kind: "flashcard_set",
      fields: {
        title: { type: "string", required: true },
        // Transition alias — the OLD agent payload key; optional so both
        // shapes validate until every producer emits `title`.
        set_title: { type: "string" },
        cards: {
          type: "array",
          itemKinds: ["flashcard", "enhanced_flashcard", "tiered_flashcard"],
          required: true,
        },
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
        tags: { type: "string[]" },
        additionalDetails: { type: "inline_object", fields: {} },
      },
    },
  },
  {
    kind: "enhanced_flashcard",
    schemaSource: "system",
    tier: "eager",
    schema: {
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
  },
  {
    kind: "tiered_flashcard",
    schemaSource: "system",
    tier: "eager",
    schema: {
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
  },
  {
    kind: "basic_card",
    schemaSource: "system",
    tier: "eager",
    schema: {
      kind: "basic_card",
      fields: {
        front: { type: "string", required: true },
        back: { type: "string", required: true },
        topic: { type: "string" },
        difficulty: { type: "string" },
      },
    },
  },
];
