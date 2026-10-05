// features/education/trust/grounding.ts
//
// Source-agnostic grounding helpers: the persisting surface knows the durable
// ids the AGENT doesn't (the file_id behind a Knowledge doc, the file_id of a user's
// chat attachment, the processed-document id, a web url). This backfills those
// onto each citation so the citation can OPEN the real source — the full file,
// the PDF at its page, the document — not merely show an excerpt.
//
// Used identically by every creation surface (Knowledge from-source, uploaded/attached
// files, chat-created decks). Nothing here is Knowledge-specific.

import type { RecordCitationKind, SourceCitation, TrustEnvelope } from "./types";

export interface SourceRefs {
  /** Durable file id backing the source (opens the real file/PDF). */
  fileId?: string | null;
  /** Processed-document id (opens the source document viewer). */
  documentId?: string | null;
  /** External URL, when the source is web. */
  url?: string | null;
  /** Resolve a 1-based page for a given citation's `sourceId` (e.g. chunk id). */
  pageForCitation?: (citation: SourceCitation) => number | undefined;
  /**
   * The Source's REAL name. When known it always wins over the agent's
   * citation title — agents invent titles ("Industrial applications",
   * "Enzyme Basics Transcript"); a citation names the Source the person
   * picked (verify-4 V4-F #2). The agent's title stays only when the persisting
   * surface does not know the name.
   */
  title?: string | null;
  /** The Source is a record (no file behind it): what kind — its part ids name the place. */
  recordKind?: RecordCitationKind | null;
}

/**
 * A Source's resource type (the token it was picked and sent as) → the record
 * kind its citations open at. Null for a file, a processed document, a
 * transcript, a note… — those open through the Source Inspector's page/time.
 */
export function recordKindOfResourceType(resourceType: string | null | undefined): RecordCitationKind | null {
  switch (resourceType) {
    case "conversation":
      return "conversation";
    case "dataset":
      return "table";
    case "structured_list":
      return "pick_list";
    case "content_ir_kind_instance":
      return "saved_result";
    case "document":
      return "document";
    case "udt_document":
      return "udt_document";
    default:
      return null;
  }
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
    title: refs.title || citation.title,
    ...(citation.recordKind || refs.recordKind
      ? { recordKind: citation.recordKind ?? refs.recordKind ?? undefined }
      : {}),
  };
}

/**
 * Backfill durable references onto every citation in an envelope. Returns the
 * envelope unchanged when there is none. Call this at persist time on each
 * generated item so its citations are openable regardless of source type.
 */
export function attachSourceRefs(
  env: TrustEnvelope | null | undefined,
  refs: SourceRefs,
): TrustEnvelope | undefined {
  if (!env) return undefined;
  if (env.citations.length === 0) return env;
  return {
    ...env,
    citations: env.citations.map((c) => attachRefsToCitation(c, refs)),
  };
}
