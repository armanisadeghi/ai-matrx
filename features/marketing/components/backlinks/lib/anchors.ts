/**
 * Anchor-text grouping + profile analysis (pure — unit-testable).
 *
 * "Anchor text" is the visible wording of a link. Sites that earn links
 * naturally get mostly their own name; a big share of keyword-stuffed
 * wording — or one phrase repeated across a lot of links — is the pattern
 * search engines read as manipulation. This module sorts each anchor into a
 * group and rolls the spread up with explicit, threshold-driven warnings.
 *
 * Warning copy here is read by a non-technical owner: no "over-optimization",
 * no "footprint", no "equity" — say what happened and what to do.
 */

export const ANCHOR_CLASSES = [
  {
    key: "branded",
    label: "Your name",
    description:
      "Uses your business or website name. This is the safest kind to have most of.",
  },
  {
    key: "naked_url",
    label: "Your web address",
    description: "The address itself is the wording of the link.",
  },
  {
    key: "generic",
    label: "Filler words",
    description: "“Click here”, “website”, “read more” and the like.",
  },
  {
    key: "empty",
    label: "No wording",
    description: "Nothing to read — image links and bare buttons.",
  },
  {
    key: "topical",
    label: "Keywords",
    description:
      "Wording that describes what you do. Valuable, but too much of it looks unnatural.",
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

/**
 * True when `target` equals a run of consecutive anchor tokens ("all green
 * recycling" matches "allgreenrecycling"; a single token matches itself).
 * Token-boundary matching — a target buried inside a longer word never
 * matches ("remarketing" is NOT branded for a "marketing" domain core).
 */
function hasTokenRun(tokens: string[], target: string): boolean {
  for (let i = 0; i < tokens.length; i++) {
    let joined = "";
    for (let j = i; j < tokens.length; j++) {
      joined += tokens[j];
      if (joined === target) return true;
      if (joined.length >= target.length) break;
    }
  }
  return false;
}

export function classifyAnchor(
  anchor: string | null | undefined,
  ctx: AnchorClassifierContext,
): AnchorClassKey {
  const text = anchor ? normalize(anchor) : "";
  if (!text) return "empty";
  if (URL_LIKE.test(text)) return "naked_url";
  if (GENERIC_ANCHORS.has(text)) return "generic";
  const tokens = text.split(/[^a-z0-9]+/).filter(Boolean);
  const core = domainCore(ctx.domain).replace(/[^a-z0-9]/g, "");
  if (core.length >= 3 && hasTokenRun(tokens, core)) return "branded";
  for (const name of ctx.brandNames) {
    const brand = normalize(name).replace(/[^a-z0-9]/g, "");
    if (brand.length >= 3 && hasTokenRun(tokens, brand)) return "branded";
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
        message: `${Math.round(topical.share * 100)}% of your links use keyword wording — far more than a site earns naturally. Aim the next links at your own name instead.`,
      });
    } else if (topical && topical.share >= TOPICAL_SHARE_WARN) {
      warnings.push({
        severity: "warning",
        message: `${Math.round(topical.share * 100)}% of your links use keyword wording — higher than most sites get naturally. Favour your own name in the links you build next.`,
      });
    }
    for (const item of concentrated.slice(0, 3)) {
      warnings.push({
        severity: item.share >= 0.2 ? "critical" : "warning",
        message: `“${item.anchor}” is the wording on ${Math.round(item.share * 100)}% of all your links. One phrase repeated that often is a pattern search engines notice.`,
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
