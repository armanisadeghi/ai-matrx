// components/rich-editor/core/visual-document.ts
//
// THE VISUAL ADAPTER: stored text ⇄ the Tiptap document, save = splice.
//
//   buildVisualDocument(text)   tokenizeSource → one top-level node per stored
//                               block (sourceBlock / islandBlock /
//                               sourceLocked), gaps kept aside.
//   captureBaseline(doc)        after the editor has loaded the document, its
//                               nodes are the "unchanged" reference.
//   serializeVisualDocument     walks the current document: every top-level
//                               node that still equals its baseline is written
//                               back as its STORED BYTES; the original gap
//                               between two originally adjacent blocks is
//                               copied; only changed blocks are serialized
//                               (markdown-serialize.ts), and inside a changed
//                               block every unchanged child is still its
//                               stored bytes.
//
// So opening, switching views and saving without an edit returns the stored
// string itself, and an edit can only change bytes inside the block it
// touched. save-plan.ts then proves it against the tokenizer before a save.

import type { JSONContent } from "@tiptap/core";
import type { Node as PMNode, Schema } from "@tiptap/pm/model";
import { tokenizeSource, type SourceBlock } from "@ai-matrx/content-ir/source";
import { parseProseBlock } from "./markdown-parse";
import {
  createSerializeContext,
  serializeBlock,
  serializeChildren,
  type Adjacency,
} from "./markdown-serialize";

export interface VisualLoadStats {
  /** Stored prose blocks. */
  proseBlocks: number;
  /** Prose blocks held whole as source (see markdown-parse.ts). */
  lockedBlocks: number;
  /** Constructs inside editable prose blocks held as source. */
  lockedChildren: number;
  /** Constructs editable as rich text. */
  editableChildren: number;
  /** Stored islands (kinds, XML, fences, math, HTML, anchors…). */
  islandBlocks: number;
  /** Inline islands ({{variables}}, citations, inline math, tags…). */
  inlineIslands: number;
}

export interface VisualPlan {
  /** The text this document was built from. */
  readonly text: string;
  readonly blocks: readonly SourceBlock[];
  /** For each non-gap block index, the next non-gap block index. */
  readonly nextNonGap: ReadonlyMap<number, number>;
  /** Text before the first block / after the last (document-edge spacing). */
  readonly leading: string;
  readonly trailing: string;
  readonly adjacency: ReadonlyMap<string, Adjacency>;
  /** Exact stored bytes of every direct child of a prose block, by id. */
  readonly childRaw: ReadonlyMap<string, string>;
  readonly stats: VisualLoadStats;
}

export interface VisualLoad {
  json: JSONContent;
  plan: VisualPlan;
}

export function buildVisualDocument(text: string, schema: Schema): VisualLoad {
  const blocks = tokenizeSource(text);
  const adjacency = new Map<string, Adjacency>();
  const childRaw = new Map<string, string>();
  const nextNonGap = new Map<number, number>();
  const stats: VisualLoadStats = {
    proseBlocks: 0,
    lockedBlocks: 0,
    lockedChildren: 0,
    editableChildren: 0,
    islandBlocks: 0,
    inlineIslands: 0,
  };
  let counter = 0;
  const nextId = () => `m${(counter += 1)}`;

  const content: JSONContent[] = [];
  let prevIndex: number | null = null;
  let firstStart: number | null = null;
  let lastEnd: number | null = null;

  blocks.forEach((block, index) => {
    if (block.kind === "gap") return;
    if (prevIndex !== null) nextNonGap.set(prevIndex, index);
    prevIndex = index;
    if (firstStart === null) firstStart = block.start;
    lastEnd = block.end;

    if (block.kind === "island") {
      stats.islandBlocks += 1;
      content.push({
        type: "islandBlock",
        attrs: {
          raw: block.raw,
          islandType: block.islandType ?? "fence",
          complete: block.complete,
          b: index,
        },
      });
      return;
    }

    stats.proseBlocks += 1;
    stats.inlineIslands += block.inlines.length;
    const parsed = parseProseBlock(block, schema, adjacency, nextId);
    if (parsed.lockedReason !== null) {
      stats.lockedBlocks += 1;
      content.push({
        type: "sourceLocked",
        attrs: { raw: block.raw, reason: parsed.lockedReason, b: index },
      });
      return;
    }
    for (const child of parsed.children) {
      childRaw.set(child.id, child.raw);
      if (child.lockedReason) stats.lockedChildren += 1;
      else stats.editableChildren += 1;
    }
    content.push({
      type: "sourceBlock",
      attrs: { b: index },
      content: parsed.children.map((child) => child.json),
    });
  });

  if (content.length === 0) content.push({ type: "paragraph" });

  const leading = firstStart === null ? text : text.slice(0, firstStart);
  const trailing = lastEnd === null ? "" : text.slice(lastEnd);
  return {
    json: { type: "doc", content },
    plan: { text, blocks, nextNonGap, leading, trailing, adjacency, childRaw, stats },
  };
}

export interface VisualBaseline {
  readonly plan: VisualPlan;
  /** The editor's own top-level node for each stored block, by block index. */
  readonly topNodes: ReadonlyMap<number, PMNode>;
  /** The editor's own node for each direct child of a prose block, by id. */
  readonly children: ReadonlyMap<string, PMNode>;
}

/**
 * Record the loaded document as the "unchanged" reference. Call it with the
 * document AS THE EDITOR HOLDS IT after load, never with the JSON — whatever
 * the editor did on load is then part of the baseline, not an edit.
 */
export function captureBaseline(doc: PMNode, plan: VisualPlan): VisualBaseline {
  const topNodes = new Map<number, PMNode>();
  const children = new Map<string, PMNode>();
  doc.forEach((node) => {
    const b = node.attrs.b;
    if (typeof b === "number" && !topNodes.has(b)) topNodes.set(b, node);
    if (node.type.name === "sourceBlock") {
      node.forEach((child) => {
        const id = child.attrs.mdId;
        if (typeof id === "string" && !children.has(id)) children.set(id, child);
      });
    }
  });
  return { plan, topNodes, children };
}

function claimDescendantIds(node: PMNode, claimed: Set<string>): void {
  node.descendants((child) => {
    const id = child.attrs.mdId;
    if (typeof id === "string") claimed.add(id);
    return true;
  });
}

/** The current document → source text. Unchanged blocks are their stored bytes. */
export function serializeVisualDocument(doc: PMNode, baseline: VisualBaseline): string {
  const { plan } = baseline;
  const ctx = createSerializeContext(plan.adjacency, (id, node) => {
    const stored = plan.childRaw.get(id);
    if (stored === undefined) return null;
    return baseline.children.get(id)?.eq(node) ? stored : null;
  });
  const claimedBlocks = new Set<number>();
  let out = plan.leading;
  let prevB: number | null = null;
  let first = true;

  doc.forEach((node) => {
    let b: number | null = typeof node.attrs.b === "number" ? node.attrs.b : null;
    if (b !== null) {
      if (claimedBlocks.has(b)) b = null;
      else claimedBlocks.add(b);
    }
    let body: string;
    const block = b !== null ? plan.blocks[b] : undefined;
    if (b !== null && block && baseline.topNodes.get(b)?.eq(node)) {
      body = block.raw;
      claimDescendantIds(node, ctx.claimed);
    } else if (node.type.name === "sourceBlock") {
      body = serializeChildren(node, "wrapper", ctx);
    } else {
      body = serializeBlock(node, ctx);
    }
    if (body === "") return;
    if (!first) {
      const prevBlock = prevB !== null ? plan.blocks[prevB] : undefined;
      const originallyAdjacent =
        prevB !== null && b !== null && plan.nextNonGap.get(prevB) === b;
      out +=
        originallyAdjacent && prevBlock && block
          ? plan.text.slice(prevBlock.end, block.start)
          : "\n\n";
    }
    out += body;
    first = false;
    prevB = b;
  });
  return out + plan.trailing;
}
