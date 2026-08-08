/**
 * Anchor-text classification + profile analysis (pure — unit-testable).
 *
 * The classic SEO anchor discipline: branded anchors should dominate a
 * natural profile; a high share of keyword-bearing ("topical") anchors — or
 * any single non-branded anchor carrying an outsized share — reads as
 * over-optimization risk. This module classifies each anchor and rolls the
 * distribution up with explicit, threshold-driven warnings.
 */

export const ANCHOR_CLASSES = [
  {
    key: "branded",
    label: "Branded",
    description: "Contains the brand or domain name — the safe backbone.",
  },
  {
    key: "naked_url",
    label: "Naked URL",
    description: "The raw URL or domain as the anchor.",
  },
  {
    key: "generic",
    label: "Generic",
    description: "“click here”, “website”, “read more” and friends.",
  },
  {
    key: "empty",
    label: "Empty / image",
    description: "No anchor text — image links and bare elements.",
  },
  {
    key: "topical",
    label: "Topical",
    description:
      "Keyword-bearing anchors. Valuable, but the class to watch for over-optimization.",
  },
] as const;

export type AnchorClassKey = (typeof ANCHOR_CLASSES)[number]["key"];

const GENERIC_ANCHORS = new Set([
  "click here",
  "here",
  "click",
  "link",
  "this",
  "this link",
  "read more",
  "learn more",
  "more",
  "more info",
  "website",
  "web site",
  "visit website",
  "visit site",
  "site",
  "home",
  "homepage",
  "source",
  "info",
  "details",
  "check it out",
  "go",
  "url",
]);

export interface AnchorClassifierContext {
  /** Site host, e.g. "allgreenrecycling.com" (scheme/www stripped by the caller or here). */
  domain: string;
  /** Brand names/aliases, e.g. ["All Green Recycling", "AllGreen"]. */
  brandNames: string[];
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function domainCore(domain: string): string {
  const host = domain
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
  return host.split(".")[0] ?? host;
}

const URL_LIKE = /^(https?:\/\/|www\.)|(\.[a-z]{2,10})(\/|$)/i;

export function classifyAnchor(
  anchor: string | null | undefined,
  ctx: AnchorClassifierContext,
): AnchorClassKey {
  const text = anchor ? normalize(anchor) : "";
  if (!text) return "empty";
  if (URL_LIKE.test(text)) return "naked_url";
  if (GENERIC_ANCHORS.has(text)) return "generic";
  const compact = text.replace(/[^a-z0-9]/g, "");
  const core = domainCore(ctx.domain).replace(/[^a-z0-9]/g, "");
  if (core.length >= 3 && compact.includes(core)) return "branded";
  for (const name of ctx.brandNames) {
    const brand = normalize(name).replace(/[^a-z0-9]/g, "");
    if (brand.length >= 3 && compact.includes(brand)) return "branded";
  }
  return "topical";
}

export interface AnchorProfileRow {
  anchor: string | null;
  backlinks: number;
}

export interface AnchorProfileEntry {
  key: AnchorClassKey;
  label: string;
  backlinks: number;
  share: number; // 0..1 of total backlinks
  anchorCount: number;
}

export interface AnchorProfileWarning {
  severity: "warning" | "critical";
  message: string;
}

export interface AnchorProfile {
  totalBacklinks: number;
  totalAnchors: number;
  entries: AnchorProfileEntry[];
  /** Single anchors carrying an outsized share of all links (non-branded). */
  concentrated: Array<{ anchor: string; backlinks: number; share: number }>;
  warnings: AnchorProfileWarning[];
}

/** Topical share beyond this is a warning; beyond critical it screams. */
export const TOPICAL_SHARE_WARN = 0.3;
export const TOPICAL_SHARE_CRITICAL = 0.5;
/** One non-branded anchor holding this share of ALL links is concentration risk. */
export const SINGLE_ANCHOR_SHARE_WARN = 0.1;
/** Ignore concentration math below this many total links (noise). */
export const MIN_LINKS_FOR_WARNINGS = 30;

export function analyzeAnchorProfile(
  rows: AnchorProfileRow[],
  ctx: AnchorClassifierContext,
): AnchorProfile {
  const byClass = new Map<AnchorClassKey, { backlinks: number; anchors: number }>();
  let total = 0;
  const concentrated: Array<{ anchor: string; backlinks: number; share: number }> = [];

  for (const row of rows) {
    const links = row.backlinks > 0 ? row.backlinks : 0;
    total += links;
    const key = classifyAnchor(row.anchor, ctx);
    const bucket = byClass.get(key) ?? { backlinks: 0, anchors: 0 };
    bucket.backlinks += links;
    bucket.anchors += 1;
    byClass.set(key, bucket);
  }

  if (total > 0) {
    for (const row of rows) {
      if (!row.anchor || row.backlinks <= 0) continue;
      const key = classifyAnchor(row.anchor, ctx);
      if (key === "branded" || key === "naked_url") continue;
      const share = row.backlinks / total;
      if (share >= SINGLE_ANCHOR_SHARE_WARN) {
        concentrated.push({ anchor: row.anchor, backlinks: row.backlinks, share });
      }
    }
    concentrated.sort((a, b) => b.share - a.share);
  }

  const entries: AnchorProfileEntry[] = ANCHOR_CLASSES.map((cls) => {
    const bucket = byClass.get(cls.key);
    return {
      key: cls.key,
      label: cls.label,
      backlinks: bucket?.backlinks ?? 0,
      share: total > 0 ? (bucket?.backlinks ?? 0) / total : 0,
      anchorCount: bucket?.anchors ?? 0,
    };
  });

  const warnings: AnchorProfileWarning[] = [];
  if (total >= MIN_LINKS_FOR_WARNINGS) {
    const topical = entries.find((entry) => entry.key === "topical");
    if (topical && topical.share >= TOPICAL_SHARE_CRITICAL) {
      warnings.push({
        severity: "critical",
        message: `Topical (keyword) anchors carry ${Math.round(topical.share * 100)}% of links — well past a natural profile. Diversify toward branded anchors before building more keyword links.`,
      });
    } else if (topical && topical.share >= TOPICAL_SHARE_WARN) {
      warnings.push({
        severity: "warning",
        message: `Topical (keyword) anchors carry ${Math.round(topical.share * 100)}% of links — approaching over-optimization territory. Favor branded anchors in upcoming links.`,
      });
    }
    for (const item of concentrated.slice(0, 3)) {
      warnings.push({
        severity: item.share >= 0.2 ? "critical" : "warning",
        message: `“${item.anchor}” alone carries ${Math.round(item.share * 100)}% of all links — a single-anchor footprint search engines notice.`,
      });
    }
  }

  return {
    totalBacklinks: total,
    totalAnchors: rows.length,
    entries,
    concentrated,
    warnings,
  };
}
