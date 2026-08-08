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
  DOMAIN_RANK_EXPLAINER,
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
}

export function BacklinkKpiBand({
  summary,
  siteDomain,
  location,
}: {
  summary: BacklinkSnapshotRow | null | undefined;
  siteDomain: string;
  location: string;
}) {
  if (!summary) {
    return (
      <div className="rounded-md border border-dashed border-border bg-card/60 p-4">
        <p className="text-sm font-medium text-foreground">
          No backlink summary snapshot stored yet
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Run a Weekly core or Full bootstrap refresh to collect the first
          provider snapshot for {siteDomain}.
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
  const domainsDetail =
    extras.newReferringDomains !== null || extras.lostReferringDomains !== null
      ? `+${compactNumber(extras.newReferringDomains ?? 0)} new / −${compactNumber(extras.lostReferringDomains ?? 0)} lost domains`
      : undefined;
  const tone = spamTone(summary.spam_score);

  const tiles: KpiTile[] = [
    {
      label: "Total backlinks",
      value: compactNumber(summary.total_backlinks),
      raw: summary.total_backlinks,
    },
    {
      label: "Referring domains",
      value: compactNumber(summary.referring_domains),
      detail: domainsDetail,
      raw: summary.referring_domains,
    },
    {
      label: "Dofollow share",
      value: dofollowShare === null ? "—" : `${dofollowShare.toFixed(1)}%`,
      detail:
        dofollow !== null || nofollow !== null
          ? `${compactNumber(dofollow)} dofollow / ${compactNumber(nofollow)} nofollow`
          : undefined,
      raw: dofollowShare === null ? null : Math.round(dofollowShare * 10) / 10,
    },
    {
      label: "New links",
      value: compactNumber(summary.new_backlinks),
      raw: summary.new_backlinks,
      tone: (summary.new_backlinks ?? 0) > 0 ? "good" : "default",
    },
    {
      label: "Lost links",
      value: compactNumber(summary.lost_backlinks),
      raw: summary.lost_backlinks,
      tone: (summary.lost_backlinks ?? 0) > 0 ? "warning" : "default",
    },
    {
      label: "Broken links",
      value: compactNumber(summary.broken_backlinks),
      raw: summary.broken_backlinks,
      tone: (summary.broken_backlinks ?? 0) > 0 ? "warning" : "default",
    },
    {
      label: "Rank",
      value:
        summary.rank_score === null ? "—" : String(summary.rank_score),
      detail: DOMAIN_RANK_EXPLAINER,
      raw: summary.rank_score,
      explainer: DOMAIN_RANK_EXPLAINER,
    },
    {
      label: "Spam score",
      value:
        summary.spam_score === null ? "—" : String(summary.spam_score),
      detail: "Provider spam signal, 0–100",
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
      {/* UTC date-only: observed_at is a provider snapshot day, and the
          local-tz formatter renders it a day early west of UTC. */}
      <p className="mt-1 text-right text-[11px] text-muted-foreground">
        Snapshot collected {formatGscDate(summary.observed_at)}
      </p>
    </div>
  );
}
