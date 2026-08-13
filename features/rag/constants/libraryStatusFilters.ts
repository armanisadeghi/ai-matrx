/**
 * The status filter vocabulary of `/rag/library` — the segmented buttons above
 * the document table.
 *
 * This is deliberately NOT `DocStatus`. `DocStatus` carries "chunking" and
 * "unknown" as well, and the table renders no button for either, so a filter
 * set to one of those would strand the user in a view with no control to leave
 * it. What the UI actually offers is this list and only this list.
 *
 * It lives in its own pure module (no React, no "use client") because three
 * consumers need the SAME vocabulary and one of them runs in node:
 *   - `LibraryPage` renders the buttons from it,
 *   - the `matrx-user/rag-library` manifest spells it into the `library_filters`
 *     write-target contract the agent reads,
 *   - the page's write handler validates an agent's value against it.
 * Re-typing the literals in any of those is how a filter vocabulary drifts.
 */

import type { DocStatus } from "@/features/rag/types/library";

/** A value the status filter can hold — a pipeline status, or "all". */
export type LibraryStatusFilter = DocStatus | "all";

/** The buttons the library table renders, in display order. */
export const STATUS_FILTERS: {
  value: LibraryStatusFilter;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "ready", label: "Ready" },
  { value: "embedding", label: "Embedding" },
  { value: "extracted", label: "Extracted" },
  { value: "pending", label: "Pending / failed" },
];

/** Just the accepted values — the enum an agent write is checked against. */
export const LIBRARY_STATUS_FILTER_VALUES: readonly LibraryStatusFilter[] =
  STATUS_FILTERS.map((f) => f.value);
