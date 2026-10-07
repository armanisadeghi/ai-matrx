"use client";

// features/spaces/page/FindInPage.tsx — Notion's find in page (N4): Cmd/Ctrl+F opens a bar at the page's
// top right; every match is highlighted, the current one stronger; Enter / Shift+Enter (or the arrows)
// step through them with "3/12"; Escape closes. A match inside a closed toggle opens that toggle (and
// every closed toggle above it) when it becomes the current one.
//
// Matches are DOM ranges painted with the CSS Custom Highlight API: nothing is written into the editor,
// so the room, the undo history and the saved page never see a search.

import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button, SearchField } from "@ai-matrx/design-system/controls";

const ALL = "spaces-find";
const CURRENT = "spaces-find-current";

type HighlightRegistry = { set: (name: string, h: unknown) => void; delete: (name: string) => void };
const registry = (): HighlightRegistry | null => (typeof CSS !== "undefined" && "highlights" in CSS ? (CSS as unknown as { highlights: HighlightRegistry }).highlights : null);
const HighlightCtor = (): (new (...r: Range[]) => unknown) | null => (typeof window !== "undefined" && "Highlight" in window ? (window as unknown as { Highlight: new (...r: Range[]) => unknown }).Highlight : null);

/** Every case-insensitive match of `query` in the text under `root` (closed toggles' text included). */
export function findRanges(root: Element, query: string): Range[] {
  const q = query.toLowerCase();
  if (!q) return [];
  const out: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => ((n.parentElement?.closest("[contenteditable=false]") && !n.parentElement?.closest(".spaces-page-link")) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.nodeValue ?? "").toLowerCase();
    for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + q.length)) {
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + q.length);
      out.push(r);
    }
  }
  return out;
}

/** Open every closed toggle that holds `node` (outermost first). Answers whether one was opened. */
export function openTogglesAround(node: Node): boolean {
  const closed: HTMLElement[] = [];
  for (let el = node.parentElement; el; el = el.parentElement) {
    if (!el.classList.contains("bn-block-group")) continue;
    const block = el.parentElement;
    const wrapper = block?.querySelector(":scope > .bn-block-content .bn-toggle-wrapper, :scope > .react-renderer .bn-toggle-wrapper");
    if (wrapper?.getAttribute("data-show-children") === "false") {
      const button = wrapper.querySelector<HTMLElement>(".bn-toggle-button");
      if (button) closed.unshift(button);
    }
  }
  for (const b of closed) b.click();
  return closed.length > 0;
}

export function FindInPage({ rootSelector }: { rootSelector: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [ranges, setRanges] = useState<Range[]>([]);
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const atRef = useRef(0);
  atRef.current = at;

  // Cmd/Ctrl+F anywhere on the page opens (or re-focuses) the bar instead of the browser's own find.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "f" || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      e.preventDefault();
      setOpen(true);
      requestAnimationFrame(() => input.current?.select());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Search again as the query or the page changes (an edit, a peer's edit, a toggle drawn).
  useEffect(() => {
    if (!open) return;
    const root = document.querySelector(rootSelector);
    if (!root) return;
    let t: number | undefined;
    const run = () => {
      const next = findRanges(root, query.trim());
      setRanges(next);
      setAt((i) => (next.length ? Math.min(i, next.length - 1) : 0));
    };
    run();
    const obs = new MutationObserver(() => {
      window.clearTimeout(t);
      t = window.setTimeout(run, 150);
    });
    obs.observe(root, { subtree: true, childList: true, characterData: true });
    return () => {
      obs.disconnect();
      window.clearTimeout(t);
    };
  }, [open, query, rootSelector]);

  // Paint: every match, and the current one on top.
  useEffect(() => {
    const reg = registry();
    const H = HighlightCtor();
    if (!reg || !H) return;
    if (!open || !ranges.length) {
      reg.delete(ALL);
      reg.delete(CURRENT);
      return;
    }
    reg.set(ALL, new H(...ranges));
    const cur = ranges[at];
    if (cur) reg.set(CURRENT, new H(cur));
    return () => {
      reg.delete(ALL);
      reg.delete(CURRENT);
    };
  }, [open, ranges, at]);

  const show = (i: number) => {
    const r = ranges[i];
    if (!r) return;
    openTogglesAround(r.startContainer);
    requestAnimationFrame(() => r.startContainer.parentElement?.scrollIntoView({ block: "center" }));
  };
  const step = (by: number) => {
    if (!ranges.length) return;
    const i = (atRef.current + by + ranges.length) % ranges.length;
    setAt(i);
    show(i);
  };
  const close = () => {
    setOpen(false);
    setRanges([]);
    setAt(0);
  };

  if (!open) return null;
  const count = query.trim() ? (ranges.length ? `${at + 1}/${ranges.length}` : "0/0") : "";
  return (
    <div className="spaces-find bg-card" role="search">
      <SearchField
        ref={input}
        autoFocus
        aria-label="Find in page"
        placeholder="Find in page"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setAt(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            step(e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
        }}
      />
      <span className="spaces-find-count" aria-live="polite">{count}</span>
      <Button variant="quiet" aria-label="Previous match" disabled={!ranges.length} onClick={() => step(-1)}>
        <ChevronUp size={16} />
      </Button>
      <Button variant="quiet" aria-label="Next match" disabled={!ranges.length} onClick={() => step(1)}>
        <ChevronDown size={16} />
      </Button>
      <Button variant="quiet" aria-label="Close find" onClick={close}>
        <X size={16} />
      </Button>
    </div>
  );
}
