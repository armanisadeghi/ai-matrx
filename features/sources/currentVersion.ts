/**
 * features/sources/currentVersion.ts
 *
 * Which document a Source screen shows (SOURCE-CONVERGENCE §1 rule 4, §8).
 * There is ONE current-version rule and it lives on the server:
 * `docproc.source_list_facts` resolves any version id — an older capture, the
 * head, an edit — to the Source's head (newest live recapture) and its current
 * version (the head's live edit, else the head). The Sources page and every
 * Source screen read that fact; nothing here re-derives it. Pure.
 */

import type { SourceFacts } from "@/features/sources/sourceRows";

export interface SourceVersions {
  /** The Source's newest capture — what "View original" shows. */
  originalId: string;
  /** What people read and AI searches: the head's live edit, else the head. */
  currentId: string;
  /** True when a live edit is the current version. */
  edited: boolean;
}

export function versionsFromFacts(
  facts: Pick<SourceFacts, "headDocumentId" | "currentDocumentId">,
): SourceVersions {
  return {
    originalId: facts.headDocumentId,
    currentId: facts.currentDocumentId,
    edited: facts.currentDocumentId !== facts.headDocumentId,
  };
}

/** The id the screen reads, given the person's "view original" choice. */
export function viewedDocumentId(
  versions: SourceVersions,
  showOriginal: boolean,
): string {
  return versions.edited && showOriginal
    ? versions.originalId
    : versions.currentId;
}
