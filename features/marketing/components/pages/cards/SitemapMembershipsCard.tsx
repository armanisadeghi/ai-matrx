"use client";

import Link from "next/link";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { usePageSitemapMemberships } from "@/features/marketing/data/hooks";
import type { MarketingPage } from "@/features/marketing/types";
import { marketingPageManifest } from "@/features/surfaces/manifests/marketing-page.manifest";
import { surfaceValueLabels } from "@/features/surfaces/utils/surface-display";
import {
  formatDate,
  QueryError,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";

// THE NAMING LAW: canonical labels for every declared surface value + group —
// section titles and field labels below render these byte-identically.
const L = surfaceValueLabels(marketingPageManifest);

export function SitemapMembershipsCard({ page }: { page: MarketingPage }) {
  const { site, sitePath } = useMarketingSite();
  const memberships = usePageSitemapMemberships(site.id, page.id);
  const rows = memberships.data ?? [];
  const copy = webCopy({
    kind: "web-page-sitemap-memberships",
    label: L.sitemap_memberships,
    description: "Which sitemap documents advertise this canonical URL.",
    surface: `Sitemap memberships — ${page.url}`,
    data: rows,
    lines: [
      ["URL", page.url],
      ["Sitemaps advertising this URL", rows.length],
      ...rows.map((membership): [string, string] => [
        "Sitemap",
        `${membership.sitemap.url} (last seen ${formatDate(membership.last_seen)})`,
      ]),
    ],
    attributes: { page_id: page.id, count: rows.length },
  });

  let body: React.ReactNode;
  if (memberships.isLoading) {
    body = (
      <div className="m-3 h-16 animate-pulse rounded-lg border border-border bg-muted/40" />
    );
  } else if (memberships.isError) {
    body = (
      <QueryError
        error={memberships.error}
        onRetry={() => void memberships.refetch()}
      />
    );
  } else if (rows.length === 0) {
    body = (
      <p className="p-4 text-xs text-muted-foreground">
        No sitemap advertises this URL — it was found another way.
      </p>
    );
  } else {
    body = (
      <ul className="divide-y divide-border">
        {rows.map((membership) => (
          <li
            key={membership.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
          >
            <Link
              href={`${sitePath}/sitemaps/${membership.sitemap.id}`}
              className="min-w-0 flex-1 basis-56 truncate font-mono text-xs text-foreground hover:text-primary"
            >
              {membership.sitemap.url}
            </Link>
            <span className="text-[11px] text-muted-foreground">
              {membership.lastmod
                ? `lastmod ${formatDate(membership.lastmod)}`
                : "no lastmod"}
            </span>
            <span className="text-[11px] text-muted-foreground">
              seen {formatDate(membership.last_seen)}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <SectionCard
      title={L.sitemap_memberships}
      copy={copy}
      collapsible
      anchor="sitemap_memberships"
    >
      {body}
    </SectionCard>
  );
}
