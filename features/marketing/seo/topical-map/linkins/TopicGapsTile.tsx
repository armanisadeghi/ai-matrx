"use client";

/**
 * "Topics with no page" on the site coverage matrix (placement §7 #7): the
 * fourth column of the question coverage already asks — sitemap, crawl,
 * Search Console, and now the MAP. `seo.list_topic_gaps(map, site)` returns
 * topics that should have a page on this site and have none; the tile is a
 * door to the map's table (where the count column shows which). Without a
 * map the tile says so and offers to start one — never a zero.
 */

import Link from "next/link";
import { Network } from "lucide-react";

import { cn } from "@/lib/utils";

import { topicalMapErrorText } from "../errors";
import { useTopicGaps } from "../hooks";
import { startMapHref } from "../components/TopicalMapHome";
import { useSiteTopicalMapLink } from "./useSiteTopicalMapLink";

export function TopicGapsTile({
  siteId,
  brandSeg,
  className,
}: {
  siteId: string;
  brandSeg: string | null;
  className?: string;
}) {
  const link = useSiteTopicalMapLink(siteId, brandSeg);
  // access-errors: ok — rendered verbatim.
  const gaps = useTopicGaps(link.mapId ?? "", siteId, link.status === "ready");

  const body = (() => {
    if (link.status === "loading" || (link.status === "ready" && gaps.isPending))
      return { value: "…", note: "loading", href: null as string | null, attention: false };
    if (link.status === "error")
      return { value: "—", note: link.error, href: null, attention: false };
    if (link.status === "none")
      return {
        value: "no map",
        note: "This site uses no topical map yet",
        href: brandSeg ? startMapHref(brandSeg, { source: "data", siteId }) : null,
        attention: false,
      };
    if (gaps.isError)
      return { value: "—", note: topicalMapErrorText(gaps.error), href: null, attention: false };
    const total = gaps.data?.total ?? 0;
    return {
      value: String(total),
      note: "Map topics that should have a page here and have none",
      href: link.href("table"),
      attention: total > 0,
    };
  })();

  const inner = (
    <>
      <div className="flex items-start gap-2">
        <p className="flex items-center gap-1 truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Network className="h-3 w-3" aria-hidden />
          Topics with no page
        </p>
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums">{body.value}</p>
      <p className="truncate text-[11px] text-muted-foreground" title={body.note}>
        {body.note}
      </p>
    </>
  );

  const classes = cn(
    "block min-w-0 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors",
    body.href && "hover:border-primary/40 hover:bg-muted/30",
    body.attention && "border-amber-500/40 bg-amber-500/5",
    className,
  );

  return body.href ? (
    <Link href={body.href} className={classes} data-surface-value="topic_gaps">
      {inner}
    </Link>
  ) : (
    <div className={classes} data-surface-value="topic_gaps">
      {inner}
    </div>
  );
}
