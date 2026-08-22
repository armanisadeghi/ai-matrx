"use client";

/**
 * SearchKindNested — the collection's delegation seam for nested kind
 * instances. Every nested item renders through its kind's ONE canonical
 * component, resolved the way the registry resolves it:
 *
 *  - An ACTIVE `content_ir.kind_component` row with `source='db'` and a body
 *    WINS (R6: db overrides bundled): the instance renders through the real
 *    production route path (`SafeBlockRenderer` → `applyIrKindRoute` →
 *    `db_kind_component`), so a user-registered component for `web_result`
 *    reskins every result inside every collection with zero code.
 *  - Otherwise the compiled canonical component renders STATICALLY (same
 *    chunk — no per-item `next/dynamic` re-entry; THE FRAGMENTATION LAW).
 *
 * The envelope for the db path is memoized per item-object identity —
 * structural sharing keeps unchanged items identical across streaming
 * flushes (the flashcard-bridge precedent).
 */

import React from "react";
import { SafeBlockRenderer } from "@/components/mardown-display/chat-markdown/internal-handlers/SafeBlockRenderer";
import type { RenderBlock } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import { envelopeFromCompleteValue } from "@ai-matrx/content-ir";
import { IR_ENVELOPE_KEY } from "@ai-matrx/content-ir";
import { readObjectKind } from "@ai-matrx/content-ir";
import { resolveComponent } from "@/features/content-ir/registry/component-registry";
import {
  DiscussionResultBlock,
  FaqItemBlock,
  NewsResultBlock,
  VideoResultBlock,
  WebResultBlock,
} from "./item-blocks";
import {
  AiAnswerKindBlock,
  EntityCardBlock,
  LocalPlaceBlock,
} from "./place-entity-blocks";
import {
  GeoCoordinatesBlock,
  OpeningHoursBlock,
  PostalAddressBlock,
  RatingBlock,
} from "./primitive-blocks";

const noop = () => {};

/** kind slug → its canonical compiled component (the static fast path). */
const CANONICAL_COMPONENTS: Record<
  string,
  React.ComponentType<{ serverData?: unknown; className?: string }>
> = {
  web_result: WebResultBlock,
  news_result: NewsResultBlock,
  video_result: VideoResultBlock,
  faq_item: FaqItemBlock,
  discussion_result: DiscussionResultBlock,
  local_place: LocalPlaceBlock,
  entity_card: EntityCardBlock,
  ai_answer: AiAnswerKindBlock,
  rating: RatingBlock,
  opening_hours: OpeningHoursBlock,
  postal_address: PostalAddressBlock,
  geo_coordinates: GeoCoordinatesBlock,
};

const nestedBlockMemo = new WeakMap<object, RenderBlock>();

function nestedBlock(value: Record<string, unknown>, kind: string): RenderBlock {
  const cached = nestedBlockMemo.get(value);
  if (cached) return cached;
  const block: RenderBlock = {
    type: "code",
    content: JSON.stringify(value, null, 2),
    language: "json",
    metadata: { [IR_ENVELOPE_KEY]: envelopeFromCompleteValue(value, kind) },
  };
  nestedBlockMemo.set(value, block);
  return block;
}

export function SearchKindNested({
  value,
  className,
}: {
  value: Record<string, unknown>;
  className?: string;
}) {
  const kind = readObjectKind(value);
  if (!kind) return null;

  const resolution = resolveComponent(kind, "web", "output");
  const dbOverride =
    resolution?.resolvedBy === "db" &&
    resolution.source === "db" &&
    resolution.isActive &&
    Boolean(resolution.componentSource?.trim());

  if (dbOverride) {
    return (
      <SafeBlockRenderer
        block={nestedBlock(value, kind)}
        index={0}
        replaceBlockContent={noop}
        handleOpenEditor={noop}
      />
    );
  }

  const Component = CANONICAL_COMPONENTS[kind];
  if (!Component) return null;
  return <Component serverData={value} className={className} />;
}
