"use client";

import { useMemo } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Search,
  Globe,
  FileText,
  Brain,
  Layers,
  ArrowRight,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type {
  ResearchProgress,
  ScrapeStatus,
  TopicCostSummary,
} from "../../../types";
import {
  useResearchSources,
  useResearchMedia,
} from "../../../hooks/useResearchState";
import {
  ResultsHeroMetrics,
  buildHeroMetrics,
} from "../../results/ResultsHeroMetrics";
import { TopSourcesGrid } from "../../results/TopSourcesGrid";
import { ResultsMediaBand } from "../../results/ResultsMediaBand";

interface Props {
  topicId: string;
  progress: ResearchProgress | null;
  costSummary: TopicCostSummary | null | undefined;
  /** ISO date string of the last completed run, if known. */
  finishedAt?: string | null;
  /** When set, this is the receipt for the just-completed run; otherwise it's a cold-load summary. */
  variant?: "fresh" | "cold";
}

function relativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ── Page-count precision ──────────────────────────────────────────────────
//
// "Pages read" = pages we successfully scraped + stored (`total_content`).
// "Pages attempted" = sources we actually tried to scrape, i.e. everything
// that left the `pending` state with a terminal scrape verdict. We compute
// attempted from `sources_by_status` so the two numbers are honest and never
// fabricated; if the breakdown is empty we simply omit the "/ attempted" half.
//
// `pending` is the only NON-attempt status (queued, never tried). Every other
// terminal verdict — success, thin, failed, dead_link, gated, skipped,
// complete, manual, ignored, content_mismatch — counts as an attempt.
const NON_ATTEMPT_STATUSES: ReadonlySet<ScrapeStatus> = new Set(["pending"]);

function pagesAttempted(
  byStatus: Record<ScrapeStatus, number> | undefined,
): number | null {
  if (!byStatus) return null;
  let attempted = 0;
  let sawAny = false;
  for (const [status, count] of Object.entries(byStatus) as [
    ScrapeStatus,
    number,
  ][]) {
    const n = count ?? 0;
    if (n > 0) sawAny = true;
    if (!NON_ATTEMPT_STATUSES.has(status)) attempted += n;
  }
  return sawAny ? attempted : null;
}

interface LineProps {
  icon: typeof Search;
  label: string;
  value: string | number;
  href?: string;
  warning?: string;
  /** When true, render dimmed (no progress on this line). */
  dim?: boolean;
}

function Line({ icon: Icon, label, value, href, warning, dim }: LineProps) {
  const content = (
    <div
      className={cn(
        "group flex items-center gap-2 px-2 py-1.5 rounded-md",
        href && "hover:bg-accent/40 transition-colors",
        dim && "opacity-60",
      )}
    >
      <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
      <span className="text-[11px] text-muted-foreground flex-1 truncate">
        {label}
      </span>
      {warning && (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
          <AlertTriangle className="h-2.5 w-2.5" />
          {warning}
        </span>
      )}
      <span className="text-xs font-semibold tabular-nums">{value}</span>
      {href && (
        <ArrowRight className="h-3 w-3 text-muted-foreground/50 group-hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }
  return content;
}

/**
 * Persistent "here's everything we found + how good it is" view for the topic.
 *
 * This is the cold-load / between-runs surface rendered by `PipelineOrchestra`
 * (when no run is live). It used to be a tidy pipeline receipt only; it now
 * ALSO carries the results showcase — cleaned metric tiles, the highest-
 * authority Top Sources, and the rich-media band — so the Topic page is the
 * single place a user sees what the research produced. Everything reads from
 * the same DB-backed hooks the standalone Results page used
 * (`useResearchSources`, `useResearchMedia`, the topic `progress`, and the
 * authoritative `costSummary`), so a refresh renders an identical view — it is
 * never lost.
 *
 *  - `variant="fresh"` is shown immediately after a stream completes (slight
 *    celebratory tint).
 *  - `variant="cold"` is shown on a fresh page load when prior work exists.
 */
export function LastRunSummary({
  topicId,
  progress,
  costSummary,
  finishedAt,
  variant = "cold",
}: Props) {
  const base = `/research/topics/${topicId}`;
  const when = relativeTime(finishedAt);

  // Showcase data — same hooks the standalone Results page consumed, so the
  // band survives a cold refresh. A generous source limit so the ranking /
  // grid see the full set; both components filter to included + scored rows.
  const { data: sources } = useResearchSources(topicId, {
    limit: 500,
    offset: 0,
  });
  const { data: media } = useResearchMedia(topicId);

  // Compose status line at the top: green check if fully done, amber if partial.
  const hasReport = (progress?.project_syntheses ?? 0) > 0;
  const failures =
    (progress?.failed_analyses ?? 0) +
    (progress?.failed_keyword_syntheses ?? 0) +
    (progress?.failed_project_syntheses ?? 0);

  // Pages read (succeeded) vs attempted — integers only, honestly labelled.
  const pagesRead = progress?.total_content ?? 0;
  const attempted = pagesAttempted(progress?.sources_by_status);

  // Hero metric tiles — cost-free, integer chars, single tidy row. Reuses the
  // exact builder the Results page used so the numbers + styling stay in lock-
  // step. "Reports" counts every analysis report the run produced (keyword +
  // project syntheses + document versions).
  const metrics = useMemo(() => {
    const inputTokens = costSummary?.total_input_tokens ?? 0;
    const outputTokens = costSummary?.total_output_tokens ?? 0;
    const reports =
      (progress?.keyword_syntheses ?? 0) +
      (progress?.project_syntheses ?? 0) +
      (progress?.total_documents ?? 0);
    return buildHeroMetrics({
      sources: progress?.total_sources ?? sources?.length ?? 0,
      includedSources: progress?.included_sources ?? 0,
      pagesRead,
      // "Characters processed" — derived from the tokens the models consumed
      // and produced (~4 chars / token). Honest proxy, large & impressive.
      characters: (inputTokens + outputTokens) * 4,
      analyses: progress?.total_analyses ?? 0,
      reports,
      totalCostUsd: costSummary?.total_estimated_cost_usd ?? 0,
      llmCalls: costSummary?.total_llm_calls ?? 0,
    });
  }, [progress, sources, costSummary, pagesRead]);

  const hasRankedSources = useMemo(() => {
    if (!sources) return false;
    return sources.some(
      (s) => (s.is_included ?? false) && s.authority_score != null,
    );
  }, [sources]);

  return (
    <div className="space-y-3">
      {/* ── Tidy pipeline receipt (the scannable "latest results" summary) ── */}
      <div
        className={cn(
          "rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm overflow-hidden",
          variant === "fresh" && "ring-1 ring-emerald-500/30",
        )}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-muted/20">
          {failures > 0 ? (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          ) : hasReport ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className="text-xs font-semibold">
            {variant === "fresh"
              ? "Run complete"
              : hasReport
                ? "Latest results"
                : "Work in progress"}
          </span>
          {when && (
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-2.5 w-2.5" />
              {when}
            </span>
          )}
        </div>

        <div className="p-1 space-y-px">
          <Line
            icon={Search}
            label="Keywords"
            value={progress?.total_keywords ?? 0}
            href={`${base}/keywords`}
            dim={(progress?.total_keywords ?? 0) === 0}
          />
          <Line
            icon={Globe}
            label="Sources discovered"
            value={`${progress?.included_sources ?? 0} / ${progress?.total_sources ?? 0}`}
            href={`${base}/sources`}
            dim={(progress?.total_sources ?? 0) === 0}
          />
          <Line
            icon={FileText}
            label="Pages read"
            value={attempted != null ? `${pagesRead} / ${attempted}` : pagesRead}
            href={`${base}/content`}
            dim={pagesRead === 0}
          />
          <Line
            icon={Brain}
            label="Pages analyzed"
            value={`${progress?.total_analyses ?? 0} / ${progress?.total_eligible_for_analysis ?? 0}`}
            href={`${base}/analysis`}
            warning={
              (progress?.failed_analyses ?? 0) > 0
                ? `${progress?.failed_analyses} failed`
                : undefined
            }
            dim={(progress?.total_analyses ?? 0) === 0}
          />
          <Line
            icon={Layers}
            label="Keyword syntheses"
            value={`${progress?.keyword_syntheses ?? 0} / ${progress?.total_keywords ?? 0}`}
            href={`${base}/synthesis`}
            warning={
              (progress?.failed_keyword_syntheses ?? 0) > 0
                ? `${progress?.failed_keyword_syntheses} failed`
                : undefined
            }
            dim={(progress?.keyword_syntheses ?? 0) === 0}
          />
          <Line
            icon={FileText}
            label="Project report"
            value={hasReport ? "Generated" : "Not yet"}
            href={hasReport ? `${base}/synthesis` : undefined}
            dim={!hasReport}
          />
        </div>
      </div>

      {/* ── Results showcase — folded in from the retired /results page ──── */}
      <ResultsHeroMetrics metrics={metrics} />

      {hasRankedSources && sources && (
        <TopSourcesGrid sources={sources} topicId={topicId} />
      )}

      {media && <ResultsMediaBand media={media} topicId={topicId} />}
    </div>
  );
}
