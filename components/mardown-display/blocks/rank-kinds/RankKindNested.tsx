"use client";

/**
 * RankKindNested — the rank family's delegation seam for nested kind
 * instances, on EXACTLY the contract `search-kinds/SearchKindNested.tsx`
 * established (Search Kinds Pilot):
 *
 *  - an ACTIVE `content_ir.kind_component` row with `source='db'` and a body
 *    WINS (R6: db overrides bundled), rendering through the real production
 *    route path (`SafeBlockRenderer` → `applyIrKindRoute` → `db_kind_component`);
 *  - otherwise the compiled canonical component renders STATICALLY, in the
 *    same chunk — never a per-item `next/dynamic` re-entry (THE FRAGMENTATION
 *    LAW).
 *
 * 🚨 IT DELEGATES TO THE SEARCH SEAM FOR EVERY SEARCH KIND. `serp_placement`'s
 * `result` is a discriminated union over `web_result` | `local_place` |
 * `ai_answer` | `entity_card` | `faq_item` | `discussion_result` |
 * `news_result` | `video_result` — all eight ALREADY SHIPPED with canonical
 * components. This module owns only the RANK slugs and hands everything else
 * to `SearchKindNested`, so a search result inside a tracked SERP renders
 * through the identical component (and the identical db-override) as the same
 * result inside a search. Re-implementing any of them here would be the
 * "second renderer" defect the canonical-component law exists to prevent.
 *
 * The direction of the import is deliberate and one-way: rank → search. The
 * search family knows nothing about rank tracking.
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
import { isRecord } from "../search-kinds/search-kind-data";
import { SearchKindNested } from "../search-kinds/SearchKindNested";
import { ProviderRunReceiptBlock, SeoRankReadingBlock } from "./reading-blocks";
import { SerpPlacementBlock } from "./SerpPlacementBlock";
import {
  SeoRankPortfolioBlock,
  SeoRankTargetBlock,
  SeoRankTargetRemovalBlock,
} from "./target-blocks";

const noop = () => {};

/** kind slug → its canonical compiled component (the static fast path). */
const CANONICAL_COMPONENTS: Record<
  string,
  React.ComponentType<{ serverData?: unknown; className?: string }>
> = {
  provider_run_receipt: ProviderRunReceiptBlock,
  seo_rank_reading: SeoRankReadingBlock,
  serp_placement: SerpPlacementBlock,
  seo_rank_target: SeoRankTargetBlock,
  seo_rank_portfolio: SeoRankPortfolioBlock,
  seo_rank_target_removal: SeoRankTargetRemovalBlock,
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

export function RankKindNested({
  value,
  className,
}: {
  /** A nested kind instance — the registry decides the shape; the seam only
   * needs an object carrying `__kind`. */
  value: object;
  className?: string;
}) {
  if (!isRecord(value)) return null;
  const kind = readObjectKind(value);
  if (!kind) return null;

  const Component = CANONICAL_COMPONENTS[kind];
  // Not ours — the search family owns it (and its own db-override seam).
  if (!Component) return <SearchKindNested value={value} className={className} />;

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

  return <Component serverData={value} className={className} />;
}
