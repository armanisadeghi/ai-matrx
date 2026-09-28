"use client";

// Carries the document-wide numbering (document-numbering.ts) from a
// document's root to every MarkdownCore leaf beneath it. The OUTERMOST
// provider wins: a container body or nested section rendered through
// NestedRichContent is part of the same document and keeps its numbers.
//
// 🚨 THE VALUE IS STABLE ACROSS EDITS THAT CHANGE NO NUMBER. Every leaf reads
// this context, so a new object on every keystroke / stream chunk re-rendered
// (and re-parsed) EVERY block of the document on every change — a 100 KB
// document cost ~750 ms per keystroke and a 1 MB one froze the tab (the
// markdown-tester crash, 2026-09-26). The previous value is kept whenever
// `sameDocumentNumbering` says the numbers did not move.

import { createContext, useContext, useState, type ReactNode } from "react";
import {
  computeDocumentNumbering,
  documentFootnoteSource,
  sameDocumentNumbering,
  type DocumentNumbering,
} from "../document-numbering";

const DocumentNumberingContext = createContext<DocumentNumbering | null>(null);
/** True beneath a provider that is NOT the document's root (a nested section or container body). */
const NestedDocumentContext = createContext(false);

export function DocumentNumberingProvider({ source, children }: { source: string; children: ReactNode }) {
  const outer = useContext(DocumentNumberingContext);
  if (outer) return <NestedDocumentContext.Provider value={true}>{children}</NestedDocumentContext.Provider>;
  return <RootNumbering source={source}>{children}</RootNumbering>;
}

function RootNumbering({ source, children }: { source: string; children: ReactNode }) {
  // The React Compiler memoizes this per `source`.
  const computed = computeDocumentNumbering(source);
  const [stable, setStable] = useState(computed);
  // Derived-state update during render: only when a number really moved.
  if (stable !== computed && !sameDocumentNumbering(stable, computed)) {
    setStable(computed);
  }
  return <DocumentNumberingContext.Provider value={stable}>{children}</DocumentNumberingContext.Provider>;
}

export function useDocumentNumbering(): DocumentNumbering | null {
  return useContext(DocumentNumberingContext);
}

/**
 * THE DOCUMENT'S ONE FOOTNOTE SECTION (verify-RC-B4 round 16 ruling: notes go
 * after the whole document, as in GFM, Google Docs and print). Every root that
 * splits a document into blocks places this after its last block, inside its
 * `data-matrx-doc-root`, and hands it its own prose renderer, so the notes look
 * like the document's text. It renders the cited notes once (the numbering's
 * `documentFootnoteSource`); a block never renders a definition itself. Beneath
 * a nested provider (a container body, a nested section) it renders nothing —
 * the root owns the section.
 */
export function DocumentFootnotes({ render }: { render: (markdown: string) => ReactNode }) {
  const numbering = useContext(DocumentNumberingContext);
  const nested = useContext(NestedDocumentContext);
  const markdown = nested ? "" : documentFootnoteSource(numbering);
  return markdown ? <>{render(markdown)}</> : null;
}
