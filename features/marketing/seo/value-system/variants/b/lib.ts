/**
 * Value Ledger (variant B) — pure helpers. Date window, formatting, band
 * palette, and the plain-English phrasing for reason receipts. No data calls.
 */

import type { ValueBandDef, ValueReason, ValueSummaryRow } from "../../types";

// ── Date window ──────────────────────────────────────────────────────────────
// GSC facts lag ~3 days. Window = the last 28 fully-reported days; compare =
// the 28 days before that. Fixed on purpose: one honest period, no date-picker
// homework for a non-technical expert.

export interface LedgerWindow {
  start: string;
  end: string;
  compareStart: string;
  compareEnd: string;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function ledgerWindow(now = new Date()): LedgerWindow {
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() - 3);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);
  const compareEnd = new Date(start);
  compareEnd.setUTCDate(compareEnd.getUTCDate() - 1);
  const compareStart = new Date(compareEnd);
  compareStart.setUTCDate(compareStart.getUTCDate() - 27);
  return {
    start: iso(start),
    end: iso(end),
    compareStart: iso(compareStart),
    compareEnd: iso(compareEnd),
  };
}

export function windowLabel(w: LedgerWindow): string {
  const fmt = (s: string) =>
    new Date(`${s}T00:00:00Z`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return `${fmt(w.start)} – ${fmt(w.end)}`;
}

// ── Numbers ──────────────────────────────────────────────────────────────────

export function compact(n: number): string {
  return Intl.NumberFormat(undefined, {
    notation: n >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(n);
}

/** Delta vs a prior period. Returns null when the prior period had nothing. */
export function pctDelta(current: number, prior: number): number | null {
  if (prior <= 0) return null;
  return ((current - prior) / prior) * 100;
}

export function deltaLabel(current: number, prior: number): string {
  const d = pctDelta(current, prior);
  if (d === null) return current > 0 ? "new" : "—";
  const rounded = Math.round(d);
  if (rounded === 0) return "even";
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

// ── Band model ───────────────────────────────────────────────────────────────
// The resolver emits site vocabulary slugs plus the two reserved slugs. Order:
// vocabulary sort first, then negative, then unvalued last (it is the queue).

export const UNVALUED = "unvalued";
export const NEGATIVE = "negative";

export interface BandTotals {
  band: string;
  clicks: number;
  impressions: number;
  queries: number;
  cmpClicks: number;
  cmpImpressions: number;
  cmpQueries: number;
  overrideQueries: number;
}

export function aggregateByBand(rows: ValueSummaryRow[]): BandTotals[] {
  const map = new Map<string, BandTotals>();
  for (const r of rows) {
    const t = map.get(r.value_band) ?? {
      band: r.value_band,
      clicks: 0,
      impressions: 0,
      queries: 0,
      cmpClicks: 0,
      cmpImpressions: 0,
      cmpQueries: 0,
      overrideQueries: 0,
    };
    t.clicks += r.clicks;
    t.impressions += r.impressions;
    t.queries += r.queries;
    t.cmpClicks += r.cmp_clicks;
    t.cmpImpressions += r.cmp_impressions;
    t.cmpQueries += r.cmp_queries;
    if (r.value_source === "override") t.overrideQueries += r.queries;
    map.set(r.value_band, t);
  }
  return [...map.values()];
}

export function orderBands(
  totals: BandTotals[],
  vocab: ValueBandDef[],
): BandTotals[] {
  const rank = new Map<string, number>();
  vocab.forEach((b, i) => rank.set(b.value, i));
  const rankOf = (band: string) => {
    if (band === NEGATIVE) return 9_000 + (rank.get(band) ?? 0);
    if (band === UNVALUED) return 10_000;
    return rank.get(band) ?? 5_000;
  };
  return [...totals].sort((a, b) => rankOf(a.band) - rankOf(b.band));
}

export function bandLabel(band: string, vocab: ValueBandDef[]): string {
  const def = vocab.find((v) => v.value === band);
  if (def) return def.label;
  if (band === UNVALUED) return "Unvalued";
  if (band === NEGATIVE) return "Negative";
  return band;
}

/**
 * Semantic-token palette per band. Reserved slugs get status colors; the
 * site's own bands get the chart ramp by vocabulary order (best band first).
 */
export function bandColorClasses(
  band: string,
  vocab: ValueBandDef[],
): { swatch: string; chip: string } {
  if (band === UNVALUED)
    return {
      swatch: "bg-muted-foreground/30",
      chip: "bg-muted text-muted-foreground border-border",
    };
  if (band === NEGATIVE || vocab.find((v) => v.value === band)?.config?.negative)
    return {
      swatch: "bg-destructive/70",
      chip: "bg-destructive/10 text-destructive border-destructive/30",
    };
  const ordered = vocab.filter(
    (v) => v.value !== UNVALUED && v.value !== NEGATIVE && !v.config?.negative,
  );
  const idx = ordered.findIndex((v) => v.value === band);
  const ramp = [
    { swatch: "bg-chart-2", chip: "bg-chart-2/15 text-foreground border-chart-2/40" },
    { swatch: "bg-chart-1", chip: "bg-chart-1/15 text-foreground border-chart-1/40" },
    { swatch: "bg-chart-4", chip: "bg-chart-4/20 text-foreground border-chart-4/50" },
    { swatch: "bg-chart-5", chip: "bg-chart-5/20 text-foreground border-chart-5/50" },
    { swatch: "bg-chart-3", chip: "bg-chart-3/20 text-foreground border-chart-3/50" },
    { swatch: "bg-chart-6", chip: "bg-chart-6/20 text-foreground border-chart-6/50" },
  ];
  return ramp[idx >= 0 ? idx % ramp.length : ramp.length - 1];
}

// ── The verdict sentence ─────────────────────────────────────────────────────

export function verdict(
  totals: BandTotals[],
  vocab: ValueBandDef[],
): { headline: string; detail: string } | null {
  const site = totals.reduce(
    (acc, t) => ({ clicks: acc.clicks + t.clicks, cmp: acc.cmp + t.cmpClicks }),
    { clicks: 0, cmp: 0 },
  );
  if (site.clicks === 0 && site.cmp === 0) return null;
  const siteDelta = pctDelta(site.clicks, site.cmp);
  const siteMove =
    siteDelta === null
      ? "has its first recorded clicks"
      : Math.abs(Math.round(siteDelta)) === 0
        ? "held steady"
        : `is ${siteDelta > 0 ? "up" : "down"} ${Math.abs(Math.round(siteDelta))}%`;

  // The most interesting divergence: the valued band whose direction differs
  // most from the site's.
  const valued = totals.filter(
    (t) => t.band !== UNVALUED && (t.clicks > 0 || t.cmpClicks > 0),
  );
  let contrast: { band: string; delta: number } | null = null;
  for (const t of valued) {
    const d = pctDelta(t.clicks, t.cmpClicks);
    if (d === null) continue;
    const divergence = Math.abs(d - (siteDelta ?? 0));
    if (!contrast || divergence > Math.abs(contrast.delta - (siteDelta ?? 0)))
      contrast = { band: t.band, delta: d };
  }
  const headline = `Search traffic ${siteMove} over the last 28 days.`;
  let detail = "";
  if (contrast && Math.abs(contrast.delta - (siteDelta ?? 0)) >= 5) {
    const dir = contrast.delta > 0 ? "up" : "down";
    detail = `But look closer: ${bandLabel(contrast.band, vocab)} traffic is ${dir} ${Math.abs(Math.round(contrast.delta))}% — the totals don't tell that story.`;
  } else if (valued.length === 0) {
    detail =
      "None of that traffic has a value ruling yet — the totals can't tell you what it's worth until you do.";
  }
  return { headline, detail };
}

// ── Plain-English receipt lines ──────────────────────────────────────────────

export function reasonSentence(r: ValueReason): string {
  switch (r.kind) {
    case "override":
      return "You ruled this keyword yourself — your ruling beats all arithmetic.";
    case "topic":
      return r.negative_guard
        ? `It belongs to your topic “${r.topic}”, which you marked as not what you offer — that alone makes it Negative.`
        : `It belongs to your topic “${r.topic}”, which you rate ${r.weight} out of 100${r.root ? ` (${r.root.replace(/_/g, " ")} work)` : ""}.`;
    case "default_base":
      return `No topic worth applies, so it starts from a neutral base of ${r.weight}.`;
    case "rule":
      return `Your rule “${r.name}” ${r.multiplier > 1 ? "boosts" : r.multiplier < 1 ? "discounts" : "keeps"} it ×${r.multiplier}.`;
    case "geo":
      return `The searcher looks like ${r.area} — your “${r.band}” area — ×${r.multiplier}.`;
  }
}

export function reasonMath(r: ValueReason): string | null {
  switch (r.kind) {
    case "topic":
      return r.negative_guard ? "→ Negative" : `base ${r.weight}`;
    case "default_base":
      return `base ${r.weight}`;
    case "rule":
      return `× ${r.multiplier}`;
    case "geo":
      return `× ${r.multiplier}`;
    case "override":
      return null;
  }
}
