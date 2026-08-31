"use client";

/**
 * THE UDT DATASET TABLE'S ACTIONS — ONE definition of "what you can do to a
 * user-generated data table (`workbench.udt_datasets`)", shared by every
 * surface that shows one AS A WHOLE RECORD (not a single row/cell inside it —
 * that is `matrx-user/data-tables`' own per-cell editor).
 *
 * Census (context-menu rollout, 2026-08-30): the identity recurs on
 * `UserTableWindow` (full-size floating viewer, opened from a converted
 * chat-artifact table) and `QuickDataWindow`'s `QuickDataSheet` (table picker
 * + inline preview) — both windows in `features/window-panels/windows/`, both
 * previously answering a right-click with whatever page sat underneath. This
 * module is the fix: a host calls `useDatasetTableMenuSection` with a
 * `getRow` reading its own selected-table state and gets the same actions
 * everywhere. Future adopters: `DataTableDetailClient` (`/data/[id]`),
 * `OrgResourceList`, `DatasetPeek` — same `udt_datasets` row, no menu of
 * their own today.
 *
 * 🚨 NO NEW WRITE PATH LIVES HERE. "Open in Data Workspace" just links to the
 * existing `/data/[id]` route; this module adds no RPC of its own.
 */

import { ExternalLink, Hash } from "lucide-react";

import { toast } from "@/lib/toast";
import type {
  ContextMenuEntityRef,
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import {
  withAvailability,
  type AvailabilityMap,
} from "@/features/context-menu-v3/utils/availability";

/** The one thing every dataset-table surface can say about the selected table. */
export interface DatasetTableMenuRow {
  id: string;
  name: string | null;
}

/** THE ROW'S OWN ENTITY — Attach To / Share target this dataset. */
export function datasetTableEntityRef(
  row: DatasetTableMenuRow | null,
): ContextMenuEntityRef | null {
  if (!row) return null;
  return {
    type: "dataset",
    id: row.id,
    title: row.name ?? "Data table",
    resourceType: "dataset",
  };
}

export function useDatasetTableMenuSection(opts: {
  /** The table the menu was opened on (or the window's single table). */
  getRow: () => DatasetTableMenuRow | null;
  /** Label for the section heading. */
  label?: string;
  /**
   * THE CONSISTENCY STEP — what THIS surface cannot do, and why. Keyed by
   * item id (`dataset-open-workspace`, `dataset-copy-id`). Contract:
   * `features/context-menu-v3/utils/availability.ts`.
   */
  unavailable?: AvailabilityMap;
}): ContextMenuExtraSection {
  const { getRow } = opts;
  const row = getRow();

  const items: ContextMenuExtraItem[] = [
    {
      kind: "link",
      id: "dataset-open-workspace",
      label: "Open in Data Workspace",
      icon: ExternalLink,
      href: row ? `/data/${row.id}` : "#",
      target: "_blank",
      disabled: !row,
    },
    {
      kind: "item",
      id: "dataset-copy-id",
      label: "Copy dataset ID",
      icon: Hash,
      onSelect: () => {
        if (!row) return;
        void navigator.clipboard.writeText(row.id);
        toast.success("Dataset ID copied");
      },
      disabled: !row,
    },
  ];

  return withAvailability(
    {
      id: "dataset-table",
      label: opts.label ?? "This table",
      anchor: "after-compare",
      items,
    },
    opts.unavailable,
  );
}
