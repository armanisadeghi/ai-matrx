"use client";

/**
 * THE INSIGHT ROW'S ACTIONS — ONE definition of what a right-clicked Insights
 * row offers, shared by every table on the tab (KI-025).
 *
 * The Insights tab is eight tables in six panes, and its rows name four
 * different things: a traffic class, a value level, a query, or a page. Before
 * 2026-08-24 a right-click on any of them opened nothing at all, so the doors
 * each row already had ("Review →", the key column's link, the drill) were the
 * only way through. This module is the shared half of the fix — a query row
 * delegates to `useKeywordMenuSection` (the platform's ONE keyword action set),
 * and the three shapes that are NOT keywords get their sections here so no
 * table grows a private copy.
 *
 * 🚨 NO NEW READ OR WRITE PATH LIVES HERE. Every item opens a door that already
 * exists: the GSC drill-down panel, the Keyword Workbench, the value workbench,
 * the Rulebook, or a page workspace.
 */

import { ExternalLink, Filter, ListChecks, PanelTop, Pencil } from "lucide-react";

import type {
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import type { OpenGscDrilldownWindowOptions } from "@/features/overlays/openers/gscDrilldownWindow";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { levelVocabularyHref } from "@/features/marketing/seo/value-system/reason-links";

type OpenDrilldown = (opts: OpenGscDrilldownWindowOptions) => unknown;

/**
 * A TRAFFIC CLASS is a filter, not a record: it opens its keywords, and it
 * opens the screen where what sets it can be changed. Never an Attach To —
 * there is no row behind it to attach anything to.
 */
export function classMenuSection(opts: {
  siteId: string;
  siteName: string | null;
  trafficClass: string;
  openDrilldown: OpenDrilldown;
  /** Narrow the movers table below to this class (the row click's twin). */
  onFilterMovers?: () => void;
}): ContextMenuExtraSection {
  const { siteId, siteName, trafficClass, openDrilldown } = opts;
  const items: ContextMenuExtraItem[] = [
    {
      kind: "item",
      id: "class-see-keywords",
      label: "See these keywords",
      icon: PanelTop,
      onSelect: () =>
        openDrilldown({
          siteId,
          siteName,
          dimension: "query",
          filters: { stamps: `traffic_class:${trafficClass}` },
          title: `Class: ${trafficClass}`,
        }),
    },
    {
      kind: "link",
      id: "class-review",
      label:
        trafficClass === "unclassified"
          ? "Classify in Workbench"
          : "Review in Workbench",
      icon: ExternalLink,
      href: `${marketingRoutes.site(null, siteId, "/keywords")}?view=workbench&st=traffic_class:${trafficClass}`,
    },
    {
      kind: "link",
      id: "class-edit-rules",
      label: "Edit class rules…",
      icon: Pencil,
      href: marketingRoutes.site(null, siteId, "/value/rules"),
    },
  ];
  if (opts.onFilterMovers)
    items.push({
      kind: "item",
      id: "class-filter-movers",
      label: "Filter movers to this class",
      icon: Filter,
      onSelect: opts.onFilterMovers,
    });
  return { id: "insight-class-actions", label: "Class", icon: ListChecks, items };
}

/** A VALUE LEVEL — the same shape as a class, pointed at the value screens. */
export function levelMenuSection(opts: {
  siteId: string;
  siteName: string | null;
  band: string;
  bandLabel: string;
  openDrilldown: OpenDrilldown;
  onFilterMovers?: () => void;
}): ContextMenuExtraSection {
  const { siteId, siteName, band, bandLabel, openDrilldown } = opts;
  const items: ContextMenuExtraItem[] = [
    {
      kind: "item",
      id: "level-see-keywords",
      label: "See these keywords",
      icon: PanelTop,
      onSelect: () =>
        openDrilldown({
          siteId,
          siteName,
          dimension: "query",
          filters: { levels: band },
          title: `Level: ${bandLabel}`,
        }),
    },
    {
      kind: "link",
      id: "level-review",
      label: "Review on Workbench",
      icon: ExternalLink,
      href: `${marketingRoutes.site(null, siteId, "/value")}?band=${encodeURIComponent(band)}`,
    },
    {
      kind: "link",
      id: "level-edit-vocabulary",
      label: "Edit level vocabulary…",
      icon: Pencil,
      href: levelVocabularyHref({ brandId: null, siteId }),
    },
  ];
  if (opts.onFilterMovers)
    items.push({
      kind: "item",
      id: "level-filter-movers",
      label: "Filter movers to this level",
      icon: Filter,
      onSelect: opts.onFilterMovers,
    });
  return { id: "insight-level-actions", label: "Level", icon: ListChecks, items };
}

/**
 * A PAGE ROW. `pageId` is the canonical `web.page` the RPC already resolved —
 * without one there is no workspace to open, so that item is absent rather
 * than a link to nowhere.
 */
export function pageMenuSection(opts: {
  siteId: string;
  siteName: string | null;
  url: string;
  pageId: string | null;
  openDrilldown: OpenDrilldown;
}): ContextMenuExtraSection {
  const { siteId, siteName, url, pageId, openDrilldown } = opts;
  const items: ContextMenuExtraItem[] = [
    {
      kind: "item",
      id: "page-see-keywords",
      label: "See ranking keywords",
      icon: PanelTop,
      onSelect: () =>
        openDrilldown({
          siteId,
          siteName,
          dimension: "query",
          filters: { page_eq: pageId ?? url },
          title: url,
        }),
    },
  ];
  if (pageId)
    items.push({
      kind: "link",
      id: "page-open",
      label: "Open page workspace",
      icon: ExternalLink,
      href: marketingRoutes.sitePage(null, siteId, pageId),
    });
  return { id: "insight-page-actions", label: "Page", icon: ExternalLink, items };
}
