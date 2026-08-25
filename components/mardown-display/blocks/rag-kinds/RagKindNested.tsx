"use client";

/**
 * RagKindNested — the RAG family's delegation seam for nested kind instances,
 * on EXACTLY the contract `search-kinds/SearchKindNested.tsx` established and
 * `rank-kinds/RankKindNested.tsx` repeated:
 *
 *  - an ACTIVE `content_ir.kind_component` row with `source='db'` and a body
 *    WINS (db overrides bundled), rendering through the real production route
 *    path (`SafeBlockRenderer` → `applyIrKindRoute` → `db_kind_component`);
 *  - otherwise the compiled canonical component renders STATICALLY, in the same
 *    chunk — never a per-item `next/dynamic` re-entry (THE FRAGMENTATION LAW).
 *
 * 🚨 IT OWNS ONLY THE RAG SLUGS AND DELEGATES EVERYTHING ELSE, ONE-WAY (skill
 * Open gaps #22). A convergence family that copied a sibling family's seam would
 * duplicate the resolution rule and re-render a foreign kind through a second
 * component — the exact defect the canonical-component law forbids. So a kind
 * this family does not own is handed to `SearchKindNested`, which owns the
 * search slugs and delegates onward itself. The direction is deliberate and
 * one-way: rag → search. The search family knows nothing about retrieval.
 *
 * The seam forwards a small set of CONTEXT props the canonical components
 * accept (variant, number, chunkId, query, rank, topScore). They are hints, not
 * data: a component that does not take one ignores it, and the db-override path
 * takes none — a DB-authored renderer owns its own presentation entirely.
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
import { SourceRefBlock } from "./SourceRefBlock";
import { RetrievedChunkBlock } from "./RetrievedChunkBlock";

const noop = () => {};

/** Context a parent kind may pass down. Every field is optional and advisory. */
export interface RagNestedContext {
  /** `source_ref`: "card" (standalone record) or "inline" (citation chip). */
  variant?: "card" | "inline" | "compact" | "expanded";
  /** 1-based badge for a numbered Sources row. */
  number?: number;
  /** The chunk a source was cited from — lets the opener land exactly. */
  chunkId?: string | null;
  /** The query, for highlighting and for the inspector. */
  query?: string | null;
  /** Position of a chunk within its result set. */
  rank?: number | null;
  /** Top score in the result set, for the relative relevance bar. */
  topScore?: number;
}

type NestedComponentProps = RagNestedContext & {
  serverData?: unknown;
  className?: string;
};

/** kind slug → its canonical compiled component (the static fast path). */
const CANONICAL_COMPONENTS: Record<
  string,
  React.ComponentType<NestedComponentProps>
> = {
  source_ref: SourceRefBlock as React.ComponentType<NestedComponentProps>,
  retrieved_chunk: RetrievedChunkBlock as React.ComponentType<NestedComponentProps>,
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

export function RagKindNested({
  value,
  className,
  ...context
}: RagNestedContext & {
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

  return <Component serverData={value} className={className} {...context} />;
}
