"use client";

/**
 * ScraperKindNested — the delegation seam for nested kind instances.
 *
 * Every nested item renders through ITS kind's ONE canonical component,
 * resolved the way the registry resolves it:
 *
 *  - An ACTIVE `content_ir.kind_component` row with `source='db'` and a body
 *    WINS (db overrides bundled), so a user-registered component for
 *    `page_link` reskins every link inside every page with zero code.
 *  - Otherwise the compiled canonical component renders STATICALLY — same
 *    chunk, no per-item `next/dynamic` re-entry (THE FRAGMENTATION LAW).
 *
 * The envelope for the db path is memoized per item-object identity, so
 * structural sharing keeps unchanged items identical across streaming flushes.
 */

import React from "react";
import { SafeBlockRenderer } from "@/components/mardown-display/chat-markdown/internal-handlers/SafeBlockRenderer";
import type { RenderBlock } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import {
  envelopeFromCompleteValue,
  IR_ENVELOPE_KEY,
  readObjectKind,
} from "@ai-matrx/content-ir";
import { resolveComponent } from "@/features/content-ir/registry/component-registry";
import {
  CodeBlockKindBlock,
  ContentFingerprintBlock,
  LinkBucketsBlock,
  PageAudioBlock,
  PageBlockBlock,
  PageHeadingBlock,
  PageImageBlock,
  PageLinkBlock,
  PageListBlock,
  PageMetadataBlock,
  PageRemovalBlock,
  PageSectionBlock,
  PageVideoBlock,
  ParsedTableBlock,
  RedirectHopBlock,
} from "./primitive-blocks";
import PageCleaningReportBlock from "./PageCleaningReportBlock";
import { isRecord } from "./scraper-kind-data";

const noop = () => {};

/** kind slug → its canonical compiled component (the static fast path). */
const CANONICAL_COMPONENTS: Record<
  string,
  React.ComponentType<{ serverData?: unknown; className?: string }>
> = {
  page_link: PageLinkBlock,
  link_buckets: LinkBucketsBlock,
  page_image: PageImageBlock,
  page_video: PageVideoBlock,
  page_audio: PageAudioBlock,
  page_heading: PageHeadingBlock,
  page_section: PageSectionBlock,
  page_list: PageListBlock,
  page_block: PageBlockBlock,
  code_block: CodeBlockKindBlock,
  redirect_hop: RedirectHopBlock,
  content_fingerprint: ContentFingerprintBlock,
  page_metadata: PageMetadataBlock,
  page_removal: PageRemovalBlock,
  page_cleaning_report: PageCleaningReportBlock,
  parsed_table: ParsedTableBlock,
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

export function ScraperKindNested({
  value,
  className,
}: {
  value: object;
  className?: string;
}) {
  if (!isRecord(value)) return null;
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
