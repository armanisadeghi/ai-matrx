"use client";

/**
 * Backlink KPI strip — the latest summary snapshot rendered with the
 * canonical `MetricCell` strip (no local metric-card variant). New/lost
 * referring-domain counts come off the summary `extras` through
 * `parseSummaryExtras` — components never poke raw jsonb.
 */

import { MetricCell } from "@/features/marketing/components/shared/MarketingUi";
import { formatGscDate } from "@/features/marketing/search-console/lib/format";
import { parseSummaryExtras } from "@/features/marketing/components/backlinks/lib/extras";
import {
  backlinkEmptyHint,
  DOMAIN_RANK_EXPLAINER,
  SPAM_SCORE_EXPLAINER,
  spamTone,
} from "@/features/marketing/components/backlinks/lib/vocab";
import { humanMetric } from "@/features/marketing/components/backlinks/format";
import type { BacklinkSnapshotRow } from "@/features/marketing/data/backlinks-types";
import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";

function compactNumber(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "—"
    : Intl.NumberFormat("en", { notation: "compact" }).format(value);
}

interface KpiTile {
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "good" | "warning" | "bad";
  /** Raw value + explainer for the copy payload. */
  raw: number | null;
  explainer?: string;
  /** A count is a door — the Insights lens that lists exactly these links. */
  href?: string;
}

export function BacklinkKpiBand({
  summary,
  siteDomain,
  sitePath,
  location,
}: {
  summary: BacklinkSnapshotRow | null | undefined;
  siteDomain: string;
  /** `/marketing/brands/x/sites/y` — the base for every in-app destination. */
  sitePath: string;
  location: string;
}) {
  const lensHref = (insight: string) =>
    `${sitePath}/backlinks?tab=insights&insight=${insight}`;
  if (!summary) {
    return (
      <div className="rounded-md border border-dashed border-border bg-card/60 p-4">
        <p className="text-sm font-medium text-foreground">
          We have not checked this site&apos;s links yet
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {backlinkEmptyHint(`any link totals for ${siteDomain}`)}
        </p>
      </div>
    );
  }

  const extras = parseSummaryExtras(summary.extras);
  const dofollow = summary.dofollow_backlinks;
  const nofollow = summary.nofollow_backlinks;
  const followTotal =
    dofollow !== null && nofollow !== null ? dofollow + nofollow : null;
  const dofollowShare =
    dofollow !== null && followTotal !== null && followTotal > 0
      ? (dofollow / followTotal) * 100
      : null;
  const domainsDetailParts = [
    extras.newReferringDomains !== null
      ? `+${compactNumber(extras.newReferringDomains)} new`
      : null,
    extras.lostReferringDomains !== null
      ? `−${compactNumber(extras.lostReferringDomains)} lost`
      : null,
  ].filter(Boolean);
  const domainsDetail =
    domainsDetailParts.length > 0
      ? `${domainsDetailParts.join(" / ")} domains`
      : undefined;
  const tone = spamTone(summary.spam_score);

  const tiles: KpiTile[] = [
    {
      label: "Total backlinks",
      value: compactNumber(summary.total_backlinks),
      detail: "Every link to your site we know about",
      raw: summary.total_backlinks,
    },
    {
      label: "Referring domains",
      value: compactNumber(summary.referring_domains),
      detail:
        domainsDetail ?? "Separate websites linking to you, however many times",
      raw: summary.referring_domains,
    },
    {
      label: "Share that passes credit",
      value: dofollowShare === null ? "—" : `${dofollowShare.toFixed(1)}%`,
      detail:
        dofollow !== null || nofollow !== null
          ? `${compactNumber(dofollow)} help your rankings (dofollow) / ${compactNumber(nofollow)} do not (nofollow)`
          : "Links that help your rankings, as a share of all links",
      raw: dofollowShare === null ? null : Math.round(dofollowShare * 10) / 10,
      explainer:
        "Some sites mark their links so search engines ignore them. A healthy profile has plenty that are not marked.",
    },
    {
      label: "New links",
      value: compactNumber(summary.new_backlinks),
      raw: summary.new_backlinks,
      tone: (summary.new_backlinks ?? 0) > 0 ? "good" : "default",
      href: lensHref("new"),
    },
    {
      label: "Lost links",
      value: compactNumber(summary.lost_backlinks),
      raw: summary.lost_backlinks,
      tone: (summary.lost_backlinks ?? 0) > 0 ? "warning" : "default",
      href: lensHref("lost"),
    },
    {
      label: "Broken links",
      value: compactNumber(summary.broken_backlinks),
      raw: summary.broken_backlinks,
      tone: (summary.broken_backlinks ?? 0) > 0 ? "warning" : "default",
      href: lensHref("broken"),
    },
    {
      label: "Your site's authority",
      value:
        summary.rank_score === null ? "—" : String(summary.rank_score),
      detail: DOMAIN_RANK_EXPLAINER,
      raw: summary.rank_score,
      explainer: DOMAIN_RANK_EXPLAINER,
    },
    {
      label: "Spam signals",
      value:
        summary.spam_score === null ? "—" : String(summary.spam_score),
      detail: SPAM_SCORE_EXPLAINER,
      explainer: SPAM_SCORE_EXPLAINER,
      tone:
        tone === "toxic" ? "bad" : tone === "warn" ? "warning" : "default",
      raw: summary.spam_score,
    },
  ];

  return (
    <div data-surface-value="backlink_summary">
      <div className="grid grid-cols-2 rounded-md border border-border bg-card sm:grid-cols-4 xl:grid-cols-8">
        {tiles.map((tile) => (
          <MetricCell
            key={tile.label}
            variant="strip"
            label={tile.label}
            value={tile.value}
            detail={tile.detail}
            tone={tile.tone ?? "default"}
            href={tile.href}
            copy={{
              label: tile.label,
              human: () =>
                [
                  humanMetric(tile.label, tile.raw, siteDomain, tile.detail),
                  tile.explainer ?? "",
                ]
                  .filter(Boolean)
                  .join("\n"),
              agent: (): AgentPayloadInput => ({
                kind: "backlink-metric",
                location,
                description: `The "${tile.label}" backlink KPI for ${siteDomain}.`,
                data: {
                  metric: tile.label,
                  value: tile.raw,
                  detail: tile.detail ?? null,
                  explainer: tile.explainer ?? null,
                },
                summary: humanMetric(
                  tile.label,
                  tile.raw,
                  siteDomain,
                  tile.detail,
                ),
                attributes: { metric: tile.label },
              }),
            }}
          />
        ))}
      </div>
      {/* UTC date-only: observed_at is a whole day, and the local-tz
          formatter renders it a day early west of UTC. */}
      <p className="mt-1 text-right text-[11px] text-muted-foreground">
        Last checked {formatGscDate(summary.observed_at)}
      </p>
    </div>
  );
}
