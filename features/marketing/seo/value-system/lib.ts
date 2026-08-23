/**
 * Keyword Value System — the ONE shared helper module.
 *
 * Pure functions only: the review window, band metadata (site vocabulary +
 * the two reserved resolver slugs), tone assignment from OUR semantic
 * tokens, compare-delta math, and the verdict sentence. Never re-derives a
 * band or a score — that is the resolver's job (value-system.md, law 3).
 *
 * Lived at `variants/c/lib.ts` during the 2026-08-21 bake-off. The workbench,
 * the rules bench and the topic tree all imported it across a directory named
 * for a losing seat, so on 2026-08-22 it moved here when the four variants
 * converged into one workbench. Everything under this feature imports from
 * `../lib` (or `./lib`); nothing imports from a variant, because there are
 * none.
 */

import type { ValueBandDef, ValueSummaryRow } from "./types";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import type { PackProvenance, SiteGeoArea } from "./types";

// ── Service areas that were never told what they stand for ───────────────────

/**
 * An area with a name, a band, and NO place names matches nothing — the
 * single most misleading state in this feature, because the ledger that lists
 * it looks configured. Starter-pack adoption is where they come from (a pack
 * deliberately carries archetypes, never somebody else's cities), so both the
 * packs screen and the workbench ask this same question of the same rows.
 */
export function areaNeedsPlaces(
  area: Pick<SiteGeoArea, "match_tokens" | "place_ids">,
): boolean {
  return (
    (area.match_tokens?.length ?? 0) === 0 && (area.place_ids?.length ?? 0) === 0
  );
}

/** The rule + geo bench, opened on exactly the areas that have no places. */
export const INCOMPLETE_AREAS_QUERY = "areas=incomplete";

export function incompleteAreasHref(
  brandId: string | null | undefined,
  siteId: string,
): string {
  return marketingRoutes.site(brandId, siteId, `/value/rules?${INCOMPLETE_AREAS_QUERY}`);
}

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

// ── The verdict sentence ─────────────────────────────────────────────────────

/**
 * GRAFTED FROM VARIANT B (the "Value Ledger" seat, 2026-08-21) — the single
 * best idea the bake-off produced, and the headline this whole feature exists
 * to print.
 *
 * A totals row can hold perfectly still while the traffic underneath it moves:
 * the site is flat, and its best-value band is up 160%. Averages hide exactly
 * the thing the expert is paying us to see. So the page opens by naming the
 * band whose direction diverges MOST from the site's own, in composed English:
 *
 *   "Search traffic held steady over the last 28 days. But look closer:
 *    Platinum traffic is up 160% — the totals don't tell that story."
 *
 * When nothing diverges, it says nothing rather than manufacturing drama —
 * `detail` comes back empty and the caller renders only the headline.
 */
export interface Verdict {
  headline: string;
  detail: string;
  /** The band the detail sentence is about, so the caller can filter to it. */
  contrastBand: string | null;
}

/** Divergence below this reads as noise, not a story. */
const VERDICT_DIVERGENCE_FLOOR = 5;

export function buildVerdict(
  rows: ValueSummaryRow[],
  metas: BandMeta[],
): Verdict | null {
  const byBand = aggregateSummary(rows);
  let siteClicks = 0;
  let siteCompare = 0;
  for (const totals of byBand.values()) {
    siteClicks += totals.clicks;
    siteCompare += totals.cmpClicks;
  }
  if (siteClicks === 0 && siteCompare === 0) return null;

  const siteDelta = computeDelta(siteClicks, siteCompare);
  const sitePct = siteDelta.pct ?? 0;
  const siteMove =
    siteDelta.dir === "new"
      ? "has its first recorded clicks"
      : siteDelta.dir === "none"
        ? "recorded nothing"
        : Math.abs(Math.round(sitePct)) === 0
          ? "held steady"
          : `is ${sitePct > 0 ? "up" : "down"} ${Math.abs(Math.round(sitePct))}%`;

  let contrast: { band: string; pct: number; divergence: number } | null = null;
  let valuedBands = 0;
  for (const [band, totals] of byBand) {
    if (band === "unvalued") continue;
    if (totals.clicks === 0 && totals.cmpClicks === 0) continue;
    valuedBands += 1;
    const delta = computeDelta(totals.clicks, totals.cmpClicks);
    if (delta.pct === null) continue;
    const divergence = Math.abs(delta.pct - sitePct);
    if (!contrast || divergence > contrast.divergence) {
      contrast = { band, pct: delta.pct, divergence };
    }
  }

  const headline = `Search traffic ${siteMove} over the last 28 days.`;
  let detail = "";
  let contrastBand: string | null = null;
  if (contrast && contrast.divergence >= VERDICT_DIVERGENCE_FLOOR) {
    const label = bandMetaFor(metas, contrast.band).label;
    const dir = contrast.pct > 0 ? "up" : "down";
    detail = `But look closer: ${label} traffic is ${dir} ${Math.abs(Math.round(contrast.pct))}% — the totals don't tell that story.`;
    contrastBand = contrast.band;
  } else if (valuedBands === 0) {
    detail =
      "None of that traffic carries a value yet — the totals can't tell you what it's worth until you rule on it.";
  }
  return { headline, detail, contrastBand };
}

/** "Aug 1 – Aug 28" for a window, in the reader's locale. */
export function formatWindowLabel(window: ValueWindow): string {
  const fmt = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return `${fmt(window.start)} – ${fmt(window.end)}`;
}

// ── Provenance (where a site-plane row came from) ───────────────────────────
//
// Every row `adopt_starter_pack` writes carries `metadata.adopted_from_pack`;
// a row the site authored carries nothing. Whether an adopted row has since
// been CHANGED is a server question (`starter_pack_site_status` compares the
// site row with the pack's template) — never re-derived here.

export type RowOrigin = "pack" | "yours";

export function rowOrigin(meta: PackProvenance | null | undefined): RowOrigin {
  return meta?.adopted_from_pack ? "pack" : "yours";
}

/** The `?source=` filter the Rulebook understands: `pack:<slug>` · `yours` · `changed`. */
export const RULEBOOK_SOURCE_QUERY = "source";

export function rulebookSourceHref(
  brandId: string | null | undefined,
  siteId: string,
  source: string,
): string {
  return `${marketingRoutes.site(brandId, siteId, "/value/rules")}?${RULEBOOK_SOURCE_QUERY}=${encodeURIComponent(source)}`;
}

/** `?pack=<id>&review=1` — the pack review screen on the Industry packs page. */
export function packReviewHref(
  brandId: string | null | undefined,
  siteId: string,
  packId: string,
): string {
  return `${marketingRoutes.site(brandId, siteId, "/value/packs")}?pack=${packId}&review=1`;
}

// ── Plain English for a rule's match condition ──────────────────────────────
// ONE sentence builder for every screen that names a value rule (Rulebook,
// pack review, workbench panel) — three screens used to carry three copies.

export function describeRuleMatch(rule: {
  pattern: string | null;
  match_kind: string | null;
  match_facet: string | null;
  match_facet_value: string | null;
}): string {
  if (rule.match_facet) {
    return `${humanizeSlug(rule.match_facet).toLowerCase()} is “${humanizeSlug(
      rule.match_facet_value ?? "",
    ).toLowerCase()}”`;
  }
  if (!rule.pattern) return "no match condition recorded";
  const kind = rule.match_kind ?? "contains";
  const readable =
    kind === "word"
      ? "the whole word"
      : kind === "exact"
        ? "exactly"
        : kind === "starts_with"
          ? "starts with"
          : kind === "ends_with"
            ? "ends with"
            : "contains";
  return `${readable} “${rule.pattern}”`;
}

/** "×0.2 — worth one fifth" / "×2.5 — worth two and a half times". */
export function describeMultiplier(multiplier: number | null | undefined): string {
  if (multiplier === null || multiplier === undefined) return "no change";
  if (multiplier === 1) return "×1 — no change";
  if (multiplier < 1) {
    const frac = Math.round(1 / multiplier);
    return frac >= 2 && Math.abs(1 / frac - multiplier) < 0.02
      ? `×${multiplier} — worth one ${ordinalFraction(frac)}`
      : `×${multiplier} — worth less`;
  }
  return `×${multiplier} — worth ${multiplier} times more`;
}

function ordinalFraction(n: number): string {
  const words: Record<number, string> = {
    2: "half",
    3: "third",
    4: "quarter",
    5: "fifth",
    6: "sixth",
    7: "seventh",
    8: "eighth",
    9: "ninth",
    10: "tenth",
    20: "twentieth",
  };
  return words[n] ?? `${n}th`;
}
