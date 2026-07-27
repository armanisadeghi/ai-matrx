"use client";

/**
 * PageLinksCard — the internal-link picture for one canonical page: which
 * pages of the site link TO it (inbound) and which URLs it links OUT to,
 * rolled up per partner URL with anchor-text samples and nofollow/broken
 * badges. Reads `web.link_edge` via bounded deterministic fetches
 * (data/page-links.ts); aggregation is client-side over the full fetch.
 */

import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  QueryError,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import {
  LINK_ROW_CAP,
  rollupInboundLinks,
  rollupOutboundLinks,
  usePageInboundLinks,
  usePageOutboundLinks,
  type LinkPartnerRollup,
} from "@/features/marketing/data/page-links";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import type { MarketingPage } from "@/features/marketing/types";

function LinkPartnerList({
  groups,
  sitePath,
  emptyMessage,
}: {
  groups: LinkPartnerRollup[];
  sitePath: string;
  emptyMessage: string;
}) {
  if (groups.length === 0) {
    return <p className="px-3 py-4 text-xs text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <ul className="divide-y divide-border/60">
      {groups.slice(0, 25).map((group) => (
        <li key={group.url} className="px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {group.isInternal && group.pageId ? (
              <Link
                href={`${sitePath}/pages/${group.pageId}`}
                className="min-w-0 flex-1 basis-52 truncate font-mono text-xs text-foreground hover:text-primary"
              >
                {group.url}
              </Link>
            ) : (
              <span
                className="min-w-0 flex-1 basis-52 truncate font-mono text-xs text-foreground"
                title={group.url}
              >
                {group.url}
              </span>
            )}
            {group.edgeCount > 1 ? (
              <span className="text-[11px] tabular-nums text-muted-foreground">
                ×{group.edgeCount}
              </span>
            ) : null}
            {!group.isInternal ? (
              <Badge variant="outline" className="text-[10px]">
                external
              </Badge>
            ) : null}
            {group.hasNofollow ? (
              <Badge variant="secondary" className="text-[10px]">
                nofollow
              </Badge>
            ) : null}
            {group.isBroken ? (
              <Badge variant="destructive" className="text-[10px]">
                broken{group.worstHttpStatus ? ` ${group.worstHttpStatus}` : ""}
              </Badge>
            ) : null}
          </div>
          {group.anchors.length > 0 ? (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {group.anchors.map((anchor) => `“${anchor}”`).join(" · ")}
            </p>
          ) : null}
        </li>
      ))}
      {groups.length > 25 ? (
        <li className="px-3 py-2 text-[11px] text-muted-foreground">
          +{groups.length - 25} more URLs in the copied data.
        </li>
      ) : null}
    </ul>
  );
}

export function PageLinksCard({ page }: { page: MarketingPage }) {
  const { site, sitePath } = useMarketingSite();
  const inbound = usePageInboundLinks(site.id, page.id, page.url);
  const outbound = usePageOutboundLinks(site.id, page.id);

  const inboundRows = inbound.data ?? [];
  const outboundRows = outbound.data ?? [];
  const inboundGroups = rollupInboundLinks(inboundRows);
  const outboundGroups = rollupOutboundLinks(outboundRows);
  const brokenOutbound = outboundGroups.filter((group) => group.isBroken);

  const copy = webCopy({
    kind: "web-page-links",
    label: "Internal links",
    description:
      "Internal link edges for this canonical page: pages linking to it (inbound) and every URL it links out to, with per-URL anchor rollups and nofollow/broken flags.",
    surface: `Internal links — ${page.url}`,
    data: {
      inbound: { rows: inboundRows, groups: inboundGroups },
      outbound: { rows: outboundRows, groups: outboundGroups },
      rowCap: LINK_ROW_CAP,
    },
    lines: [
      ["URL", page.url],
      ["Inbound linking pages", inboundGroups.length],
      ["Inbound edges fetched", inboundRows.length],
      ["Outbound target URLs", outboundGroups.length],
      ["Outbound edges fetched", outboundRows.length],
      ["Broken outbound targets", brokenOutbound.length],
    ],
    attributes: {
      page_id: page.id,
      inbound_edges: inboundRows.length,
      outbound_edges: outboundRows.length,
    },
  });

  let body: React.ReactNode;
  if (inbound.isLoading || outbound.isLoading) {
    body = (
      <div className="grid gap-3 p-3 sm:grid-cols-2">
        <div className="h-28 animate-pulse rounded-lg border border-border bg-muted/40" />
        <div className="h-28 animate-pulse rounded-lg border border-border bg-muted/40" />
      </div>
    );
  } else if (inbound.isError) {
    body = (
      <QueryError error={inbound.error} onRetry={() => void inbound.refetch()} />
    );
  } else if (outbound.isError) {
    body = (
      <QueryError
        error={outbound.error}
        onRetry={() => void outbound.refetch()}
      />
    );
  } else {
    const capped =
      inboundRows.length >= LINK_ROW_CAP || outboundRows.length >= LINK_ROW_CAP;
    body = (
      <div className="grid sm:grid-cols-2 sm:divide-x sm:divide-border/60">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 border-b border-border/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <ArrowDownLeft className="h-3 w-3" />
            Inbound · {inboundGroups.length} pages ({inboundRows.length} edges)
          </p>
          <LinkPartnerList
            groups={inboundGroups}
            sitePath={sitePath}
            emptyMessage="No resolved inbound links — other pages may not link here, or link resolution may not have run for this site yet."
          />
        </div>
        <div className="min-w-0 border-t border-border/60 sm:border-t-0">
          <p className="flex items-center gap-1.5 border-b border-border/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <ArrowUpRight className="h-3 w-3" />
            Outbound · {outboundGroups.length} URLs ({outboundRows.length} edges)
          </p>
          <LinkPartnerList
            groups={outboundGroups}
            sitePath={sitePath}
            emptyMessage="No outbound links recorded — this page has not been crawled yet, or its snapshot recorded no links."
          />
        </div>
        {capped ? (
          <p className="border-t border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground sm:col-span-2">
            Showing the newest {LINK_ROW_CAP} edges per direction — older edges
            are not included in these rollups.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <SectionCard
      title="Internal links"
      copy={copy}
      collapsible
      anchor="page_links"
    >
      {body}
    </SectionCard>
  );
}
