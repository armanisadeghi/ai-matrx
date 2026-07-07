// features/education/trust/grounding.ts
//
// Source-agnostic grounding helpers: the persisting surface knows the durable
// ids the AGENT doesn't (the file_id behind a RAG doc, the file_id of a user's
// chat attachment, the processed-document id, a web url). This backfills those
// onto each citation so the citation can OPEN the real source — the full file,
// the PDF at its page, the document — not merely show an excerpt.
//
// Used identically by every creation surface (RAG from-source, uploaded/attached
// files, chat-created decks). Nothing here is RAG-specific.

import type { SourceCitation, TrustEnvelope } from "./types";

export interface SourceRefs {
  /** Durable file id backing the source (opens the real file/PDF). */
  fileId?: string | null;
  /** Processed-document id (opens the source document viewer). */
  documentId?: string | null;
  /** External URL, when the source is web. */
  url?: string | null;
  /** Resolve a 1-based page for a given citation's `sourceId` (e.g. chunk id). */
  pageForCitation?: (citation: SourceCitation) => number | undefined;
  /** Fallback display title when a citation has none. */
  title?: string;
}

/** Backfill durable, openable references onto one citation (agent values win where present). */
export function attachRefsToCitation(
  citation: SourceCitation,
  refs: SourceRefs,
): SourceCitation {
  const page = citation.page ?? refs.pageForCitation?.(citation);
  return {
    ...citation,
    fileId: citation.fileId ?? refs.fileId ?? undefined,
    documentId: citation.documentId ?? refs.documentId ?? undefined,
    url: citation.url ?? refs.url ?? undefined,
    page,
    title: citation.title ?? refs.title,
  };
}

/**
 * Backfill durable references onto every citation in an envelope. Returns the
 * envelope unchanged when there is none. Call this at persist time on each
 * generated item so its citations are openable regardless of source type.
 */
export function attachSourceRefs(
  env: TrustEnvelope | undefined,
  refs: SourceRefs,
): TrustEnvelope | undefined {
  if (!env) return env;
  if (env.citations.length === 0) return env;
  return {
    ...env,
    citations: env.citations.map((c) => attachRefsToCitation(c, refs)),
  };
}
