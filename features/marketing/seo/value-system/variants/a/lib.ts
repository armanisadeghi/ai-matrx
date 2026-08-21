/**
 * Value Workbench A — pure helpers. No data access here; data.ts owns that.
 * Band tones are assigned from the site's own vocabulary ORDER (meaning is
 * local — we never hardcode band slugs beyond the two reserved ones).
 */

import type { ValueBandDef, ValueReason } from "../../types";

export const RESERVED_NEGATIVE = "negative";
export const RESERVED_UNVALUED = "unvalued";

// ── Date window ──────────────────────────────────────────────────────────────

export interface DateWindow {
  start: string;
  end: string;
  cmpStart: string;
  cmpEnd: string;
  label: string;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Last 28 full days of GSC data (ending 3 days ago — GSC lags), compared to
 *  the 28 days before that. */
export function defaultWindow(now = new Date()): DateWindow {
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() - 3);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);
  const cmpEnd = new Date(start);
  cmpEnd.setUTCDate(cmpEnd.getUTCDate() - 1);
  const cmpStart = new Date(cmpEnd);
  cmpStart.setUTCDate(cmpStart.getUTCDate() - 27);
  return {
    start: iso(start),
    end: iso(end),
    cmpStart: iso(cmpStart),
    cmpEnd: iso(cmpEnd),
    label: "Last 28 days vs the 28 before",
  };
}

// ── Numbers ──────────────────────────────────────────────────────────────────

const compact = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});
const plain = new Intl.NumberFormat();

export function fmtNum(n: number): string {
  return n >= 10_000 ? compact.format(n) : plain.format(n);
}

export interface Delta {
  text: string;
  dir: "up" | "down" | "flat" | "new";
}

export function delta(current: number, previous: number): Delta {
  if (previous === 0) {
    return current === 0
      ? { text: "—", dir: "flat" }
      : { text: "new", dir: "new" };
  }
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) return { text: "±0%", dir: "flat" };
  const rounded = Math.abs(pct) >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10;
  return {
    text: `${pct > 0 ? "+" : ""}${rounded}%`,
    dir: pct > 0 ? "up" : "down",
  };
}

export function fmtScore(score: number | null): string {
  if (score === null || !Number.isFinite(score)) return "—";
  return Math.abs(score) >= 100
    ? String(Math.round(score))
    : String(Math.round(score * 10) / 10);
}

// ── Band tones (semantic tokens only; assigned by vocabulary order) ─────────

export interface BandTone {
  dot: string;
  bar: string;
  chip: string;
}

const PALETTE: BandTone[] = [
  {
    dot: "bg-chart-1",
    bar: "bg-chart-1",
    chip: "border-chart-1/40 bg-chart-1/10 text-foreground",
  },
  {
    dot: "bg-chart-2",
    bar: "bg-chart-2",
    chip: "border-chart-2/40 bg-chart-2/10 text-foreground",
  },
  {
    dot: "bg-chart-4",
    bar: "bg-chart-4",
    chip: "border-chart-4/40 bg-chart-4/10 text-foreground",
  },
  {
    dot: "bg-chart-5",
    bar: "bg-chart-5",
    chip: "border-chart-5/40 bg-chart-5/10 text-foreground",
  },
  {
    dot: "bg-chart-3",
    bar: "bg-chart-3",
    chip: "border-chart-3/40 bg-chart-3/10 text-foreground",
  },
  {
    dot: "bg-chart-6",
    bar: "bg-chart-6",
    chip: "border-chart-6/40 bg-chart-6/10 text-foreground",
  },
];

const NEGATIVE_TONE: BandTone = {
  dot: "bg-destructive",
  bar: "bg-destructive",
  chip: "border-destructive/40 bg-destructive/10 text-destructive",
};

const UNVALUED_TONE: BandTone = {
  dot: "bg-muted-foreground/50",
  bar: "bg-muted-foreground/30",
  chip: "border-dashed border-border bg-muted/40 text-muted-foreground",
};

/** slug → tone + label, built from the effective vocabulary. */
export function buildBandIndex(vocab: ValueBandDef[]): Map<string, { label: string; tone: BandTone; sort: number }> {
  const map = new Map<string, { label: string; tone: BandTone; sort: number }>();
  let paletteIdx = 0;
  for (const band of [...vocab].sort((a, b) => a.sort - b.sort)) {
    if (band.value === RESERVED_UNVALUED) continue;
    const isNegative =
      band.value === RESERVED_NEGATIVE || band.config?.negative === true;
    map.set(band.value, {
      label: band.label,
      tone: isNegative ? NEGATIVE_TONE : PALETTE[paletteIdx % PALETTE.length],
      sort: band.sort,
    });
    if (!isNegative) paletteIdx += 1;
  }
  if (!map.has(RESERVED_NEGATIVE)) {
    map.set(RESERVED_NEGATIVE, { label: "Negative", tone: NEGATIVE_TONE, sort: 900 });
  }
  map.set(RESERVED_UNVALUED, { label: "Unvalued", tone: UNVALUED_TONE, sort: 999 });
  return map;
}

export function bandInfo(
  index: Map<string, { label: string; tone: BandTone; sort: number }>,
  slug: string,
): { label: string; tone: BandTone; sort: number } {
  return (
    index.get(slug) ?? {
      label: slug,
      tone: UNVALUED_TONE,
      sort: 500,
    }
  );
}

// ── Reasons — every tier carries its why ────────────────────────────────────

export function reasonText(r: ValueReason): string {
  switch (r.kind) {
    case "override":
      return "Your ruling";
    case "topic":
      return `${r.topic} · worth ${r.weight}${r.negative_guard ? " · blocked" : ""}`;
    case "default_base":
      return `Base worth ${r.weight}`;
    case "rule":
      return `${r.name} ×${r.multiplier}`;
    case "geo":
      return `${r.area}: ${r.band} ×${r.multiplier}`;
    default:
      return "";
  }
}

export function asReasons(value: unknown): ValueReason[] {
  return Array.isArray(value) ? (value as ValueReason[]) : [];
}
