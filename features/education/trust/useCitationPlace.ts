"use client";

// features/education/trust/useCitationPlace.ts
//
// Where a card's citation points, named and opened the SAME way the Source
// viewer names it. The popup's "where" line and the viewer's header both come
// from `citedPlace` over the same cited-chunk read (`useCitedChunk`), so a
// web section is its heading in both, a recording is its time in both, and a
// PDF is "Page N" in both — never the agent's own locator ("2992").
//
// Opening: a recording (a YouTube video, an uploaded talk) opens THE Source
// page at the cited time — its player is the one with "Play from"; every
// other place opens the canonical Source Inspector at the cited passage.

import { useCallback } from "react";
import { useOpenCitation } from "@/features/rag/components/source-inspector/useOpenCitation";
import {
  useCitedChunk,
  useRecordCitedFacts,
} from "@/features/rag/components/source-inspector/useCitedChunk";
import {
  citedPages,
  citedPlace,
  parsePartId,
  type CitedPlace,
} from "@/features/rag/components/source-inspector/citedAnchor";
import type { SourceCitation } from "./types";
import { sourceStudioPath } from "@/features/source-studio/sourceStudioModel";
import { inspectorArgsForSourceRef, type CardSourceRef } from "./sourceRef";

/**
 * The Source page URL that plays a recording from the cited moment, or null
 * when the place is not a recording (or its document is unknown).
 */
export function playerHrefForPlace(
  documentId: string | null | undefined,
  place: CitedPlace | null | undefined,
): string | null {
  if (!documentId || !place || place.kind !== "time" || place.seekMs == null) return null;
  const base = sourceStudioPath(
    documentId,
    place.pageNumber != null ? { page: String(place.pageNumber) } : undefined,
  );
  return `${base}${base.includes("?") ? "&" : "?"}t=${Math.max(0, Math.round(place.seekMs))}`;
}

export interface CitationPlaceState {
  /** Null while the cited chunk is still being read. */
  place: CitedPlace | null;
  /** Opens the cited place; null when the ref cannot open a real source view. */
  open: (() => void) | null;
}

/**
 * The record a citation names when it carries no document/file id — a packed
 * part `<record id>:<n>` of a record picked as a Source (a transcript).
 */
export function recordIdOfCitation(c: SourceCitation | null | undefined): string | null {
  if (!c || c.fileId || c.documentId) return null;
  if (c.url && /^https?:\/\//i.test(c.url)) return null;
  return parsePartId(c.sourceId)?.documentId ?? null;
}

export function useCitationPlace(
  ref: CardSourceRef | null | undefined,
  /** The citation itself — lets a record-backed citation (no ids) find its place. */
  citation?: SourceCitation | null,
): CitationPlaceState {
  const openInspector = useOpenCitation();
  const openable = Boolean(ref && (ref.fileId || ref.documentId));
  const cited = useCitedChunk(openable ? (ref?.chunkId ?? null) : null, ref?.documentId ?? null);
  const recordId = openable ? null : recordIdOfCitation(citation);
  const record = useRecordCitedFacts(recordId, citation?.excerpt ?? null);
  const facts = openable ? cited.facts : record.facts;
  const loading = openable ? cited.loading : record.loading;
  const place =
    (!openable && !recordId) || loading || (recordId && !facts)
      ? null
      : citedPlace(citedPages(null, ref?.page ?? null, facts), facts);
  const playerHref = playerHrefForPlace(ref?.documentId ?? facts?.documentId ?? null, place);
  const args = inspectorArgsForSourceRef(ref);
  const open = useCallback(() => {
    if (playerHref) {
      if (typeof window !== "undefined") window.open(playerHref, "_blank", "noopener,noreferrer");
      return;
    }
    if (args) openInspector(args);
  }, [playerHref, args, openInspector]);
  return { place, open: playerHref || args ? open : null };
}
