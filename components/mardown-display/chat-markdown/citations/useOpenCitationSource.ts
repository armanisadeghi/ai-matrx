"use client";

/**
 * useOpenCitationSource — click-through for a chat message citation source.
 *
 * Routes through the CANONICAL opener (`useOpenCitation`,
 * features/rag/components/source-inspector) — never a fork:
 *   - fileId present → Source Inspector window at the exact PDF page
 *     (sourceKind "cld_file");
 *   - url present (no fileId) → the opener's new-tab fallback;
 *   - neither → not openable; callers render a non-interactive chip and this
 *     hook warns LOUDLY once per source (a citation without any target means
 *     the capture layer dropped the resolvable reference).
 */

import { useCallback } from "react";
import { useOpenCitation } from "@/features/rag/components/source-inspector/useOpenCitation";
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

const warnedUnopenable = new Set<string>();

export function useOpenCitationSource() {
  const openCitation = useOpenCitation();

  return useCallback(
    (source: MessageCitationSource): void => {
      if (source.fileId) {
        openCitation({
          sourceKind: "cld_file",
          sourceId: source.fileId,
          href: fileHref(source),
          chunkId: null,
          pageNumber: source.page,
          pageNumbers: source.page != null ? [source.page] : null,
          snippet: source.citedText,
          fileName: source.title,
        });
        return;
      }
      if (source.url) {
        openCitation({
          sourceKind: "web",
          sourceId: source.url,
          href: source.url,
          snippet: source.citedText,
          fileName: source.title,
        });
        return;
      }
      const key = `${source.kind}|${source.title ?? ""}|${source.number}`;
      if (!warnedUnopenable.has(key)) {
        warnedUnopenable.add(key);
        console.warn(
          "[useOpenCitationSource] Citation source has no file_id and no url — not openable. The capture layer should always persist a resolvable target.",
          source,
        );
      }
    },
    [openCitation],
  );
}
