/**
 * Value Workbench D — presentation helpers only. Bands, scores, and sources
 * always come from the resolver (data.ts); nothing here re-derives meaning.
 */

import type { ValueBandDef, ValueReason } from "../../types";

// ── Date window ─────────────────────────────────────────────────────────────
// GSC facts trail real time by ~3 days; the window is the last 28 days of
// data with an equal prior window for compare.

export interface DateWindow {
  start: string;
  end: string;
  cmpStart: string;
  cmpEnd: string;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function last28DayWindow(now = new Date()): DateWindow {
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() - 3);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);
  const cmpEnd = new Date(start);
  cmpEnd.setUTCDate(cmpEnd.getUTCDate() - 1);
  const cmpStart = new Date(cmpEnd);
  cmpStart.setUTCDate(cmpStart.getUTCDate() - 27);
  return { start: iso(start), end: iso(end), cmpStart: iso(cmpStart), cmpEnd: iso(cmpEnd) };
}

export function windowLabel(w: DateWindow): string {
  const fmt = (s: string) =>
    new Date(`${s}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return `${fmt(w.start)} – ${fmt(w.end)}`;
}

// ── Numbers ─────────────────────────────────────────────────────────────────

const nf = new Intl.NumberFormat("en-US");
const nfCompact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function fmtInt(n: number): string {
  return nf.format(n);
}

/** Compact for big counts (12.4K) — full precision below 10,000. */
export function fmtCount(n: number): string {
  return n >= 10_000 ? nfCompact.format(n) : nf.format(n);
}

export function fmtScore(score: number | null): string {
  if (score === null || score === undefined) return "—";
  return (Math.round(score * 10) / 10).toString();
}

/**
 * Delta vs the compare window. `null` pct means "new" (nothing in the prior
 * window) — rendered as a word, never a fake percentage.
 */
export interface Delta {
  pct: number | null;
  direction: "up" | "down" | "flat" | "new" | "none";
}

export function computeDelta(current: number, previous: number): Delta {
  if (previous === 0 && current === 0) return { pct: null, direction: "none" };
  if (previous === 0) return { pct: null, direction: "new" };
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) return { pct, direction: "flat" };
  return { pct, direction: pct > 0 ? "up" : "down" };
}

export function fmtDeltaPct(d: Delta): string {
  if (d.direction === "new") return "new";
  if (d.direction === "none") return "–";
  if (d.pct === null) return "–";
  const rounded = Math.abs(d.pct) >= 100 ? Math.round(d.pct) : Math.round(d.pct * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

// ── Band styling ────────────────────────────────────────────────────────────
// Vocabulary rows carry a named color in config.color (emerald / sky / amber /
// red / violet / slate / orange / zinc today). Map names → theme-safe classes
// with dark variants; unknown names fall back to muted.

interface BandTone {
  chip: string;
  dot: string;
  text: string;
}

const BAND_TONES: Record<string, BandTone> = {
  violet: {
    chip: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
    dot: "bg-violet-500",
    text: "text-violet-700 dark:text-violet-300",
  },
  emerald: {
    chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  sky: {
    chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
    dot: "bg-sky-500",
    text: "text-sky-700 dark:text-sky-300",
  },
  amber: {
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-300",
  },
  orange: {
    chip: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
    dot: "bg-orange-500",
    text: "text-orange-700 dark:text-orange-300",
  },
  slate: {
    chip: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
    dot: "bg-slate-500",
    text: "text-slate-700 dark:text-slate-300",
  },
  zinc: {
    chip: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground/60",
    text: "text-muted-foreground",
  },
  red: {
    chip: "bg-destructive/15 text-destructive border-destructive/30",
    dot: "bg-destructive",
    text: "text-destructive",
  },
};

const UNVALUED_TONE: BandTone = {
  chip: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/40 border-dashed",
  dot: "bg-amber-500/70",
  text: "text-amber-700 dark:text-amber-400",
};

const FALLBACK_TONE: BandTone = {
  chip: "bg-muted text-muted-foreground border-border",
  dot: "bg-muted-foreground/60",
  text: "text-muted-foreground",
};

export interface BandMeta {
  slug: string;
  label: string;
  description: string | null;
  sort: number;
  tone: BandTone;
  negative: boolean;
  minScore: number | null;
  isTemplate: boolean;
}

/**
 * Merge the site vocabulary with the two reserved resolver slugs so every
 * band the resolver can emit has a label + tone. `unvalued` always exists —
 * it is the work queue.
 */
export function buildBandIndex(vocab: ValueBandDef[]): Map<string, BandMeta> {
  const index = new Map<string, BandMeta>();
  vocab.forEach((band) => {
    const color = typeof band.config?.color === "string" ? band.config.color : null;
    index.set(band.value, {
      slug: band.value,
      label: band.label,
      description: band.description,
      sort: band.sort,
      tone: (color && BAND_TONES[color]) || (band.value === "negative" ? BAND_TONES.red : FALLBACK_TONE),
      negative: band.config?.negative === true || band.value === "negative",
      minScore: typeof band.config?.min_score === "number" ? band.config.min_score : null,
      isTemplate: band.is_template,
    });
  });
  if (!index.has("negative")) {
    index.set("negative", {
      slug: "negative",
      label: "Negative",
      description: "Worth less than nothing to the business.",
      sort: 98,
      tone: BAND_TONES.red,
      negative: true,
      minScore: null,
      isTemplate: false,
    });
  }
  if (!index.has("unvalued")) {
    index.set("unvalued", {
      slug: "unvalued",
      label: "Unvalued",
      description: "No meaning expressed yet — the work queue.",
      sort: 99,
      tone: UNVALUED_TONE,
      negative: false,
      minScore: null,
      isTemplate: false,
    });
  }
  return index;
}

export function bandMeta(index: Map<string, BandMeta>, slug: string): BandMeta {
  return (
    index.get(slug) ?? {
      slug,
      label: slug,
      description: null,
      sort: 100,
      tone: slug === "unvalued" ? UNVALUED_TONE : FALLBACK_TONE,
      negative: false,
      minScore: null,
      isTemplate: false,
    }
  );
}

// ── Reasons ─────────────────────────────────────────────────────────────────

export function fmtMultiplier(m: number): string {
  return `×${Math.round(m * 100) / 100}`;
}

/** One compact text segment per reason — the inline "why" chain. */
export function reasonSegment(reason: ValueReason): string {
  switch (reason.kind) {
    case "override":
      return "expert ruling";
    case "topic":
      return reason.negative_guard
        ? `${reason.topic} · guard: negative`
        : `${reason.topic} · w${reason.weight}`;
    case "default_base":
      return `base ${reason.weight}`;
    case "rule":
      return `${reason.name} ${fmtMultiplier(reason.multiplier)}`;
    case "geo":
      return `geo ${reason.band} (${reason.area}) ${fmtMultiplier(reason.multiplier)}`;
    default:
      return "unknown step";
  }
}
