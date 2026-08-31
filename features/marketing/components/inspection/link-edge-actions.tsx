"use client";

/**
 * THE LINK EDGE'S ACTIONS — ONE definition of what a right-clicked
 * `web.link_edge` row offers, shared by every surface that shows one:
 * `LinksInspectionTable` (site graph + crawl link edges) and
 * `CrawlReportWorkspace` (the broken-links report — a filtered projection of
 * the same rows).
 *
 * Plain function, not a hook — same shape as `pageMenuSection` /
 * `snapshotMenuSection`: the host keeps the clicked row in STATE and rebuilds
 * `extraSections` off it.
 *
 * 🚨 NO NEW READ OR WRITE PATH LIVES HERE. Every item is navigation to a route
 * that already exists (`marketingRoutes.sitePage` / the snapshot route) or a
 * plain external link to the target URL.
 */

import { ExternalLink, FileSearch, Link2 } from "lucide-react";

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

/** The one thing every link-edge-showing surface can say about a link. */
export interface LinkEdgeMenuRow {
  siteId: string;
  brandId: string | null;
  linkEdgeId: string;
  sourcePageId: string;
  targetPageId: string | null;
  targetUrl: string;
  snapshotId: string | null;
}

/** There is no separate "link edge row" record — this IS the `web.link_edge` row. */
export function linkEdgeEntityRef(
  row: LinkEdgeMenuRow | null,
): ContextMenuEntityRef | null {
  if (!row) return null;
  return {
    type: "web_link_edge",
    id: row.linkEdgeId,
    title: row.targetUrl,
  };
}

export function linkEdgeMenuSection(
  row: LinkEdgeMenuRow | null,
  opts?: {
    label?: string;
    /** THE CONSISTENCY STEP — see `features/context-menu-v3/utils/availability.ts`. */
    unavailable?: AvailabilityMap;
  },
): ContextMenuExtraSection {
  const items: ContextMenuExtraItem[] = [
    {
      kind: "link",
      id: "link-edge-open-source",
      label: "Open source page",
      icon: FileSearch,
      href: row
        ? marketingRoutes.sitePage(row.brandId, row.siteId, row.sourcePageId)
        : "#",
      disabled: !row,
    },
    {
      kind: "link",
      id: "link-edge-open-target",
      label: "Open target page",
      icon: Link2,
      href:
        row && row.targetPageId
          ? marketingRoutes.sitePage(row.brandId, row.siteId, row.targetPageId)
          : "#",
      disabled: !row || !row.targetPageId,
      description: "The target did not resolve to a canonical page",
    },
    {
      kind: "link",
      id: "link-edge-open-target-url",
      label: "Open target URL",
      icon: ExternalLink,
      href: row?.targetUrl ?? "#",
      target: "_blank",
      disabled: !row,
    },
    {
      kind: "link",
      id: "link-edge-open-snapshot",
      label: "Open source snapshot",
      icon: FileSearch,
      href:
        row && row.snapshotId
          ? marketingRoutes.site(
              row.brandId,
              row.siteId,
              `/pages/${row.sourcePageId}/snapshots/${row.snapshotId}`,
            )
          : "#",
      disabled: !row || !row.snapshotId,
      description: "No snapshot recorded for this link",
    },
  ];
  return {
    id: "link-edge-actions",
    label: opts?.label ?? "This link",
    icon: Link2,
    items: applyAvailability(items, opts?.unavailable),
  };
}
