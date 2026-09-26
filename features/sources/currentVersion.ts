/**
 * features/sources/currentVersion.ts
 *
 * Which document a Source screen shows (SOURCE-CONVERGENCE §1 rule 4). A
 * person's edit is a `manual_curation` document the capture's
 * `canonical_clean_id` points at; that edit is the CURRENT version — what
 * people read and what AI searches — so a viewer opened on the capture shows
 * the edit, with the original one switch away. Pure: tested directly.
 */

export interface VersionRow {
  id: string;
  canonical_clean_id: string | null;
  derivation_kind: string;
  parent_processed_id: string | null;
}

export interface SourceVersions {
  /** The capture the edit was made on (or the document itself). */
  originalId: string;
  /** What people read: the live edit, else the original. */
  currentId: string;
  /** True when a live edit is the current version. */
  edited: boolean;
}

/**
 * `row` is the requested document; `cleanAlive` says whether the document its
 * `canonical_clean_id` names is live. Opening the edit itself resolves to the
 * same pair, so both ids land on one screen.
 */
export function resolveSourceVersions(
  row: VersionRow,
  cleanAlive: boolean,
): SourceVersions {
  if (row.derivation_kind === "manual_curation" && row.parent_processed_id)
    return {
      originalId: row.parent_processed_id,
      currentId: row.id,
      edited: true,
    };
  if (row.canonical_clean_id && row.canonical_clean_id !== row.id && cleanAlive)
    return {
      originalId: row.id,
      currentId: row.canonical_clean_id,
      edited: true,
    };
  return { originalId: row.id, currentId: row.id, edited: false };
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
