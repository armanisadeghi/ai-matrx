// features/education/convert/sourceTrust.ts
//
// Build a P0 TrustEnvelope from the KNOWN converter source when the generating
// agent doesn't emit its own citations (diagram_spec / podcast pipelines return
// structure/audio, not a trust envelope — unlike the summary/notes agents which
// do). The map/audio is grounded in the one ingested source, so we cite that
// source honestly rather than persisting `trust: null`. Shared by the mind-map
// and audio converter generators so both surface <SourceCitations/>.

import type {
  TrustEnvelope,
  CitationSourceKind,
} from "@/features/education/trust/types";
import type { ConvertSource } from "./types";

/**
 * `grounded` (the artifact is built entirely from this one source), citing the
 * ingest anchor — a processed-document id, a file id, or the source entity —
 * falling back to the title when there's no id anchor.
 */
export function buildSourceTrust(
  source: ConvertSource,
  fallbackTitle: string,
): TrustEnvelope {
  const ref = source.ref;
  const label = source.title ?? fallbackTitle;
  const sourceKind: CitationSourceKind = ref?.processedDocumentId
    ? "document"
    : ref?.fileId
      ? "file"
      : "document";
  const sourceId =
    ref?.processedDocumentId ?? ref?.fileId ?? ref?.entityId ?? label;
  return {
    citations: [
      {
        sourceId,
        sourceKind,
        title: label,
        ...(ref?.fileId ? { fileId: ref.fileId } : {}),
        ...(ref?.processedDocumentId
          ? { documentId: ref.processedDocumentId }
          : {}),
        ...(ref?.url ? { url: ref.url } : {}),
      },
    ],
    confidence: "grounded",
    groundedIn: label,
  };
}
