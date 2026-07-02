"use client";

/**
 * useOpenCitation — the ONE way to open a retrieved/cited source in its best
 * in-app surface. Every RAG/citation surface (the rag_search tool cards, the
 * /rag/search page, the KG inspectors, chat citations) routes through here so
 * they all behave identically: a click opens a non-blocking WINDOW, never a
 * forced full-page navigation.
 *
 * Routing by `source_kind`:
 *   - cld_file / library_doc → Source Inspector (lands on the exact page)
 *   - note                   → Notes window, opened to the note
 *   - transcript             → Transcript Studio window, opened to the session
 *   - scraped                → Scraper window, opened to the page URL
 *   - anything else          → the canonical deep-link in a new tab (fallback
 *                              when there's no window for that kind — e.g.
 *                              code_file needs file objects a citation lacks)
 *
 * `shouldOpenInNewTab` lets an `<a href>` keep native new-tab behaviour on
 * modifier / middle click while a plain click opens the window.
 */

import { useCallback } from "react";
import { useOpenSourceInspectorWindow } from "@/features/overlays/openers/sourceInspectorWindow";
import { useOpenNotesWindow } from "@/features/overlays/openers/notesWindow";
import { useOpenTranscriptStudioWindow } from "@/features/overlays/openers/transcriptStudioWindow";
import { useOpenScraperWindow } from "@/features/overlays/openers/scraperWindow";

export interface CitationInput {
  sourceKind: string;
  /** cld_file → file_id; library_doc → processed_document_id; note → note id;
   *  transcript → session id; scraped → the page URL; else opaque. */
  sourceId: string;
  /** Canonical deep-link (from `citationHrefFor`) — the new-tab fallback. */
  href: string;
  chunkId?: string | null;
  pageNumber?: number | null;
  pageNumbers?: number[] | null;
  snippet?: string | null;
  fileName?: string | null;
  score?: number | null;
  query?: string | null;
}

/** True for clicks that should keep the browser's native "open in new tab". */
export function shouldOpenInNewTab(e: {
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  button?: number;
}): boolean {
  return Boolean(
    e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1,
  );
}

export function useOpenCitation() {
  const openInspector = useOpenSourceInspectorWindow();
  const openNotes = useOpenNotesWindow();
  const openTranscript = useOpenTranscriptStudioWindow();
  const openScraper = useOpenScraperWindow();

  return useCallback(
    (c: CitationInput) => {
      switch (c.sourceKind) {
        case "cld_file":
        case "library_doc":
          openInspector({
            sourceKind: c.sourceKind,
            sourceId: c.sourceId,
            chunkId: c.chunkId ?? null,
            pageNumber: c.pageNumber ?? null,
            pageNumbers:
              c.pageNumbers ??
              (c.pageNumber != null ? [c.pageNumber] : null),
            snippet: c.snippet ?? null,
            fileName: c.fileName ?? null,
            score: c.score ?? null,
            query: c.query ?? null,
            href: c.href,
          });
          return;
        case "note":
          openNotes({
            initialNoteId: c.sourceId,
            windowInstanceId: `cite-note-${c.sourceId}`,
            title: c.fileName ?? undefined,
          });
          return;
        case "transcript":
          openTranscript({
            activeSessionId: c.sourceId,
            title: c.fileName ?? undefined,
          });
          return;
        case "scraped":
          openScraper({ url: c.sourceId });
          return;
        default:
          // No dedicated window for this kind — open its canonical viewer in a
          // new tab so the user still lands on the real thing.
          if (typeof window !== "undefined") {
            window.open(c.href, "_blank", "noopener,noreferrer");
          }
          return;
      }
    },
    [openInspector, openNotes, openTranscript, openScraper],
  );
}

/** Does this source kind open in an in-app window (vs a new-tab fallback)? */
export function citationOpensInWindow(sourceKind: string): boolean {
  return (
    sourceKind === "cld_file" ||
    sourceKind === "library_doc" ||
    sourceKind === "note" ||
    sourceKind === "transcript" ||
    sourceKind === "scraped"
  );
}
