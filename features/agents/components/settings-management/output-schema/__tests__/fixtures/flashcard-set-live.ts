/**
 * LIVE fixture — pulled from Supabase (Matrx Main, project txzxabzwovsujtloxrus)
 * on 2026-07-17:
 *
 *   - `LIVE_DEFS` / `LIVE_EDGES`: the `content_ir.kind_definition` +
 *     `content_ir.kind_edge` rows for `flashcard_set` and its transitive
 *     children (`flashcard`, `enhanced_flashcard`, `tiered_flashcard`,
 *     `basic_card`).
 *   - `LIVE_EMITTED_BLOCK_SCHEMA`: that row's materialized
 *     `emitted_block_schema` — the canonical strict `__kind`-injected export
 *     the platform publishes (kind-migration-plan composition), i.e. the
 *     schema the binder must write byte-for-byte (canonical form; jsonb
 *     reorders keys, so equality is over sorted-keys canonical JSON).
 *
 * If the live kind changes, re-pull; the test failing on a stale fixture is
 * the intended tripwire that the written contract drifted.
 */

import type {
  KindDefProjection,
  KindEdgeProjection,
} from "@/features/content-ir/registry/schema-source-kind-tables";

export const LIVE_DEFS: KindDefProjection[] = [
  {
    id: "2e423626-3e02-4ad1-81d4-6ed694aac037",
    kind: "basic_card",
    label: "Basic Card",
    data: [
      { name: "back", type: "string", required: true },
      { name: "front", type: "string", required: true },
      { name: "topic", type: "string" },
      { name: "difficulty", type: "string" },
    ],
    is_active: true,
    metadata: null,
  },
  {
    id: "5757d8b8-1467-4dd2-8f87-19dfc6b2d20d",
    kind: "enhanced_flashcard",
    label: "Enhanced Flashcard",
    data: [
      { name: "back", type: "string", required: true },
      { name: "tags", type: "string[]" },
      { name: "front", type: "string", required: true },
      { name: "topic", type: "string" },
      { name: "card_kind", type: "string" },
      { name: "difficulty", type: "string" },
      { name: "audio_explanation", type: "string" },
      { name: "detailed_explanation", type: "string" },
    ],
    is_active: true,
    metadata: null,
  },
  {
    id: "7e61b88d-e5a7-4eb4-809f-ff3a3a5258a9",
    kind: "flashcard",
    label: "Flashcard",
    data: [
      { name: "back", type: "string", required: true },
      { name: "tags", type: "string[]" },
      { name: "front", type: "string", required: true },
      { name: "topic", type: "string" },
      { name: "card_kind", type: "string" },
      { name: "difficulty", type: "string" },
    ],
    is_active: true,
    metadata: null,
  },
  {
    id: "5665d775-febc-4bf9-ad2d-7972f33f8a4b",
    kind: "flashcard_set",
    label: "Flashcard Set",
    data: [
      { name: "cards", type: "array", required: true },
      { name: "title", type: "string", required: true },
    ],
    is_active: true,
    metadata: null,
  },
  {
    id: "a7f26466-cab3-42e2-845f-8d19353a8e12",
    kind: "tiered_flashcard",
    label: "Tiered Flashcard",
    data: [
      { name: "back", type: "string", required: true },
      { name: "tags", type: "string[]" },
      { name: "front", type: "string", required: true },
      { name: "topic", type: "string" },
      { name: "subcards", type: "array", required: true },
      { name: "card_kind", type: "string" },
      { name: "difficulty", type: "string" },
    ],
    is_active: true,
    metadata: null,
  },
];

export const LIVE_EDGES: KindEdgeProjection[] = [
  {
    parent_definition_id: "5665d775-febc-4bf9-ad2d-7972f33f8a4b",
    field_name: "cards",
    child_definition_id: "7e61b88d-e5a7-4eb4-809f-ff3a3a5258a9",
    position: 0,
  },
  {
    parent_definition_id: "5665d775-febc-4bf9-ad2d-7972f33f8a4b",
    field_name: "cards",
    child_definition_id: "5757d8b8-1467-4dd2-8f87-19dfc6b2d20d",
    position: 1,
  },
  {
    parent_definition_id: "5665d775-febc-4bf9-ad2d-7972f33f8a4b",
    field_name: "cards",
    child_definition_id: "a7f26466-cab3-42e2-845f-8d19353a8e12",
    position: 2,
  },
  {
    parent_definition_id: "a7f26466-cab3-42e2-845f-8d19353a8e12",
    field_name: "subcards",
    child_definition_id: "2e423626-3e02-4ad1-81d4-6ed694aac037",
    position: 0,
  },
];

/** `content_ir.kind_definition.emitted_block_schema` for flashcard_set (live). */
export const LIVE_EMITTED_BLOCK_SCHEMA: Record<string, unknown> = {
  type: "object",
  $defs: {
    flashcard: {
      type: "object",
      required: ["__kind", "back", "front"],
      properties: {
        back: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        front: { type: "string" },
        topic: { type: "string" },
        __kind: {
          type: "string",
          const: "flashcard",
          description: "Block discriminator for render pipeline.",
        },
        card_kind: { type: "string" },
        difficulty: { type: "string" },
      },
      additionalProperties: false,
    },
    basic_card: {
      type: "object",
      required: ["__kind", "back", "front"],
      properties: {
        back: { type: "string" },
        front: { type: "string" },
        topic: { type: "string" },
        __kind: {
          type: "string",
          const: "basic_card",
          description: "Block discriminator for render pipeline.",
        },
        difficulty: { type: "string" },
      },
      additionalProperties: false,
    },
    tiered_flashcard: {
      type: "object",
      required: ["__kind", "back", "front", "subcards"],
      properties: {
        back: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        front: { type: "string" },
        topic: { type: "string" },
        __kind: {
          type: "string",
          const: "tiered_flashcard",
          description: "Block discriminator for render pipeline.",
        },
        subcards: { type: "array", items: { $ref: "#/$defs/basic_card" } },
        card_kind: { type: "string" },
        difficulty: { type: "string" },
      },
      additionalProperties: false,
    },
    enhanced_flashcard: {
      type: "object",
      required: ["__kind", "back", "front"],
      properties: {
        back: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        front: { type: "string" },
        topic: { type: "string" },
        __kind: {
          type: "string",
          const: "enhanced_flashcard",
          description: "Block discriminator for render pipeline.",
        },
        card_kind: { type: "string" },
        difficulty: { type: "string" },
        audio_explanation: { type: "string" },
        detailed_explanation: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  required: ["__kind", "cards", "title"],
  properties: {
    cards: {
      type: "array",
      items: {
        anyOf: [
          { $ref: "#/$defs/flashcard" },
          { $ref: "#/$defs/enhanced_flashcard" },
          { $ref: "#/$defs/tiered_flashcard" },
        ],
      },
    },
    title: { type: "string" },
    __kind: {
      type: "string",
      const: "flashcard_set",
      description: "Block discriminator for render pipeline.",
    },
  },
  additionalProperties: false,
};
