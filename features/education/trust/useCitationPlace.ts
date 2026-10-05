"use client";

// features/education/trust/useCitationPlace.ts
//
// Where a card's citation points, named and opened the SAME way the Source
// viewer names it. The popup's "where" line and the viewer's header both come
// from `citedPlace` over the same cited-chunk read (`useCitedChunk`), so a
// web section is its heading in both, a recording is its time in both, and a
// PDF is "Page N" in both — never the agent's own locator ("2992").
//
// Opening: every place opens the canonical Source Inspector window — a
// recording (a YouTube video, an uploaded talk) with its own player playing
// from the cited time, a page or section at the cited passage. One citation
// experience for every kind; the Source page stays the inspector's
// "Open source" link.

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
import { recordKindOf } from "./recordCitation";
import { sourceStudioPath } from "@/features/source-studio/sourceStudioModel";
import {
  inspectorArgsForSourceRef,
  type CardSourceRef,
  type SourceInspectorOpenArgs,
} from "./sourceRef";

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

/** The inspector args for a recording: its document, playing from the cited moment. */
export interface RecordingInspectorArgs extends SourceInspectorOpenArgs {
  seekMs: number;
  /** The chip's place label — the viewer names the same moment. */
  placeLabel: string | null;
}

/**
 * The Source Inspector args that play a recording from the cited time, or
 * null when the place is not a recording (or its document is unknown).
 * `href` stays the Source page at that moment — the inspector's new-tab link.
 */
export function recordingInspectorArgs(
  documentId: string | null | undefined,
  place: CitedPlace | null | undefined,
  ref: CardSourceRef | null | undefined,
  citation: SourceCitation | null | undefined,
): RecordingInspectorArgs | null {
  const href = playerHrefForPlace(documentId, place);
  if (!href || !documentId || !place || place.seekMs == null) return null;
  return {
    sourceKind: "library_doc",
    sourceId: documentId,
    href,
    chunkId: ref?.chunkId ?? citation?.sourceId ?? null,
    pageNumber: place.pageNumber,
    snippet: ref?.excerpt ?? citation?.excerpt ?? null,
    fileName: ref?.title ?? citation?.title ?? null,
    seekMs: Math.max(0, Math.round(place.seekMs)),
    placeLabel: place.label,
  };
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
  // A conversation / table / pick list / saved result / document names its place
  // by its part id (`recordCitation.ts`), never as a transcript to search.
  if (recordKindOf(c)) return null;
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
  const recording = recordingInspectorArgs(
    ref?.documentId ?? facts?.documentId ?? null,
    place,
    ref,
    citation,
  );
  const args = recording ?? inspectorArgsForSourceRef(ref);
  const open = useCallback(() => {
    if (args) openInspector(args);
  }, [args, openInspector]);
  return { place, open: args ? open : null };
}
