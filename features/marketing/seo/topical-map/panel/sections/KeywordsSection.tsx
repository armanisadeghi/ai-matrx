"use client";

/**
 * Keywords — `seo.site_keyword_value` rows on this topic (the function's
 * `seo_keyword` / `home` edges, each carrying the site in its payload).
 *
 * `seo_keyword` has no route of its own in the entity registry (deliberate:
 * a keyword is read on its site's workbench), so the door is the Keyword
 * Workbench of the keyword's site, filtered to this topic through
 * `useMapLinks().keywordWorkbench` — null without a brand route, and then the
 * row says so instead of pretending.
 */

import { ExternalLink } from "lucide-react";

import { AppLink } from "@/components/navigation/AppLink";

import { useMapLinks } from "../../links";
import type { MapTopicAssociationResolved } from "../../types";
import { itemLabel } from "../associationGroups";
import { PanelEmptyLine, PanelSection, ShowMoreRow, pagedCount } from "../PanelSection";
import type { KindPaging } from "../useTopicAssociationPages";

export interface KeywordsSectionProps {
  slug: string;
  siteId: string | null;
  keywords: readonly MapTopicAssociationResolved[];
  /** "Show more" for this kind — the panel reads only the rows it shows. */
  paging: KindPaging;
  /** The tree's own total for this kind, printed while more rows exist. */
  total?: number;
}

function payloadSiteId(row: MapTopicAssociationResolved): string | null {
  const payload = row.association.payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const value = (payload as Record<string, unknown>).site_id;
    return typeof value === "string" ? value : null;
  }
  return null;
}

export function KeywordsSection({ slug, siteId, keywords, paging, total }: KeywordsSectionProps) {
  const links = useMapLinks();
  const sites = new Set(
    keywords
      .map((row) => payloadSiteId(row) ?? siteId)
      .filter((value): value is string => typeof value === "string"),
  );
  const [onlySite] = sites;
  const workbenchSite: string | null = sites.size === 1 ? (onlySite ?? null) : siteId;
  const workbench = workbenchSite ? links.keywordWorkbench(workbenchSite, slug) : null;

  return (
    <PanelSection
      title="Keywords"
      count={pagedCount(keywords.length, paging, total)}
      action={
        workbench ? (
          <AppLink
            href={workbench}
            target="_blank"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Keyword Workbench
            <ExternalLink className="h-3 w-3" aria-hidden />
          </AppLink>
        ) : workbenchSite ? (
          <span className="text-[11px] text-muted-foreground" title="The workbench is a brand route; open the map from its brand to reach it.">
            workbench needs the brand route
          </span>
        ) : null
      }
    >
      {keywords.length === 0 ? (
        <PanelEmptyLine>No keyword is assigned to this topic.</PanelEmptyLine>
      ) : (
        <ul className="flex flex-wrap gap-1">
          {keywords.map((row) => {
            const site = payloadSiteId(row);
            const href = site ? links.keywordWorkbench(site, slug) : null;
            const chip = (
              <span className="rounded-sm border border-border bg-muted/60 px-1.5 py-px text-xs">
                {itemLabel(row)}
              </span>
            );
            return (
              <li key={row.item.id}>
                {href ? (
                  <AppLink href={href} target="_blank" title="Open on the Keyword Workbench">
                    {chip}
                  </AppLink>
                ) : (
                  chip
                )}
              </li>
            );
          })}
        </ul>
      )}
      <ShowMoreRow paging={paging} shown={keywords.length} total={total} noun="keywords" />
    </PanelSection>
  );
}
