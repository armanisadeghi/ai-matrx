"use client";

/**
 * useOpenCitationSource — click-through for a chat message citation source.
 *
 * Thin hook shell: the openable target is built by the PURE
 * `citationOpenRequest` (./citation-open-request — unit-tested there) and
 * routed through the CANONICAL opener (`useOpenCitation`,
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
import { citationOpenRequest } from "./citation-open-request";

const warnedUnopenable = new Set<string>();

export function useOpenCitationSource() {
  const openCitation = useOpenCitation();

  return useCallback(
    (source: MessageCitationSource): void => {
      const request = citationOpenRequest(source);
      if (request) {
        openCitation(request);
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
