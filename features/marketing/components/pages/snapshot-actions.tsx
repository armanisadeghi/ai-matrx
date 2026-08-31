"use client";

/**
 * THE PAGE SNAPSHOT'S ACTIONS — ONE definition of what a right-clicked
 * `web.snapshot` row offers, shared by every surface that shows one:
 * `SnapshotsTable` (the list), `SnapshotCompare` (before/after diff), and
 * future adopters (`SnapshotArtifacts`).
 *
 * Plain function, not a hook — same shape as `pageMenuSection` /
 * `siteMenuSection`: the host keeps the clicked row in STATE and rebuilds
 * `extraSections` off it.
 *
 * 🚨 NO NEW READ OR WRITE PATH LIVES HERE. Both items are navigation to a
 * route that already exists (`marketingRoutes.site` / `marketingRoutes.sitePage`).
 */

import { Camera, ExternalLink } from "lucide-react";

import type {
  ContextMenuEntityRef,
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import {
  applyAvailability,
  type AvailabilityMap,
} from "@/features/context-menu-v3/utils/availability";
import { marketingRoutes } from "@/features/marketing/lib/routes";

/** The one thing every snapshot-showing surface can say about a snapshot. */
export interface SnapshotMenuRow {
  siteId: string;
  brandId: string | null;
  pageId: string;
  snapshotId: string;
  capturedAt: string;
  finalUrl: string | null;
}

/** There is no separate "snapshot row" record — this IS the `web.snapshot` row. */
export function snapshotEntityRef(
  row: SnapshotMenuRow | null,
): ContextMenuEntityRef | null {
  if (!row) return null;
  return {
    type: "web_snapshot",
    id: row.snapshotId,
    title: row.finalUrl ?? row.capturedAt,
  };
}

export function snapshotMenuSection(
  row: SnapshotMenuRow | null,
  opts?: {
    label?: string;
    /** THE CONSISTENCY STEP — see `features/context-menu-v3/utils/availability.ts`. */
    unavailable?: AvailabilityMap;
  },
): ContextMenuExtraSection {
  const items: ContextMenuExtraItem[] = [
    {
      kind: "link",
      id: "snapshot-open",
      label: "Open snapshot",
      icon: Camera,
      href: row
        ? marketingRoutes.site(
            row.brandId,
            row.siteId,
            `/pages/${row.pageId}/snapshots/${row.snapshotId}`,
          )
        : "#",
      disabled: !row,
    },
    {
      kind: "link",
      id: "snapshot-open-page",
      label: "Open page workspace",
      icon: ExternalLink,
      href: row
        ? marketingRoutes.sitePage(row.brandId, row.siteId, row.pageId)
        : "#",
      disabled: !row,
    },
  ];
  return {
    id: "snapshot-actions",
    label: opts?.label ?? "Snapshot",
    icon: Camera,
    items: applyAvailability(items, opts?.unavailable),
  };
}
