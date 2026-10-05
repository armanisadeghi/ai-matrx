/**
 * citation-source — the pure text and target facts of one numbered message source: its label,
 * its locator line, and whether it has a click-through target (chat-package-move P14; the
 * app's inline marker and the package's sources row read the same three).
 */

import type { MessageCitationSource } from "../../../redux/execution-system/messages/message-citations";

/** Does this source have any click-through target? */
export function citationSourceIsOpenable(source: MessageCitationSource): boolean {
  return Boolean(source.fileId || source.url);
}

export function citationSourceLabel(source: MessageCitationSource): string {
  if (source.title) return source.title;
  if (source.url) {
    try {
      return new URL(source.url).hostname.replace(/^www\./, "");
    } catch {
      return source.url;
    }
  }
  return `Source ${source.number}`;
}

export function citationSourceLocator(
  source: MessageCitationSource,
): string | null {
  const parts: string[] = [];
  if (source.page != null) {
    parts.push(
      source.endPage != null && source.endPage !== source.page
        ? `Pages ${source.page}–${source.endPage}`
        : `Page ${source.page}`,
    );
  }
  if (source.url) {
    try {
      parts.push(new URL(source.url).hostname.replace(/^www\./, ""));
    } catch {
      // Non-URL string — skip the locator segment rather than render junk.
    }
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
