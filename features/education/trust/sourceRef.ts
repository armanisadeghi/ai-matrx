// features/education/trust/sourceRef.ts
//
// Card-level source provenance (FastFire spec 26e — "See source" is a core
// requirement, not a nicety). ONE shape for "where this card came from",
// resolvable from either of the two provenance channels that already exist:
//   • the card's TrustEnvelope (metadata.trust) — durable fileId/documentId/
//     page backfilled at persist time by the generating surface;
//   • the `fc_card --source--> file` platform.associations edge, whose
//     metadata carries {processed_document_id, chunk_id, page}.
// Plus the ONE pure mapping from that shape to the canonical Source
// Inspector's open args (`useOpenCitation` input) — hoisted from
// SourceCitations so the tutor chips and every "See source" button share a
// single citation→inspector translation.

import type { SourceCitation, TrustEnvelope } from "./types";

/** Where one card was grounded — the minimum needed to open the inspector. */
export interface CardSourceRef {
  /** Durable cld_file id (preferred — opens the real file/PDF). */
  fileId: string | null;
  /** Processed-document id (Knowledge viewer lane when there is no file id). */
  documentId: string | null;
  /** The matched chunk to highlight. */
  chunkId: string | null;
  /** 1-based page, when known. */
  page: number | null;
  /** Display name for the inspector header. */
  title: string | null;
  /** The grounding passage (inspector snippet). */
  excerpt: string | null;
}

/** The `useOpenCitation` input this ref resolves to (pure — no hooks here). */
export interface SourceInspectorOpenArgs {
  sourceKind: "cld_file" | "library_doc";
  sourceId: string;
  href: string;
  chunkId: string | null;
  pageNumber: number | null;
  snippet: string | null;
  fileName: string | null;
}

/**
 * The one citation→inspector mapping (was inlined in SourceCitations). Null
 * when the ref cannot open a real source view — callers render nothing then.
 */
export function inspectorArgsForSourceRef(
  ref: CardSourceRef | null | undefined,
): SourceInspectorOpenArgs | null {
  if (!ref) return null;
  const sourceId = ref.fileId ?? ref.documentId;
  if (!sourceId) return null;
  const page = ref.page != null ? `&page=${ref.page}` : "";
  const chunk = ref.chunkId ? encodeURIComponent(ref.chunkId) : "";
  const href = ref.fileId
    ? `/files/f/${encodeURIComponent(sourceId)}?tab=document&chunk=${chunk}${page}`
    : `/knowledge/viewer/${encodeURIComponent(sourceId)}?chunk=${chunk}${page}`;
  return {
    sourceKind: ref.fileId ? "cld_file" : "library_doc",
    sourceId,
    href,
    chunkId: ref.chunkId,
    pageNumber: ref.page,
    snippet: ref.excerpt,
    fileName: ref.title,
  };
}

/** A chunk citation as a CardSourceRef (the trust-envelope channel). */
export function sourceRefFromCitation(c: SourceCitation): CardSourceRef | null {
  if (c.sourceKind !== "chunk" || (!c.fileId && !c.documentId)) return null;
  return {
    fileId: c.fileId ?? null,
    documentId: c.documentId ?? null,
    chunkId: c.sourceId,
    page: c.page ?? null,
    title: c.title ?? null,
    excerpt: c.excerpt ?? null,
  };
}

/** The card's first openable chunk citation, if its envelope carries one. */
export function sourceRefFromTrust(
  trust: TrustEnvelope | null | undefined,
): CardSourceRef | null {
  for (const c of trust?.citations ?? []) {
    const ref = sourceRefFromCitation(c);
    if (ref) return ref;
  }
  return null;
}
