// features/admin/applications/history/types.ts
//
// Unified audit timeline for the Applications hub — one merged stream over
// public.app_config_history and public.catalog_entries_history (both
// admin-readable). Each source keeps its own canonical JSON normalization so
// diffs stay apples-to-apples with the per-feature history panels.

import type { AppConfigHistoryRow } from "@/features/admin/applications/config/types";
import type { CatalogEntryHistoryRow } from "@/features/admin/applications/catalogs/types";

export type HistorySource = "configuration" | "catalog";

/** One normalized row in the merged timeline. */
export interface ApplicationsHistoryEntry {
  /** Stable across both sources: `${source}:${id}`. */
  rowId: string;
  source: HistorySource;
  app: string;
  /** Human target: the app slug for configuration, `kind · key` for catalogs. */
  target: string;
  /** Catalog rows carry update|delete; configuration rows are always update. */
  op: string;
  changedAt: string;
  changedBy: string | null;
  /** Canonical pretty JSON for this snapshot. */
  snapshotJson: string;
  /**
   * Canonical pretty JSON of the immediately PRIOR snapshot in the same
   * series (same source + target). Empty string for the first snapshot —
   * the diff then reads as a creation.
   */
  previousJson: string;
}

export type { AppConfigHistoryRow, CatalogEntryHistoryRow };
