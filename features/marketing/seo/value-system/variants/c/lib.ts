/**
 * Keyword Value Workbench — variant C (ui-refine seat) shared helpers.
 *
 * Pure functions only: the review window, band metadata (site vocabulary +
 * the two reserved resolver slugs), tone assignment from OUR semantic
 * tokens, and compare-delta math. Never re-derives a band or score — that
 * is the resolver's job (value-system.md, law 3).
 */

import type { ValueBandDef, ValueSummaryRow } from "../../types";

// ── Review window ────────────────────────────────────────────────────────────

export interface ValueWindow {
  start: string;
  end: string;
  compareStart: string;
  compareEnd: string;
}

/** Freshest ~28 GSC days (GSC lags ~2 days), compared to the prior 28. */
export function reviewWindow(): ValueWindow {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 2);
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

// ── Band metadata ────────────────────────────────────────────────────────────

export interface BandMeta {
  value: string;
  label: string;
  description: string | null;
  /** Reserved resolver slugs get fixed semantics. */
  reserved: "negative" | "unvalued" | null;
  /** Text tone class for the band name. */
  tone: string;
  /** Chip classes (border + bg + text) for inline band chips. */
  chip: string;
  minScore: number | null;
  isTemplate: boolean;
}

const TONE_LADDER = [
  { tone: "text-success", chip: "border-success/40 bg-success/10 text-success" },
  { tone: "text-primary", chip: "border-primary/40 bg-primary/10 text-primary" },
  { tone: "text-info", chip: "border-info/40 bg-info/10 text-info" },
  { tone: "text-foreground", chip: "border-border bg-muted/50 text-foreground" },
  {
    tone: "text-muted-foreground",
    chip: "border-border bg-muted/40 text-muted-foreground",
  },
] as const;

const NEGATIVE_META = {
  tone: "text-destructive",
  chip: "border-destructive/40 bg-destructive/10 text-destructive",
};
const UNVALUED_META = {
  tone: "text-warning",
  chip: "border-warning/50 bg-warning/10 text-warning",
};

export function humanizeSlug(slug: string): string {
  const spaced = slug.replaceAll(/[_-]+/g, " ").trim();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : slug;
}

function isNegativeDef(def: ValueBandDef): boolean {
  return def.value === "negative" || def.config?.negative === true;
}

/**
 * The site's effective band vocabulary as render metadata, in vocabulary
 * order, with the two RESERVED resolver slugs guaranteed present and pinned
 * to the end (negative, then unvalued — the work queue always sits last).
 */
export function buildBandMeta(vocab: ValueBandDef[]): BandMeta[] {
  const ordered = [...vocab].sort((a, b) => a.sort - b.sort);
  const regular = ordered.filter(
    (def) => !isNegativeDef(def) && def.value !== "unvalued",
  );
  const metas: BandMeta[] = regular.map((def, index) => {
    const ladder = TONE_LADDER[Math.min(index, TONE_LADDER.length - 1)];
    const minScore = def.config?.min_score;
    return {
      value: def.value,
      label: def.label || humanizeSlug(def.value),
      description: def.description,
      reserved: null,
      tone: ladder.tone,
      chip: ladder.chip,
      minScore: typeof minScore === "number" ? minScore : null,
      isTemplate: def.is_template,
    };
  });

  const negativeDef = ordered.find(isNegativeDef);
  metas.push({
    value: negativeDef?.value ?? "negative",
    label: negativeDef?.label ?? "Negative",
    description:
      negativeDef?.description ??
      "Traffic your business does not want — excluded geo, not-offered services, actively avoided topics.",
    reserved: "negative",
    tone: NEGATIVE_META.tone,
    chip: NEGATIVE_META.chip,
    minScore: null,
    isTemplate: negativeDef?.is_template ?? true,
  });

  const unvaluedDef = ordered.find((def) => def.value === "unvalued");
  metas.push({
    value: "unvalued",
    label: unvaluedDef?.label ?? "Unvalued",
    description:
      unvaluedDef?.description ??
      "No meaning expressed yet — no topic worth reaches these keywords and no rule fires. The honest bucket, and the work queue.",
    reserved: "unvalued",
    tone: UNVALUED_META.tone,
    chip: UNVALUED_META.chip,
    minScore: null,
    isTemplate: unvaluedDef?.is_template ?? true,
  });

  return metas;
}

export function bandMetaFor(metas: BandMeta[], value: string): BandMeta {
  const found = metas.find((meta) => meta.value === value);
  if (found) return found;
  // A band the resolver emitted that the vocabulary no longer names — render
  // it honestly rather than hiding rows.
  return {
    value,
    label: humanizeSlug(value),
    description: null,
    reserved: null,
    tone: "text-foreground",
    chip: "border-border bg-muted/50 text-foreground",
    minScore: null,
    isTemplate: false,
  };
}

// ── Summary aggregation + deltas ─────────────────────────────────────────────

export interface BandTotals {
  clicks: number;
  impressions: number;
  queries: number;
  cmpClicks: number;
  cmpImpressions: number;
  cmpQueries: number;
  /** Queries in this band ruled explicitly by the expert. */
  overrideQueries: number;
}

export function aggregateSummary(
  rows: ValueSummaryRow[],
): Map<string, BandTotals> {
  const byBand = new Map<string, BandTotals>();
  for (const row of rows) {
    const entry = byBand.get(row.value_band) ?? {
      clicks: 0,
      impressions: 0,
      queries: 0,
      cmpClicks: 0,
      cmpImpressions: 0,
      cmpQueries: 0,
      overrideQueries: 0,
    };
    entry.clicks += row.clicks;
    entry.impressions += row.impressions;
    entry.queries += row.queries;
    entry.cmpClicks += row.cmp_clicks;
    entry.cmpImpressions += row.cmp_impressions;
    entry.cmpQueries += row.cmp_queries;
    if (row.value_source === "override") entry.overrideQueries += row.queries;
    byBand.set(row.value_band, entry);
  }
  return byBand;
}

export interface Delta {
  dir: "up" | "down" | "flat" | "new" | "none";
  /** Signed percentage, null for new/none. */
  pct: number | null;
}

export function computeDelta(current: number, compare: number): Delta {
  if (compare <= 0) {
    if (current <= 0) return { dir: "none", pct: null };
    return { dir: "new", pct: null };
  }
  const pct = ((current - compare) / compare) * 100;
  if (Math.abs(pct) < 0.05) return { dir: "flat", pct: 0 };
  return { dir: pct > 0 ? "up" : "down", pct };
}

export function formatPct(pct: number): string {
  const abs = Math.abs(pct);
  const digits = abs >= 100 ? 0 : 1;
  return `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${abs.toFixed(digits)}%`;
}

export function formatScore(score: number | null): string {
  if (score === null || score === undefined) return "—";
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}
