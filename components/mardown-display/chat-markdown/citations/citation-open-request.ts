/**
 * citation-open-request — the PURE half of citation click-through.
 *
 * Builds the canonical `CitationInput` (features/rag/components/source-inspector/
 * useOpenCitation) for a chat `MessageCitationSource`, so the openable target
 * is unit-testable without pulling the overlay/opener graph into jest.
 * `useOpenCitationSource` is the thin hook shell over this.
 *
 * Routing:
 *   - fileId present → Source Inspector at the exact PDF page ("cld_file").
 *     This is the openable path for `document_*` AND `search_result` kinds —
 *     the backend stamps our `file_id` + `page` (decoded from matrx://
 *     sources for search results).
 *   - url present (no fileId) → the opener's web/new-tab path.
 *   - neither → null (not openable).
 */

import type { CitationInput } from "@/features/rag/components/source-inspector/useOpenCitation";
import type { MessageCitationSource } from "@/features/agents/redux/execution-system/messages/message-citations";

/** Does this source have any click-through target? */
export function citationSourceIsOpenable(
  source: MessageCitationSource,
): boolean {
  return Boolean(source.fileId || source.url);
}

/** Mirrors `citationHrefFor`'s cld_file deep-link (features/rag/api/search.ts)
 *  minus the chunk param a provider citation doesn't have. */
function fileHref(source: MessageCitationSource): string {
  const pageQs =
    source.page != null && Number.isFinite(source.page)
      ? `&page=${source.page}`
      : "";
  return `/files/f/${encodeURIComponent(source.fileId ?? "")}?tab=document${pageQs}`;
}

/**
 * The canonical open request for a source, or null when it has no target.
 * fileId wins over url — our file at the exact page beats a web fallback.
 */
export function citationOpenRequest(
  source: MessageCitationSource,
): CitationInput | null {
  if (source.fileId) {
    return {
      sourceKind: "cld_file",
      sourceId: source.fileId,
      href: fileHref(source),
      chunkId: null,
      pageNumber: source.page,
      pageNumbers: source.page != null ? [source.page] : null,
      snippet: source.citedText,
      fileName: source.title,
    };
  }
  if (source.url) {
    return {
      sourceKind: "web",
      sourceId: source.url,
      href: source.url,
      snippet: source.citedText,
      fileName: source.title,
    };
  }
  return null;
}
