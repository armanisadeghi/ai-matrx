"use client";

// features/spaces/collab/CommentMargin.tsx — what a page shows of its block comments (H1, Notion):
//   - the commented text is highlighted (CSS Custom Highlight API: ranges are painted, ProseMirror's
//     DOM is never touched — a class or wrapper there would re-render the node view);
//   - a block with open comments carries a count bubble in the right margin; it opens the panel;
//   - a click inside highlighted text opens its thread.
// Positions are read from the rendered blocks and re-read when the threads, the page or the size change.

import { MessageSquare } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";

import type { SpaceThread } from "./comments";

const HIGHLIGHT = "spaces-comment";

type HighlightCtor = new (...ranges: Range[]) => unknown;
type HighlightRegistry = { set: (name: string, h: unknown) => void; delete: (name: string) => void };
function highlights(): { registry: HighlightRegistry; Highlight: HighlightCtor } | null {
  const reg = (CSS as unknown as { highlights?: HighlightRegistry }).highlights;
  const Ctor = (globalThis as unknown as { Highlight?: HighlightCtor }).Highlight;
  return reg && Ctor ? { registry: reg, Highlight: Ctor } : null;
}

function blockEl(root: HTMLElement, blockId: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`.bn-block-outer[data-id="${CSS.escape(blockId)}"]`);
}

/** The first place `quote` occurs in the block's own text (not its children), as a DOM range. */
function rangeOf(block: HTMLElement, quote: string): Range | null {
  const content = block.querySelector<HTMLElement>(":scope > .bn-block > .bn-block-content");
  if (!content || !quote) return null;
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let text = "";
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push(n as Text);
    text += (n as Text).data;
  }
  // The stored quote had its whitespace collapsed (comments.ts); the block's text rarely has runs.
  const q = quote.trim();
  const at = text.indexOf(q);
  if (at < 0) return null;
  const end = at + q.length;
  const range = document.createRange();
  let pos = 0;
  let started = false;
  for (const node of nodes) {
    const next = pos + node.data.length;
    if (!started && at < next) {
      range.setStart(node, at - pos);
      started = true;
    }
    if (started && end <= next) {
      range.setEnd(node, end - pos);
      return range;
    }
    pos = next;
  }
  return null;
}

interface Bubble {
  blockId: string;
  top: number;
  count: number;
  threadId: string;
}

export function CommentMargin({
  threads,
  containerRef,
  tick,
  onOpen,
}: {
  threads: SpaceThread[];
  /** The page column (position: relative) the editor renders in. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Changes whenever the page's blocks change, so positions and highlights are re-read. */
  tick: unknown;
  onOpen: (threadId: string) => void;
}) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const ranges = useRef<Array<{ range: Range; threadId: string }>>([]);
  const open = threads.filter((t) => t.anchor && !t.resolvedAt);
  const key = open.map((t) => `${t.id}:${t.anchor?.blockId}:${t.replies.length}`).join("|");

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    let frame = 0;
    const paint = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = root.getBoundingClientRect();
        const perBlock = new Map<string, Bubble>();
        const found: Array<{ range: Range; threadId: string }> = [];
        for (const t of open) {
          const el = t.anchor ? blockEl(root, t.anchor.blockId) : null;
          if (!el || !t.anchor) continue;
          const r = rangeOf(el, t.anchor.quote);
          if (r) found.push({ range: r, threadId: t.id });
          const prev = perBlock.get(t.anchor.blockId);
          const n = 1 + t.replies.length;
          if (prev) prev.count += n;
          else perBlock.set(t.anchor.blockId, { blockId: t.anchor.blockId, top: el.getBoundingClientRect().top - box.top, count: n, threadId: t.id });
        }
        ranges.current = found;
        setBubbles([...perBlock.values()]);
        const hl = highlights();
        if (hl) {
          if (found.length) hl.registry.set(HIGHLIGHT, new hl.Highlight(...found.map((f) => f.range)));
          else hl.registry.delete(HIGHLIGHT);
        }
      });
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(root);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
    // Re-read on the threads (key) and on page changes (tick); `open` is derived from them.
  }, [containerRef, key, tick]);

  useEffect(() => () => highlights()?.registry.delete(HIGHLIGHT), []);

  // A click that lands inside highlighted text opens that thread (Notion).
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const onUp = () => {
      const sel = window.getSelection();
      if (!sel || !sel.isCollapsed || !sel.anchorNode) return;
      const hit = ranges.current.find(({ range }) => {
        try {
          return range.isPointInRange(sel.anchorNode!, sel.anchorOffset);
        } catch {
          return false;
        }
      });
      if (hit) onOpen(hit.threadId);
    };
    root.addEventListener("mouseup", onUp);
    return () => root.removeEventListener("mouseup", onUp);
  }, [containerRef, onOpen]);

  return (
    <>
      {bubbles.map((b) => (
        <button
          key={b.blockId}
          type="button"
          className="spaces-comment-bubble"
          style={{ top: b.top }}
          aria-label={`${b.count} comment${b.count === 1 ? "" : "s"}`}
          onClick={() => onOpen(b.threadId)}
        >
          <MessageSquare size={14} />
          {b.count}
        </button>
      ))}
    </>
  );
}
