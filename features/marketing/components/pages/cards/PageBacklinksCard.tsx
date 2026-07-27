"use client";

/**
 * PageBacklinksCard — external backlinks resolved to this canonical page
 * (`seo.backlink_observation` rows stamped with page_id, plus the latest
 * page-level `seo.backlink_snapshot` summary when one exists). Bounded read,
 * client-side rollup by referring domain with rank/spam and anchor samples.
 */

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  CondensedFieldGrid,
  QueryError,
  SectionCard,
  formatDate,
} from "@/features/marketing/components/shared/MarketingUi";
import {
  BACKLINK_ROW_CAP,
  rollupReferringDomains,
  usePageBacklinks,
} from "@/features/marketing/data/page-links";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import type { MarketingPage } from "@/features/marketing/types";

function ratioLabel(part: number, whole: number): string {
  if (whole === 0) return "—";
  return `${Math.round((part / whole) * 100)}% (${part}/${whole})`;
}

function minDate(values: Array<string | null>): string | null {
  let min: string | null = null;
  for (const value of values) {
    if (value && (min === null || value < min)) min = value;
  }
  return min;
}

function maxDate(values: Array<string | null>): string | null {
  let max: string | null = null;
  for (const value of values) {
    if (value && (max === null || value > max)) max = value;
  }
  return max;
}

export function PageBacklinksCard({ page }: { page: MarketingPage }) {
  const { site, sitePath } = useMarketingSite();
  const backlinks = usePageBacklinks(site.id, page.id);

  const snapshot = backlinks.data?.snapshot ?? null;
  const observations = backlinks.data?.observations ?? [];
  const domains = rollupReferringDomains(observations);
  const liveCount = observations.filter((row) => row.state === "live").length;
  const dofollowKnown = observations.filter(
    (row) => row.is_dofollow !== null,
  ).length;
  const dofollowCount = observations.filter(
    (row) => row.is_dofollow === true,
  ).length;
  const firstSeen = minDate(observations.map((row) => row.first_seen_at));
  const lastSeen = maxDate(observations.map((row) => row.last_seen_at));

  const copy = webCopy({
    kind: "web-page-backlinks",
    label: "Backlinks",
    description:
      "External backlinks resolved to this canonical page: latest page-level provider summary plus deduped observations rolled up by referring domain (rank, spam score, anchors, dofollow).",
    surface: `Backlinks — ${page.url}`,
    data: {
      snapshot,
      observations,
      referringDomains: domains,
      rowCap: BACKLINK_ROW_CAP,
      truncated: backlinks.data?.truncated ?? false,
    },
    lines: [
      ["URL", page.url],
      ["Backlinks observed", observations.length],
      ["Live", liveCount],
      ["Referring domains", domains.length],
      ["Dofollow", ratioLabel(dofollowCount, dofollowKnown)],
      ["First seen", firstSeen ? formatDate(firstSeen) : null],
      ["Last seen", lastSeen ? formatDate(lastSeen) : null],
      [
        "Provider total (latest snapshot)",
        snapshot?.total_backlinks ?? null,
      ],
    ],
    attributes: {
      page_id: page.id,
      observation_count: observations.length,
      referring_domain_count: domains.length,
    },
  });

  let body: React.ReactNode;
  if (backlinks.isLoading) {
    body = (
      <div className="m-3 h-32 animate-pulse rounded-lg border border-border bg-muted/40" />
    );
  } else if (backlinks.isError) {
    body = (
      <QueryError
        error={backlinks.error}
        onRetry={() => void backlinks.refetch()}
      />
    );
  } else if (observations.length === 0 && !snapshot) {
    body = (
      <p className="p-4 text-xs text-muted-foreground">
        No backlink observations are resolved to this page yet — collection may
        not have run, or providers report no links here. Run or review
        collection in the{" "}
        <Link
          href={`${sitePath}/backlinks`}
          className="font-medium text-primary hover:underline"
        >
          site Backlinks workspace
        </Link>
        .
      </p>
    );
  } else {
    body = (
      <div className="grid gap-3 p-3">
        <CondensedFieldGrid
          fields={[
            {
              label: "Backlinks observed",
              value:
                observations.length +
                (backlinks.data?.truncated ? ` (first ${BACKLINK_ROW_CAP})` : ""),
            },
            { label: "Live", value: liveCount, tone: "good" },
            { label: "Referring domains", value: domains.length },
            {
              label: "Dofollow",
              value: ratioLabel(dofollowCount, dofollowKnown),
            },
            { label: "First seen", value: formatDate(firstSeen) },
            { label: "Last seen", value: formatDate(lastSeen) },
            ...(snapshot
              ? [
                  {
                    label: "Provider total",
                    value: `${snapshot.total_backlinks ?? "—"} (as of ${formatDate(snapshot.observed_at)})`,
                  },
                  {
                    label: "Provider referring domains",
                    value: snapshot.referring_domains ?? "—",
                  },
                ]
              : []),
          ]}
        />
        {domains.length > 0 ? (
          <div className="rounded-md border border-border/60">
            <p className="border-b border-border/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Top referring domains
            </p>
            <ul className="divide-y divide-border/60">
              {domains.slice(0, 10).map((domain) => (
                <li key={domain.domain} className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span
                      className="min-w-0 flex-1 basis-40 truncate font-mono text-xs text-foreground"
                      title={domain.domain}
                    >
                      {domain.domain}
                    </span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      ×{domain.backlinks}
                    </span>
                    {domain.domainRank !== null ? (
                      <Badge variant="outline" className="text-[10px]">
                        rank {domain.domainRank}
                      </Badge>
                    ) : null}
                    {domain.spamScore !== null && domain.spamScore >= 30 ? (
                      <Badge variant="destructive" className="text-[10px]">
                        spam {domain.spamScore}
                      </Badge>
                    ) : domain.spamScore !== null ? (
                      <Badge variant="secondary" className="text-[10px]">
                        spam {domain.spamScore}
                      </Badge>
                    ) : null}
                    {domain.dofollowBacklinks > 0 ? (
                      <Badge variant="success" className="text-[10px]">
                        dofollow {domain.dofollowBacklinks}
                      </Badge>
                    ) : null}
                  </div>
                  {domain.anchors.length > 0 ? (
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {domain.anchors.map((anchor) => `“${anchor}”`).join(" · ")}
                    </p>
                  ) : null}
                </li>
              ))}
              {domains.length > 10 ? (
                <li className="px-3 py-2 text-[11px] text-muted-foreground">
                  +{domains.length - 10} more domains in the copied data.
                </li>
              ) : null}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            A page-level provider summary exists, but no individual link
            observations are resolved to this page yet — collect link details
            in the{" "}
            <Link
              href={`${sitePath}/backlinks`}
              className="font-medium text-primary hover:underline"
            >
              site Backlinks workspace
            </Link>
            .
          </p>
        )}
      </div>
    );
  }

  return (
    <SectionCard
      title="Backlinks"
      copy={copy}
      collapsible
      anchor="page_backlinks"
    >
      {body}
    </SectionCard>
  );
}
