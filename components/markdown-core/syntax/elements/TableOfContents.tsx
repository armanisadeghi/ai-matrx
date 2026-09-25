"use client";

// `[[toc]]` / `:::toc` / `::toc` — the document's contents. The server and
// first render list this block's headings (built by rehypeMatrxSyntax); in
// the browser it re-reads the whole document root (`data-matrx-doc-root`),
// so a document the renderer split into several blocks still lists every
// section.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { InDocAnchor } from "./InDocAnchor";
import { documentRootOf } from "./find-in-document";

interface Entry {
  id: string;
  depth: number;
  text: string;
}

function readHeadings(root: Element, self: Element): Entry[] {
  const out: Entry[] = [];
  root.querySelectorAll<HTMLElement>("h1[id], h2[id], h3[id], h4[id]").forEach((h) => {
    if (h.id === "footnote-label" || h.classList.contains("sr-only") || self.contains(h)) return;
    // An embedded record's own headings are not this document's sections.
    if (h.closest("[data-wiki-embed]")) return;
    const clone = h.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[data-heading-anchor]").forEach((a) => a.remove());
    out.push({ id: h.id, depth: Number(h.tagName.slice(1)), text: (clone.textContent ?? "").trim() });
  });
  return out;
}

export function TableOfContents(props: { children?: ReactNode; "data-toc-count"?: number | string }) {
  const ref = useRef<HTMLElement>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    const self = ref.current;
    const root = documentRootOf(self);
    if (!self || !root) return;
    const read = () => {
      const next = readHeadings(root, self);
      setEntries((prev) =>
        prev && prev.length === next.length && prev.every((e, i) => e.id === next[i]?.id && e.text === next[i]?.text) ? prev : next,
      );
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const staticCount = Number(props["data-toc-count"] ?? 0);
  const min = entries && entries.length > 0 ? Math.min(...entries.map((e) => e.depth)) : 1;

  return (
    <nav ref={ref} aria-label="Contents" data-matrx-toc="" className="matrx-toc my-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contents</p>
      {entries && entries.length > staticCount ? (
        <ol className="space-y-0.5">
          {entries.map((e) => (
            <li key={e.id} style={{ paddingLeft: `${(e.depth - min) * 1}rem` }}>
              <InDocAnchor href={`#${e.id}`} className="text-foreground/80 no-underline hover:text-primary">
                {e.text}
              </InDocAnchor>
            </li>
          ))}
        </ol>
      ) : staticCount > 0 ? (
        props.children
      ) : (
        <p className="text-xs text-muted-foreground">This document has no headings yet.</p>
      )}
    </nav>
  );
}
