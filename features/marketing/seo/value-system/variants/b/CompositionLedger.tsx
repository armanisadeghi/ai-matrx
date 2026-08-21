"use client";

/**
 * The composition ledger — the "site up 25% while Platinum fell 3%" hero.
 * A verdict sentence, one proportional composition bar of clicks by value
 * band, and a card per band with its own delta. Every band is a filter:
 * clicking it scopes the ruling desk below.
 */

import { ArrowDownRight, ArrowUpRight, Minus, Scale } from "lucide-react";
import type { ValueBandDef, ValueSummaryRow } from "../../types";
import {
  UNVALUED,
  aggregateByBand,
  bandColorClasses,
  bandLabel,
  compact,
  deltaLabel,
  orderBands,
  pctDelta,
  verdict,
  type BandTotals,
} from "./lib";

function DeltaBadge({ current, prior }: { current: number; prior: number }) {
  const d = pctDelta(current, prior);
  const label = deltaLabel(current, prior);
  const Icon = d === null || Math.abs(Math.round(d)) === 0 ? Minus : d > 0 ? ArrowUpRight : ArrowDownRight;
  const tone =
    d === null || Math.abs(Math.round(d)) === 0
      ? "text-muted-foreground"
      : d > 0
        ? "text-success"
        : "text-destructive";
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold ${tone}`}
      title={`${compact(current)} clicks now vs ${compact(prior)} in the 28 days before`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

export function CompositionLedger({
  rows,
  vocab,
  vocabIsTemplate,
  activeBand,
  onSelectBand,
}: {
  rows: ValueSummaryRow[];
  vocab: ValueBandDef[];
  vocabIsTemplate: boolean;
  activeBand: string | null;
  onSelectBand: (band: string | null) => void;
}) {
  const totals = orderBands(aggregateByBand(rows), vocab);
  const totalClicks = totals.reduce((n, t) => n + t.clicks, 0);
  const totalCmp = totals.reduce((n, t) => n + t.cmpClicks, 0);
  const totalQueries = totals.reduce((n, t) => n + t.queries, 0);
  const story = verdict(totals, vocab);

  if (totals.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center">
        <Scale className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium text-foreground">
          No search traffic recorded in the last 28 days
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Once Google Search Console reports clicks for this site, this ledger
          shows what that traffic is worth — band by band.
        </p>
      </div>
    );
  }

  return (
    <section aria-label="Value composition">
      {/* The verdict */}
      {story && (
        <div className="mb-4">
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {story.headline}{" "}
            {totalCmp > 0 && (
              <span className="whitespace-nowrap align-middle">
                <DeltaBadge current={totalClicks} prior={totalCmp} />
              </span>
            )}
          </h2>
          {story.detail && (
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground sm:text-base">
              {story.detail}
            </p>
          )}
        </div>
      )}

      {/* The composition bar */}
      <div
        className="flex h-4 w-full overflow-hidden rounded-full border border-border bg-muted"
        role="img"
        aria-label="Share of clicks by value band"
      >
        {totals
          .filter((t) => t.clicks > 0)
          .map((t) => {
            const color = bandColorClasses(t.band, vocab);
            const share = (t.clicks / Math.max(totalClicks, 1)) * 100;
            return (
              <button
                key={t.band}
                type="button"
                onClick={() => onSelectBand(activeBand === t.band ? null : t.band)}
                title={`${bandLabel(t.band, vocab)} — ${compact(t.clicks)} clicks (${Math.round(share)}% of the site)`}
                style={{ width: `${Math.max(share, 1.5)}%` }}
                className={`${color.swatch} transition-opacity first:rounded-l-full last:rounded-r-full hover:opacity-80 ${
                  activeBand && activeBand !== t.band ? "opacity-30" : ""
                }`}
              />
            );
          })}
      </div>

      {/* Band cards */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {totals.map((t: BandTotals) => {
          const color = bandColorClasses(t.band, vocab);
          const isUnvalued = t.band === UNVALUED;
          const active = activeBand === t.band;
          const share =
            totalClicks > 0 ? Math.round((t.clicks / totalClicks) * 100) : 0;
          return (
            <button
              key={t.band}
              type="button"
              onClick={() => onSelectBand(active ? null : t.band)}
              className={`group rounded-lg border p-2.5 text-left transition-colors ${
                active
                  ? "border-primary bg-primary/5"
                  : isUnvalued
                    ? "border-dashed border-border bg-muted/40 hover:border-primary/40"
                    : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${color.swatch}`} />
                <span className="truncate text-xs font-semibold text-foreground">
                  {bandLabel(t.band, vocab)}
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline justify-between gap-1">
                <span
                  className="text-lg font-semibold tabular-nums text-foreground"
                  title={`${t.clicks.toLocaleString()} clicks — ${share}% of all clicks this period`}
                >
                  {compact(t.clicks)}
                </span>
                <DeltaBadge current={t.clicks} prior={t.cmpClicks} />
              </div>
              <p
                className="mt-0.5 truncate text-[11px] text-muted-foreground"
                title={`${t.queries.toLocaleString()} of the ${totalQueries.toLocaleString()} keywords Google showed this site for`}
              >
                {compact(t.queries)} keyword{t.queries === 1 ? "" : "s"}
                {t.overrideQueries > 0 && ` · ${compact(t.overrideQueries)} ruled by you`}
              </p>
            </button>
          );
        })}
      </div>

      {vocabIsTemplate && (
        <p className="mt-2 text-xs text-muted-foreground">
          These value bands are the platform&apos;s starter set — this site hasn&apos;t
          named its own yet. Rename or reshape them any time; your rulings carry over.
        </p>
      )}
    </section>
  );
}
