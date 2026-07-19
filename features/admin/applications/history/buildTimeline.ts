// features/admin/applications/history/buildTimeline.ts
//
// Merge the two history tables into one newest-first timeline. Pure — no
// fetching, no React — so the ordering/diff-pairing rules are testable and
// shared by any surface that wants the merged stream.
//
// Each entry is paired with the immediately PRIOR snapshot of the same series
// (same source + same target) so the expandable diff answers "what changed at
// this moment", not "how does this differ from today".

import { configSnapshotJson } from "@/features/admin/applications/config/schema";
import { entrySnapshotJson } from "@/features/admin/applications/catalogs/schemas";
import { kindLabel } from "@/features/admin/applications/catalogs/schemas";
import type {
  AppConfigHistoryRow,
  ApplicationsHistoryEntry,
  CatalogEntryHistoryRow,
} from "@/features/admin/applications/history/types";

/** Intermediate shape before prior-snapshot pairing. */
interface Staged {
  rowId: string;
  source: ApplicationsHistoryEntry["source"];
  app: string;
  target: string;
  op: string;
  changedAt: string;
  changedBy: string | null;
  snapshotJson: string;
  /** Groups snapshots of the same thing across time. */
  seriesKey: string;
}

export function buildApplicationsTimeline(
  configRows: AppConfigHistoryRow[],
  catalogRows: CatalogEntryHistoryRow[],
): ApplicationsHistoryEntry[] {
  const staged: Staged[] = [];

  for (const row of configRows) {
    staged.push({
      rowId: `configuration:${row.id}`,
      source: "configuration",
      app: row.app,
      target: row.app,
      op: "update",
      changedAt: row.changed_at,
      changedBy: row.changed_by,
      snapshotJson: configSnapshotJson(row),
      seriesKey: `configuration:${row.app}`,
    });
  }

  for (const row of catalogRows) {
    staged.push({
      rowId: `catalog:${row.id}`,
      source: "catalog",
      app: row.app,
      target: `${kindLabel(row.kind)} · ${row.key}`,
      op: row.op,
      changedAt: row.changed_at,
      changedBy: row.changed_by,
      snapshotJson: entrySnapshotJson(row),
      seriesKey: `catalog:${row.entry_id}`,
    });
  }

  // Ascending per series so each snapshot can see the one before it.
  const bySeries = new Map<string, Staged[]>();
  for (const item of staged) {
    const list = bySeries.get(item.seriesKey);
    if (list) list.push(item);
    else bySeries.set(item.seriesKey, [item]);
  }

  const previousById = new Map<string, string>();
  for (const list of bySeries.values()) {
    list.sort(
      (a, b) =>
        new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime() ||
        a.rowId.localeCompare(b.rowId),
    );
    for (let i = 0; i < list.length; i += 1) {
      const current = list[i] as Staged;
      const prior = i > 0 ? (list[i - 1] as Staged) : null;
      previousById.set(current.rowId, prior ? prior.snapshotJson : "");
    }
  }

  return staged
    .map((item) => ({
      rowId: item.rowId,
      source: item.source,
      app: item.app,
      target: item.target,
      op: item.op,
      changedAt: item.changedAt,
      changedBy: item.changedBy,
      snapshotJson: item.snapshotJson,
      previousJson: previousById.get(item.rowId) ?? "",
    }))
    .sort(
      (a, b) =>
        new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime() ||
        b.rowId.localeCompare(a.rowId),
    );
}
