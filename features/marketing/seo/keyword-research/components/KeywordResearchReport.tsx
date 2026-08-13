/**
 * KeywordResearchReport — THE one rendering of a saved keyword-research
 * artifact, for every level of the sharing model:
 *
 *   owner    → the workbench feed (`variant="embedded"`)
 *   grantee  → `/shapes/instances/[id]` (signed in, `variant="page"`)
 *   anon     → `/s/[token]` share link (`variant="page"` + `acquisition`)
 *
 * That is the level-vs-lens proof: access LEVEL is decided by the grant, the
 * LENS is this component, and it is the same component in all three places.
 * Deliberately SSR-capable and data-free — callers pass the artifact and the
 * already-loaded keyword-plane rows, so the anonymous landing ships a real
 * server-rendered report (and a real social card) instead of a spinner.
 *
 * The clusters and the classification cards render through their REGISTERED
 * kind components (`KeywordResearchBlock` / `KeywordClassificationBatchBlock`)
 * — a shape has exactly one component, and neither is re-rendered by hand
 * here. What this file adds is presentation chrome (header, summary tiles,
 * the market table over `seo.keyword_market` rows, conversion CTA) built from
 * the shared `KeywordMetrics` primitives.
 */

import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

import KeywordClassificationBatchBlock from "@/components/mardown-display/blocks/keyword-research/KeywordClassificationBatchBlock";
import KeywordResearchBlock from "@/components/mardown-display/blocks/keyword-research/KeywordResearchBlock";
import {
  KeywordCompetitionBadge,
  KeywordIntentChip,
  KeywordTrendBadge,
  KeywordTrendSparkline,
  formatCpc,
  formatSearchVolume,
  monthlySearchTrend,
} from "@/features/marketing/seo/keyword-research/components/KeywordMetrics";
import {
  buildClassificationBlockData,
  buildMetricRows,
  buildResearchBlockData,
  summarizeKeywordReport,
  type KeywordReportRow,
} from "@/features/marketing/seo/keyword-research/data/report";
import type { KeywordResearchArtifact } from "@/types/python-generated/stream-events";

export interface KeywordResearchReportProps {
  artifact: KeywordResearchArtifact;
  /** Keyword-plane rows for the artifact's phrases (may be empty). */
  keywords: readonly KeywordReportRow[];
  /**
   * `page` = the full presentation report (header, tiles, market table).
   * `embedded` = clusters + classification only, for hosts that already own
   * the surrounding chrome (the workbench launcher feed).
   */
  variant?: "page" | "embedded";
  /** Conversion chrome for an anonymous recipient — the referral half. */
  acquisition?: boolean;
  /** When the artifact was saved (ISO) — rendered in the header meta line. */
  generatedAt?: string | null;
  /** Header-right slot: the owner's ShareButton, an "Open workbench" link… */
  actions?: ReactNode;
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export default function KeywordResearchReport({
  artifact,
  keywords,
  variant = "page",
  acquisition = false,
  generatedAt,
  actions,
}: KeywordResearchReportProps) {
  const researchData = buildResearchBlockData(artifact);
  const classificationData = buildClassificationBlockData(keywords);
  const metricRows = buildMetricRows(keywords);
  const summary = summarizeKeywordReport(artifact, metricRows);
  const measuredRows = metricRows.filter((row) => row.searchVolume !== null);

  const body = (
    <>
      {/* Clusters — the registered kind component, read-only wherever no
          surface publishes `keyword_selection`. */}
      <div id="keyword-clusters" className="scroll-mt-4">
        <KeywordResearchBlock serverData={researchData} />
      </div>

      {measuredRows.length > 0 && variant === "page" ? (
        <section className="rounded-xl border border-border bg-card">
          <header className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              Market data
            </h2>
            <p className="text-xs text-muted-foreground">
              {measuredRows.length} of {summary.keywordCount + 1} keywords have
              12-month search data
            </p>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Keyword</th>
                  <th className="px-3 py-2 font-medium">Intent</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Monthly searches
                  </th>
                  <th className="px-3 py-2 font-medium">12-month trend</th>
                  <th className="px-3 py-2 font-medium">Competition</th>
                  <th className="px-3 py-2 text-right font-medium">CPC</th>
                </tr>
              </thead>
              <tbody>
                {measuredRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="px-4 py-2 font-medium text-foreground">
                      {row.phrase}
                    </td>
                    <td className="px-3 py-2">
                      <KeywordIntentChip
                        intentClass={row.intentClass}
                        hideUnclassified
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {formatSearchVolume(row.searchVolume)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <KeywordTrendSparkline points={row.monthlySearches} />
                        <KeywordTrendBadge
                          percent={monthlySearchTrend(row.monthlySearches)}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <KeywordCompetitionBadge
                        competition={row.competition}
                        competitionIndex={row.competitionIndex}
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {formatCpc(row.cpc)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Intent classification — the registered kind component again. */}
      {classificationData.results.length > 0 ? (
        <KeywordClassificationBatchBlock serverData={classificationData} />
      ) : null}
    </>
  );

  if (variant === "embedded") {
    return <div className="space-y-3">{body}</div>;
  }

  return (
    <article className="mx-auto w-full max-w-5xl space-y-4">
      <header className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
              Keyword research
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">
              {artifact.primary_keyword}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {/* A count is a door: every keyword it counts is rendered below,
                  so the number jumps to them. (Per-keyword intelligence is a
                  signed-in surface — an anonymous recipient must never be sent
                  to a door that will not open for them.) */}
              <a
                href="#keyword-clusters"
                className="underline-offset-2 hover:text-foreground hover:underline"
              >
                {summary.keywordCount} related keywords
              </a>{" "}
              across {summary.clusterCount}{" "}
              {summary.clusterCount === 1 ? "cluster" : "clusters"}
              {generatedAt
                ? ` · researched ${new Date(generatedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}`
                : ""}
            </p>
          </div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Keywords mapped"
            value={summary.keywordCount.toLocaleString()}
          />
          <StatTile
            label="Clusters"
            value={summary.clusterCount.toLocaleString()}
          />
          <StatTile
            label="Monthly searches"
            value={
              summary.totalMonthlySearches === null
                ? "—"
                : formatSearchVolume(summary.totalMonthlySearches)
            }
            hint={
              summary.measuredCount
                ? `across ${summary.measuredCount} measured keywords`
                : "no market data fetched yet"
            }
          />
          <StatTile
            label="Highest CPC"
            value={summary.topCpc === null ? "—" : formatCpc(summary.topCpc)}
            hint={summary.topCpc === null ? undefined : "paid competition"}
          />
        </div>
      </header>

      {body}

      {acquisition ? (
        <section className="rounded-xl border border-primary/30 bg-primary/5 p-5 text-center">
          <Sparkles className="mx-auto h-5 w-5 text-primary" />
          <h2 className="mt-2 text-base font-semibold text-foreground">
            Research any keyword like this in minutes
          </h2>
          <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
            AI Matrx maps a keyword&apos;s parents, children, and semantic
            neighbours, then enriches every phrase with live search volume,
            competition, CPC, and buyer intent.
          </p>
          <Link
            href="/sign-up"
            className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Create your own research
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </section>
      ) : null}
    </article>
  );
}
