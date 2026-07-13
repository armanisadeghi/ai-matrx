// File: @/utils/favicon-variants.ts
// EXPERIMENTAL — favicon design bakeoff. Six candidate generators for the
// two-letter route badge, so we can compare "fit two letters big + flush"
// approaches side by side at real tab sizes (see /demos/favicon-lab).
//
// The problem: two natural-width bold caps only fit inside a 64×64 square at
// ~font-size 34 (cap-height ≈ 24px ≈ 38% of the box) — which is why the current
// badges read small. To make the caps bigger you MUST either compress the
// glyphs horizontally (textLength) or use a condensed face; a square can't hold
// two full-height, natural-width caps.
//
// Once a winner is chosen, fold it into generateSVGFavicon in favicon-utils.ts
// and delete this file + the lab route.

import type { FaviconConfig } from "@/constants/favicon-route-data";

const S = 64; // canvas — matches favicon-utils
const CAP = 0.716; // Helvetica/Arial Bold cap-height as a fraction of the em box
const HELV = `font-family="Helvetica, Arial, sans-serif" font-weight="700"`;
const CONDENSED = `font-family="'Arial Narrow', 'Roboto Condensed', 'Helvetica Neue Condensed', 'Segoe UI Semibold', sans-serif" font-weight="700"`;

function text(display: string, color: string) {
  return { display, color };
}

function svg(inner: string, color: string, rx: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}"><rect width="${S}" height="${S}" rx="${rx}" fill="${color}"/>${inner}</svg>`;
}

/** Darken a #rrggbb hex by `factor` (0–1). Used to derive a defining rim. */
function darken(hex: string, factor: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.round(((n >> 16) & 0xff) * factor);
  const g = Math.round(((n >> 8) & 0xff) * factor);
  const b = Math.round((n & 0xff) * factor);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/**
 * Same as `svg`, but with a thin inset rim in a darkened shade of the fill so
 * the badge stays defined against white (or dark) tab chrome — the rim reads
 * against both the chrome and the fill, and keeps flush white letters from
 * bleeding into a white tab bar.
 */
function svgBordered(
  inner: string,
  color: string,
  rx: number,
  strokeW = 3,
): string {
  const off = strokeW / 2;
  const inset = S - strokeW;
  const rim = darken(color, 0.55);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}"><rect width="${S}" height="${S}" rx="${rx}" fill="${color}"/><rect x="${off}" y="${off}" width="${inset}" height="${inset}" rx="${rx - off}" fill="none" stroke="${rim}" stroke-width="${strokeW}"/>${inner}</svg>`;
}

function glyphs(config: FaviconConfig): string {
  return config.emoji || config.letter || "M";
}

export type FaviconVariantId =
  | "current"
  | "stretchFull"
  | "stretchInset"
  | "stretchTuned"
  | "condensed"
  | "naturalBig"
  | "condensedBordered"
  | "stretchTunedBordered"
  | "condensedHeavy";

export interface FaviconVariant {
  id: FaviconVariantId;
  label: string;
  blurb: string;
  /** Whether letterforms are geometrically distorted (stretched/squeezed). */
  distorts: boolean;
  /** URL slug for the real-favicon test route (omitted for the live baseline). */
  slug?: string;
  generate: (config: FaviconConfig) => string;
}

// ── 1. current — today's live generator, verbatim, for reference ──────────────
function current(config: FaviconConfig): string {
  const t = glyphs(config);
  const len = t.length;
  const fontSize = len === 1 ? "46" : len === 2 ? "34" : "26";
  const y = len === 1 ? "55" : len === 2 ? "53" : "52";
  const ls = len === 2 ? "-1" : "0";
  const inner = `<text x="32" y="${y}" font-family="system-ui,-apple-system,sans-serif" font-size="${fontSize}" font-weight="800" fill="white" text-anchor="middle" letter-spacing="${ls}">${t}</text>`;
  return svg(inner, config.color, 10);
}

// ── 2. stretchFull — Claude's proposal, scaled to 64. Caps kiss all 4 edges ───
// Biggest possible letters, but the tops clip against the rounded corners and
// narrow pairs (RI) get visibly stretched.
function stretchFull(config: FaviconConfig): string {
  const t = glyphs(config);
  const fs = (S / CAP).toFixed(2); // cap-height == full box height
  const inner = `<text x="0" y="${S}" textLength="${S}" lengthAdjust="spacingAndGlyphs" ${HELV} font-size="${fs}" fill="#FFFFFF">${t}</text>`;
  return svg(inner, config.color, 12);
}

// ── 3. stretchInset — Claude's "hairline inset" knob. 4px margin all around ───
// Same idea, pulled off the edges so it stops clipping the rounded corners.
function stretchInset(config: FaviconConfig): string {
  const t = glyphs(config);
  const pad = 4;
  const w = S - pad * 2; // 56
  const fs = (w / CAP).toFixed(2); // cap-height == inner height
  const baseline = S - pad; // 60
  const inner = `<text x="${pad}" y="${baseline}" textLength="${w}" lengthAdjust="spacingAndGlyphs" ${HELV} font-size="${fs}" fill="#FFFFFF">${t}</text>`;
  return svg(inner, config.color, 12);
}

// ── 4. stretchTuned — bounded distortion (recommended) ────────────────────────
// Caps ~50px tall (≈78% of box), width compressed to 54. Big and clearly flush,
// but distortion stays mild: wide pairs squeeze ~20%, narrow pairs stretch ~10%,
// so every badge reads at the same optical weight without looking warped.
function stretchTuned(config: FaviconConfig): string {
  const t = glyphs(config);
  const capH = 50;
  const w = 54;
  const x = (S - w) / 2; // 5
  const fs = (capH / CAP).toFixed(2); // ≈ 69.8
  const topMargin = (S - capH) / 2; // 7
  const baseline = topMargin + capH; // 57
  const inner = `<text x="${x}" y="${baseline}" textLength="${w}" lengthAdjust="spacingAndGlyphs" ${HELV} font-size="${fs}" fill="#FFFFFF">${t}</text>`;
  return svg(inner, config.color, 12);
}

// ── 5. condensed — condensed face, NO distortion ──────────────────────────────
// Naturally narrow letterforms fit two caps without stretching. Depends on a
// condensed font being installed; where it isn't, the stack falls back and the
// pair may overflow — the honest tradeoff to see.
function condensed(config: FaviconConfig): string {
  const t = glyphs(config);
  const inner = `<text x="32" y="54" ${CONDENSED} font-size="58" fill="#FFFFFF" text-anchor="middle" letter-spacing="-1">${t}</text>`;
  return svg(inner, config.color, 12);
}

// ── 6. naturalBig — no distortion, as big as honest fitting allows ────────────
// Real letterforms, tightened with negative tracking. This is the ceiling for
// undistorted two-cap fit — noticeably bigger than `current`, still not flush.
function naturalBig(config: FaviconConfig): string {
  const t = glyphs(config);
  const inner = `<text x="32" y="49" ${HELV} font-size="44" fill="#FFFFFF" text-anchor="middle" letter-spacing="-2.5">${t}</text>`;
  return svg(inner, config.color, 12);
}

// ── 7. condensedBordered — condensed face + thin defining rim (requested) ─────
// Zero distortion, plus a darkened rim so the badge stays crisp against white
// tab chrome and the letters never bleed into it.
function condensedBordered(config: FaviconConfig): string {
  const t = glyphs(config);
  const inner = `<text x="32" y="54" ${CONDENSED} font-size="58" fill="#FFFFFF" text-anchor="middle" letter-spacing="-1">${t}</text>`;
  return svgBordered(inner, config.color, 12, 3);
}

// ── 8. stretchTunedBordered — my recommended tuned fit + the defining rim ──────
// Combines the best-fitting distortion-bounded stretch with the rim, so it's
// big, flush, AND clearly separated from the tab chrome.
function stretchTunedBordered(config: FaviconConfig): string {
  const t = glyphs(config);
  const capH = 48; // slightly smaller so the flush letters clear the rim
  const w = 52;
  const x = (S - w) / 2; // 6
  const fs = (capH / CAP).toFixed(2);
  const baseline = (S - capH) / 2 + capH; // 56
  const inner = `<text x="${x}" y="${baseline}" textLength="${w}" lengthAdjust="spacingAndGlyphs" ${HELV} font-size="${fs}" fill="#FFFFFF">${t}</text>`;
  return svgBordered(inner, config.color, 12, 3);
}

// ── 9. condensedHeavy — condensed face at black weight, no distortion ──────────
// Heavier strokes make the same condensed letters read bigger/bolder at 16px
// without stretching. My other idea worth eyeballing at true tab size.
function condensedHeavy(config: FaviconConfig): string {
  const t = glyphs(config);
  const heavy = CONDENSED.replace('font-weight="700"', 'font-weight="900"');
  const inner = `<text x="32" y="55" ${heavy} font-size="60" fill="#FFFFFF" text-anchor="middle" letter-spacing="-1.5">${t}</text>`;
  return svg(inner, config.color, 12);
}

export const FAVICON_VARIANTS: FaviconVariant[] = [
  {
    id: "current",
    label: "Current (live)",
    blurb: "Today's generator. Two caps at font-size 34 — the padding you want gone.",
    distorts: false,
    generate: current,
  },
  {
    id: "stretchFull",
    label: "Stretch — full bleed",
    blurb: "Claude's proposal. Caps kiss all four edges; tops clip the corners, narrow pairs warp.",
    distorts: true,
    slug: "stretch-full",
    generate: stretchFull,
  },
  {
    id: "stretchInset",
    label: "Stretch — 4px inset",
    blurb: "Same, pulled off the edges so it stops clipping the rounded corners. War Room's live tab uses this.",
    distorts: true,
    slug: "stretch-inset",
    generate: stretchInset,
  },
  {
    id: "stretchTuned",
    label: "Stretch — tuned (recommended)",
    blurb: "Big and flush, distortion bounded to ~10–20%. Every badge reads at equal weight without looking warped.",
    distorts: true,
    slug: "stretch-tuned",
    generate: stretchTuned,
  },
  {
    id: "condensed",
    label: "Condensed face",
    blurb: "Naturally narrow letters, zero distortion — but needs a condensed font installed or it overflows.",
    distorts: false,
    slug: "condensed",
    generate: condensed,
  },
  {
    id: "naturalBig",
    label: "Natural, tightened",
    blurb: "No distortion, tight tracking. The honest ceiling for two real caps — bigger than current, not flush.",
    distorts: false,
    slug: "natural-big",
    generate: naturalBig,
  },
  {
    id: "condensedBordered",
    label: "Condensed + rim (requested)",
    blurb: "Condensed face with a thin darkened rim so the badge stays crisp against white tab chrome.",
    distorts: false,
    slug: "condensed-bordered",
    generate: condensedBordered,
  },
  {
    id: "stretchTunedBordered",
    label: "Tuned stretch + rim",
    blurb: "My pick: the bounded-distortion big/flush fit, plus the defining rim. Big, flush, and separated from the chrome.",
    distorts: true,
    slug: "stretch-tuned-bordered",
    generate: stretchTunedBordered,
  },
  {
    id: "condensedHeavy",
    label: "Condensed — black weight",
    blurb: "Condensed letters at font-weight 900, no distortion — heavier strokes read bigger at 16px.",
    distorts: false,
    slug: "condensed-heavy",
    generate: condensedHeavy,
  },
];
