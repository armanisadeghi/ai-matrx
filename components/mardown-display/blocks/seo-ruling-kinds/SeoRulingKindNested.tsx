"use client";

/**
 * SeoRulingKindNested — the Ruling Session family's delegation seam for the
 * item kinds its collections hold, on the contract `search-kinds/SearchKindNested.tsx`
 * and `rank-kinds/RankKindNested.tsx` established:
 *
 *  - an ACTIVE `content_ir.kind_component` row with `source='db'` and a body
 *    WINS (db overrides bundled), rendered through the real production route
 *    (`SafeBlockRenderer` → `applyIrKindRoute` → `db_kind_component`);
 *  - otherwise the item kind's own row component renders STATICALLY, in the
 *    same chunk — never a per-item `next/dynamic` re-entry.
 *
 * The collection names the item kind explicitly: the builders in
 * `features/marketing/seo/value-system/workbench/session/trial.ts` do not stamp
 * `__kind` on the records inside a set (the collection's schema says what they
 * are), so the seam cannot read it off the item.
 */

import React from "react";
import { SafeBlockRenderer } from "@/components/mardown-display/chat-markdown/internal-handlers/SafeBlockRenderer";
import type { RenderBlock } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import { IR_ENVELOPE_KEY } from "@ai-matrx/content-ir";
import { envelopeFromCompleteValue } from "@/features/content-ir/registry/kind-correctors";
import { resolveComponent } from "@/features/content-ir/registry/component-registry";
import { SEO_RULING_ITEM_ROWS } from "./SeoRulingItemBlocks";
import type { SeoRulingItemKind } from "./seo-ruling-shared";

const noop = () => {};

const nestedBlockMemo = new WeakMap<object, RenderBlock>();

function nestedBlock(
  value: Record<string, unknown>,
  kind: string,
): RenderBlock {
  const cached = nestedBlockMemo.get(value);
  if (cached) return cached;
  const stamped = { __kind: kind, ...value };
  const block: RenderBlock = {
    type: "code",
    content: JSON.stringify(stamped, null, 2),
    language: "json",
    metadata: { [IR_ENVELOPE_KEY]: envelopeFromCompleteValue(stamped, kind) },
  };
  nestedBlockMemo.set(value, block);
  return block;
}

export function SeoRulingKindNested({
  kind,
  value,
  className,
}: {
  kind: SeoRulingItemKind;
  value: Record<string, unknown>;
  className?: string;
}) {
  const resolution = resolveComponent(kind, "web", "output");
  const dbOverride =
    resolution?.resolvedBy === "db" &&
    resolution.source === "db" &&
    resolution.isActive &&
    resolution.hasComponentSource;

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

  const { Row } = SEO_RULING_ITEM_ROWS[kind];
  return <Row value={value} className={className} />;
}
