"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Globe, TrendingUp } from "lucide-react";
import type { ItemMenuConfig } from "@/components/official/item/types";
import type {
  EntityListConfig,
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import type { ListScopeKind } from "@/lib/list-scope/types";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";
import { formatCompactDate } from "@/features/marketing/components/shared/MarketingUi";
import {
  fetchCrossSiteRankCounts,
  fetchCrossSiteRankFacets,
  fetchCrossSiteRankPage,
  type CrossSiteRankRow,
} from "./cross-site-data";
import {
  CROSS_SITE_RANK_COLUMNS,
  movementText,
  positionText,
} from "./cross-site-columns";
import { setCrossSiteRankRuntime } from "./cross-site-runtime";

const RANK_LIST_SCOPES: ListScopeKind[] = [
  "mine",
  "orgs",
  "shared",
  "public",
];

export function rankTargetHref(row: CrossSiteRankRow): string | undefined {
  return row.site_id
    ? marketingRoutes.site(row.brand_id, row.site_id, "/ranks")
    : undefined;
}

function liveSiteHref(domain: string | null): string | undefined {
  if (!domain) return undefined;
  return /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
}

function useRankRowActions(
  list: EntityListController<CrossSiteRankRow>,
): EntityRowActionsResult<CrossSiteRankRow> {
  const router = useRouter();
  useEffect(() => {
    setCrossSiteRankRuntime({
      rows: list.rows,
      total: list.total,
      query: list.query,
      error: list.error,
    });
  }, [list.rows, list.total, list.query, list.error]);

  const menuFor = (row: CrossSiteRankRow) => (): ItemMenuConfig => {
    const ranksHref = rankTargetHref(row);
    const liveHref = liveSiteHref(row.site_domain);
    const siteHref = row.site_id
      ? marketingRoutes.site(row.brand_id, row.site_id)
      : undefined;
    return {
      header: { title: row.keyword, description: row.site_name ?? undefined },
      sections: [
        {
          id: "open",
          items: [
            {
              id: "open-ranks",
              label: "Open tracked keyword",
              icon: TrendingUp,
              kind: "link",
              href: ranksHref ?? marketingRoutes.ranks(),
              disabled: !ranksHref,
              disabledReason: !ranksHref
                ? "The owning site is unavailable"
                : undefined,
            },
            {
              id: "open-site",
              label: "Open site",
              icon: Globe,
              kind: "link",
              href: siteHref ?? marketingRoutes.sites(),
              disabled: !siteHref,
              disabledReason: !siteHref
                ? "The owning site is unavailable"
                : undefined,
            },
            {
              id: "open-live-site",
              label: "Open live website",
              icon: ExternalLink,
              kind: "link",
              href: liveHref ?? marketingRoutes.sites(),
              target: "_blank",
              disabled: !liveHref,
              disabledReason: !liveHref
                ? "No live domain is available"
                : undefined,
            },
          ],
        },
      ],
    };
  };

  const onOpenRow = (row: CrossSiteRankRow) => {
    const href = rankTargetHref(row);
    if (href) router.push(href);
  };

  return { actions: { menuFor, onOpenRow } };
}

export const crossSiteRankListConfig: EntityListConfig<CrossSiteRankRow> = {
  surfaceKey: "marketing-cross-site-ranks",
  entityLabel: { singular: "tracked keyword", plural: "tracked keywords" },
  sourceFeature: "marketing",
  scopes: RANK_LIST_SCOPES,
  service: {
    fetchPage: fetchCrossSiteRankPage,
    fetchCounts: fetchCrossSiteRankCounts,
    fetchFacets: fetchCrossSiteRankFacets,
  },
  columns: CROSS_SITE_RANK_COLUMNS,
  prefsVersion: 1,
  prefsDefaults: {
    sort: "created_at",
    direction: "desc",
  },
  getRowId: (row) => row.target_id,
  getRowName: (row) => row.keyword,
  door: { hrefFor: rankTargetHref },
  getRowEntity: (row) => ({
    type: "seo_rank_target",
    id: row.target_id,
    title: row.keyword,
  }),
  useRowActions: useRankRowActions,
  supportsArchived: false,
  facetSections: [
    {
      facet: "tracking_label",
      filterId: "tracking_label",
      label: "Tracking modes",
      noneLabel: "Unknown",
      countInLabel: false,
    },
    {
      facet: "device",
      filterId: "device",
      label: "Devices",
      noneLabel: "Unknown",
      countInLabel: false,
    },
  ],
  copy: {
    label: "Rank target",
    listLabel: "Cross-site rank portfolio",
    location: webLocation("Rank tracking (cross-site)"),
    rowKind: "web-rank-target",
    listKind: "web-rank-portfolio",
    rowDescription:
      "One tracked keyword's rank state on one site (latest, movement, best).",
    listDescription:
      "The current server-filtered page of the declared rank-portfolio scope.",
    humanRow: (row) =>
      humanLines([
        ["Keyword", row.keyword],
        ["Site", row.site_name],
        ["Domain", row.site_domain],
        ["Tracked in", row.tracking_label],
        ["Device", row.device],
        ["Position", positionText(row)],
        ["Change", movementText(row)],
        ["Best", row.best_position == null ? "—" : `#${row.best_position}`],
        [
          "Last checked",
          row.last_checked_at
            ? formatCompactDate(row.last_checked_at)
            : "Never",
        ],
        ["Active", row.is_active ? "yes" : "no"],
      ]),
    rowAttributes: (row) => ({
      rank_target_id: row.target_id,
      site_id: row.site_id ?? "",
      keyword: row.keyword,
    }),
    listAttributes: (rows) => ({ loaded_targets: rows.length }),
    showRow: false,
    showToolbar: false,
  },
  emptyState: {
    title: "No tracked keywords in this scope",
    description:
      "Choose another scope, or track a keyword from a site's Ranks workspace.",
  },
};
