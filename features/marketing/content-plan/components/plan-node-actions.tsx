"use client";

/**
 * THE PLAN NODE'S ACTIONS — ONE definition of what a right-clicked
 * `plan.node` row offers, shared by every surface that shows a plan node
 * (`PlanNodesTable` today; `PlanTree` / `SiteMap` / `NodePanel` are future
 * adopters — they render the same `PlanNodeRow` shape and currently have no
 * menu of their own).
 *
 * Plain function, not a hook — same shape as `pageMenuSection` /
 * `siteMenuSection`: the host keeps the clicked row in STATE and rebuilds
 * `extraSections` off it.
 *
 * 🚨 NO NEW READ OR WRITE PATH LIVES HERE. Every item opens a door that
 * already exists: the CMS page editor, the realized page's workspace, or the
 * Keyword Intelligence window (host-supplied `onOpenKeyword`, since the
 * phrase lookup lives in the host's own query).
 */

import { ExternalLink, FileEdit, PanelTop, Search } from "lucide-react";

import type {
  ContextMenuEntityRef,
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import {
  applyAvailability,
  needs,
  type AvailabilityMap,
} from "@/features/context-menu-v3/utils/availability";
import { cmsPageEditorHref } from "@/features/cms/utils/cmsRoutes";
import { marketingRoutes } from "@/features/marketing/lib/routes";

export interface PlanNodeMenuRow {
  id: string;
  label: string;
  siteId: string;
  cmsSiteId?: string | null;
  cmsPageId?: string | null;
  webPageId?: string | null;
  primaryKeywordId?: string | null;
  keywordPhrase?: string | null;
}

/** There is no separate "plan node row" record — this IS the `plan.node` row. */
export function planNodeEntityRef(
  row: PlanNodeMenuRow | null,
): ContextMenuEntityRef | null {
  if (!row) return null;
  return { type: "plan_node", id: row.id, title: row.label };
}

export function planNodeMenuSection(
  row: PlanNodeMenuRow | null,
  opts?: {
    label?: string;
    onOpenKeyword?: (row: PlanNodeMenuRow) => void;
    /** THE CONSISTENCY STEP — see `features/context-menu-v3/utils/availability.ts`. */
    unavailable?: AvailabilityMap;
  },
): ContextMenuExtraSection {
  const items: ContextMenuExtraItem[] = [
    {
      kind: "link",
      id: "node-open-cms",
      label: "Open in CMS",
      icon: FileEdit,
      href:
        row?.cmsSiteId && row.cmsPageId
          ? cmsPageEditorHref(row.cmsSiteId, row.cmsPageId)
          : "#",
    },
    {
      kind: "link",
      id: "node-open-page",
      label: "Open page workspace",
      icon: ExternalLink,
      href: row?.webPageId
        ? marketingRoutes.sitePage(null, row.siteId, row.webPageId)
        : "#",
    },
    {
      kind: "item",
      id: "node-open-keyword",
      label: "Open target keyword",
      icon: Search,
      onSelect: () => row && opts?.onOpenKeyword?.(row),
    },
  ];
  const unavailable: AvailabilityMap = {
    "node-open-cms": !row?.cmsSiteId || !row?.cmsPageId ? needs("a paired CMS page") : null,
    "node-open-page": !row?.webPageId ? needs("a measured page") : null,
    "node-open-keyword": !row?.primaryKeywordId ? needs("a target keyword") : null,
    ...opts?.unavailable,
  };
  return {
    id: "plan-node-actions",
    label: opts?.label ?? "Page",
    icon: PanelTop,
    items: applyAvailability(items, unavailable),
  };
}
