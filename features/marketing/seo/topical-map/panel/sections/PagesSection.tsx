"use client";

/**
 * Pages — the live `web_page` rows on this topic, each with where it is going.
 *
 * THE DOT. A `covers` edge into THIS live topic is coverage of it, so a page
 * here is `in_place` unless an intent this workspace has listed says it is
 * leaving (`pageIntentTone` over the intent in the slice). A page whose intent
 * the workspace has not listed shows no intent colour rather than a guessed
 * one — the pages screen lists intents; the panel does not re-read them for
 * one topic.
 *
 * TRAFFIC. `clicks` / `impressions` are `seo._tm_item`'s own numbers over the
 * function's own `performance_window_days` (the knob, resolved server-side),
 * printed with that window so a number is never read against the wrong span.
 * A page with no observations reports `0`, a real zero (types.ts).
 *
 * DOORS (R17): the page record (`EntityRef` → `/marketing/pages/{id}`, peek,
 * new tab), the live URL in a new tab, and the CMS record when a pairing
 * exists for the site in scope.
 */

import { ExternalLink, LayoutTemplate } from "lucide-react";

import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { AppLink } from "@/components/navigation/AppLink";
import { useAppSelector } from "@/lib/redux/hooks";

import type { MapIntentColors } from "../../knobs";
import { pageIntentTone, selectPageIntent } from "../../redux/selectors";
import { IntentDot } from "../../ui/IntentDot";
import type { PageAssociation } from "../associationGroups";
import { cmsPageHref, useCmsPairings } from "../useCmsPairings";
import { PanelEmptyLine, PanelSection } from "../PanelSection";

export interface PagesSectionProps {
  mapId: string;
  slug: string;
  siteId: string | null;
  pages: readonly PageAssociation[];
  intentColors: MapIntentColors;
}

export function PagesSection({ mapId, slug, siteId, pages, intentColors }: PagesSectionProps) {
  const pairings = useCmsPairings(siteId);
  const windowDays = pages[0]?.item.performance_window_days;

  return (
    <PanelSection
      title="Pages"
      count={pages.length}
      action={
        windowDays !== undefined ? (
          <span className="text-[11px] text-muted-foreground">
            traffic over {windowDays} days
          </span>
        ) : null
      }
    >
      {pages.length === 0 ? (
        <PanelEmptyLine>No live page covers this topic.</PanelEmptyLine>
      ) : (
        <ul className="flex flex-col gap-1">
          {pages.map(({ row, item }) => (
            <PageRow
              key={`${row.association.direction}:${item.id}`}
              mapId={mapId}
              slug={slug}
              pageId={item.id}
              label={item.label ?? item.url ?? item.id}
              url={item.url ?? null}
              clicks={item.clicks}
              impressions={item.impressions}
              intentColors={intentColors}
              cms={pairings.data?.get(item.id) ?? null}
            />
          ))}
        </ul>
      )}
    </PanelSection>
  );
}

function PageRow({
  mapId,
  slug,
  pageId,
  label,
  url,
  clicks,
  impressions,
  intentColors,
  cms,
}: {
  mapId: string;
  slug: string;
  pageId: string;
  label: string;
  url: string | null;
  clicks: number;
  impressions: number;
  intentColors: MapIntentColors;
  cms: { cmsSiteId: string; cmsPageId: string; title: string } | null;
}) {
  const intent = useAppSelector(selectPageIntent(mapId, pageId));
  const tone = intent
    ? pageIntentTone(
        {
          pageId,
          disposition: intent.disposition,
          state: intent.state,
          currentTopicSlugs: [slug],
          intendedTopicSlug: intent.topic?.slug ?? null,
        },
        slug,
      )
    : "in_place";

  return (
    <li className="flex min-w-0 items-center gap-2 text-sm" data-page-id={pageId}>
      {tone ? <IntentDot tone={tone} colors={intentColors} /> : null}
      <div className="min-w-0 flex-1">
        <EntityRef token="web_page" id={pageId} name={label} openInNewTab showIcon={false} />
      </div>
      <span
        className="shrink-0 tabular-nums text-[11px] text-muted-foreground"
        title={`${clicks} clicks, ${impressions} impressions from search`}
      >
        {clicks} / {impressions}
      </span>
      {url ? (
        // The live page is on the brand's own domain, never one of ours — a
        // plain anchor, no router.
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open the live page ${url} in a new tab`}
          title="Live URL"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      ) : null}
      {cms ? (
        <AppLink
          href={cmsPageHref(cms)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open the CMS record "${cms.title}" in a new tab`}
          title="CMS record"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <LayoutTemplate className="h-3.5 w-3.5" aria-hidden />
        </AppLink>
      ) : null}
    </li>
  );
}
