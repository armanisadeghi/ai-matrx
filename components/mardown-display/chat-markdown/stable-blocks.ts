// components/mardown-display/chat-markdown/stable-blocks.ts
//
// 🚨 THE UNCHANGED-BLOCK LAW for the ONE markdown renderer (MarkdownStream →
// EnhancedChatMarkdown). Every edit and every stream chunk re-splits the whole
// document into NEW block objects. Handed straight to the block renderers, a
// one-character edit re-rendered — and re-parsed through react-markdown —
// EVERY block of the document: ~750 ms per keystroke on a 100 KB document, a
// multi-second freeze per chunk on a long streamed answer, and a dead tab on a
// 1 MB paste (the markdown-tester browser crash, Arman 2026-09-26).
//
// `reuseUnchangedBlocks` hands back the PREVIOUS object for every block whose
// data did not change, so the compiled SafeBlockRenderer sees identical props
// and React skips that whole subtree. Only the block that actually changed
// renders again. Guard: components/markdown-studio/__tests__/stress-budget.test.tsx.

import type { RenderBlock } from "./block-registry/BlockRenderer";

/** Deep structural equality for the plain-data fields a block carries. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    if (a.length !== bb.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameValue(a[i], bb[i])) return false;
    return true;
  }
  const ak = Object.keys(a as object);
  const bk = Object.keys(b as object);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
}

/** Same block data, field by field (content strings compare by value). */
export function sameBlock(a: RenderBlock, b: RenderBlock): boolean {
  if (a === b) return true;
  if (a.type !== b.type || a.content !== b.content) return false;
  return sameValue(a, b);
}

/**
 * Returns `next` with every block that equals a block of `prev` replaced by
 * that previous object. Matching is by (type, content) in order of
 * occurrence, so identity survives blocks shifting position. Returns `prev`
 * itself when nothing changed at all.
 */
export function reuseUnchangedBlocks(
  prev: readonly RenderBlock[],
  next: readonly RenderBlock[],
): RenderBlock[] {
  if (prev.length === 0) return next as RenderBlock[];
  const pool = new Map<string, RenderBlock[]>();
  for (const b of prev) {
    const key = `${b.type}\u0001${b.content}`;
    const list = pool.get(key);
    if (list) list.push(b);
    else pool.set(key, [b]);
  }
  let allReused = prev.length === next.length;
  const out = next.map((b, i) => {
    const list = pool.get(`${b.type}\u0001${b.content}`);
    if (list) {
      const at = list.findIndex((p) => sameBlock(p, b));
      if (at !== -1) {
        const hit = list[at] as RenderBlock;
        list.splice(at, 1);
        if (hit !== prev[i]) allReused = false;
        return hit;
      }
    }
    allReused = false;
    return b;
  });
  return allReused ? (prev as RenderBlock[]) : out;
}
