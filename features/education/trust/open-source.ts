// features/education/trust/open-source.ts
//
// Resolve a citation to its REAL source and open it — the full file/PDF in the
// canonical file viewer, or the web page in a new tab — not just an excerpt.
// Source-agnostic: works for RAG-backed docs, user uploads/attachments, and
// chat-created decks, because the citation carries a durable `fileId`/`url`
// (backfilled at persist time by whichever surface created the card).
//
// Uses the ONE canonical file-open primitive (`openFilePreview`) — the same
// draggable, resizable preview window every other surface opens files with.

import { openFilePreview } from "@/features/files";
import type { SourceCitation } from "./types";

// Re-export the pure predicate (defined in types.ts to stay free of the heavy
// file-preview import) so callers can grab both from one place.
export { citationIsOpenable } from "./types";

/**
 * Open a citation's real source. Prefers the durable file (opens the canonical
 * file-preview window — the user sees the whole document and can page through
 * it); falls back to the external url in a new tab. Returns true if it opened
 * something, false when the citation has no openable reference (the caller's
 * excerpt popover stays the resolution).
 */
export function openCitationSource(c: SourceCitation): boolean {
  if (c.fileId) {
    openFilePreview(c.fileId);
    return true;
  }
  if (c.url) {
    if (typeof window !== "undefined") {
      window.open(c.url, "_blank", "noopener,noreferrer");
    }
    return true;
  }
  return false;
}
