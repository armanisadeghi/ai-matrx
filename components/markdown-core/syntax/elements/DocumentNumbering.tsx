"use client";

// Carries the document-wide numbering (document-numbering.ts) from a
// document's root to every MarkdownCore leaf beneath it. The OUTERMOST
// provider wins: a container body or nested section rendered through
// NestedRichContent is part of the same document and keeps its numbers.

import { createContext, useContext, type ReactNode } from "react";
import { computeDocumentNumbering, type DocumentNumbering } from "../document-numbering";

const DocumentNumberingContext = createContext<DocumentNumbering | null>(null);

export function DocumentNumberingProvider({ source, children }: { source: string; children: ReactNode }) {
  const outer = useContext(DocumentNumberingContext);
  if (outer) return <>{children}</>;
  // The React Compiler memoizes this per `source`.
  const numbering = computeDocumentNumbering(source);
  return <DocumentNumberingContext.Provider value={numbering}>{children}</DocumentNumberingContext.Provider>;
}

export function useDocumentNumbering(): DocumentNumbering | null {
  return useContext(DocumentNumberingContext);
}
