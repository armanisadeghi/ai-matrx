"use client";

/**
 * THE LIVE MATCH PREVIEW — what a proposed rule or geo area actually DOES,
 * measured against this site's real Search Console keywords before anything is
 * saved.
 *
 * Arman's law: "logical things that are wrong are the worst types of things."
 * A multiplier saved blind is exactly that — it reads as reasoning and is not.
 * So this panel is not decoration beside the form; it IS the form's answer, and
 * the save button says how many keywords move.
 *
 * Every number here came from the server (`seo.gsc_value_rule_preview` /
 * `seo.gsc_geo_area_preview`). Nothing on this screen re-derives a band —
 * value-system.md, law 3.
 */

import { ArrowRight, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { formatCount } from "@/features/marketing/search-console/types";
import { bandMetaFor, type BandMeta } from "../lib";
import type { RuleImpact } from "./types";

function BandChip({ band, metas }: { band: string; metas: BandMeta[] }) {
  const meta = bandMetaFor(metas, band);
  return (
    <span
      className={cn(
        "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium",
        meta.chip,
      )}
    >
      {meta.label}
    </span>
  );
}

function Figure({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-2.5 py-1.5">
      <p className={cn("text-sm font-semibold tabular-nums", tone ?? "text-foreground")}>
        {value}
      </p>
      <p className="text-[10px] leading-4 text-muted-foreground">{label}</p>
    </div>
  );
}

export function ImpactPanel({
  impact,
  isPending,
  isFetching,
  error,
  onRetry,
  bandMetas,
  incomplete,
  windowLabel,
  nothingMatchedHint,
}: {
  impact: RuleImpact | undefined;
  isPending: boolean;
  isFetching: boolean;
  error: unknown;
  onRetry: () => void;
  bandMetas: BandMeta[];
  /** Plain-language reason there is nothing to measure yet, if any. */
  incomplete: string | null;
  windowLabel: string;
  /**
   * What to try when nothing matched. The default advice is about spelling and
   * match kinds, which is right for a word somebody typed and wrong for a place
   * picked from the gazetteer — that name is not misspelled, the keywords simply
   * have not been read for it yet.
   */
  nothingMatchedHint?: string;
}) {
  if (incomplete) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-6 text-center">
        <p className="text-[11px] text-muted-foreground">{incomplete}</p>
      </div>
    );
  }

  if (error) {
    return (
      <InlineQueryError
        what="the live match preview"
        error={error}
        onRetry={onRetry}
      />
    );
  }

  if (isPending || !impact) {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Skeleton className="h-11 rounded-md" />
          <Skeleton className="h-11 rounded-md" />
          <Skeleton className="h-11 rounded-md" />
          <Skeleton className="h-11 rounded-md" />
        </div>
        <Skeleton className="h-24 rounded-md" />
      </div>
    );
  }

  const nothingMatched = impact.matched_keywords === 0;

  return (
    <div className={cn("space-y-2.5", isFetching && "opacity-70")}>
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        {isFetching ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        ) : null}
        Measured against {formatCount(impact.window_keywords)} keywords with
        Search Console traffic in {windowLabel}.
      </div>

      {nothingMatched ? (
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
          <p className="text-[11px] leading-4 text-warning">
            This matches <strong>none</strong> of your keywords, so saving it
            would change nothing.{" "}
            {nothingMatchedHint ??
              "Check the spelling, or try “contains anywhere” instead of a whole-word match."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Figure
              value={formatCount(impact.matched_keywords)}
              label="keywords get this stamp"
            />
            <Figure
              value={formatCount(impact.moved_keywords)}
              label="change value band"
              tone={impact.moved_keywords > 0 ? "text-primary" : "text-muted-foreground"}
            />
            <Figure value={formatCount(impact.matched_clicks)} label="clicks affected" />
            <Figure
              value={formatCount(impact.matched_impressions)}
              label="impressions affected"
            />
          </div>

          {(impact.stamped_only_keywords ?? 0) > 0 ? (
            <p className="rounded-md border border-dashed border-border bg-muted/30 px-2.5 py-2 text-[11px] leading-4 text-muted-foreground">
              <strong className="text-foreground">
                {formatCount(impact.stamped_only_keywords)}
              </strong>{" "}
              of the matched keywords have no topic worth yet, so they receive
              the stamp (you can filter and group by it) but their value band
              does not move — a stamp never invents value. Place them on the
              topic tree and the stamp starts counting.
            </p>
          ) : null}
          {impact.moved_keywords === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground">
              {(impact.stamped_only_keywords ?? 0) > 0
                ? "No value band changes on save — only stamps."
                : "It matches keywords, but none of them change band — they are already where this rule would put them (often already at the top or bottom of the scale)."}
            </p>
          ) : (
            <ul className="space-y-1">
              {impact.movements.map((movement) => (
                <li
                  key={`${movement.from_band}->${movement.to_band}`}
                  className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px]"
                >
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatCount(movement.keywords)}
                  </span>
                  <BandChip band={movement.from_band} metas={bandMetas} />
                  <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                  <BandChip band={movement.to_band} metas={bandMetas} />
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {formatCount(movement.clicks)} clicks ·{" "}
                    {formatCount(movement.impressions)} impressions
                  </span>
                </li>
              ))}
            </ul>
          )}

          {impact.protected_keywords > 0 ? (
            <p className="flex items-start gap-1.5 text-[10px] leading-4 text-muted-foreground">
              <ShieldCheck className="mt-px h-3 w-3 shrink-0 text-success" aria-hidden />
              {formatCount(impact.protected_keywords)} matched{" "}
              {impact.protected_keywords === 1 ? "keyword is" : "keywords are"}{" "}
              already ruled by a person. Your ruling always wins — arithmetic
              never moves them.
            </p>
          ) : null}

          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Real keywords this matches
            </p>
            <ul className="space-y-1">
              {impact.samples.map((sample) => (
                <li
                  key={sample.keyword_id}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border bg-card px-2.5 py-1.5"
                >
                  <span
                    className="min-w-0 flex-1 basis-full break-words text-[11px] text-foreground sm:basis-auto"
                    title={sample.keyword}
                  >
                    {sample.keyword}
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    {formatCount(sample.clicks)}c ·{" "}
                    {formatCount(sample.impressions)}i
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <BandChip band={sample.from_band} metas={bandMetas} />
                    {sample.to_band === sample.from_band ? null : (
                      <>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden />
                        <BandChip band={sample.to_band} metas={bandMetas} />
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
