// File: @/utils/favicon-variants.ts
// EXPERIMENTAL — favicon design bakeoff. Candidate generators for the two-letter
// route badge, compared as REAL tab favicons at /demos/favicon-lab.
//
// THE ONE INVARIANT (Arman, this pass): every badge keeps a guaranteed 1.5px
// ring of the tile color around the entire edge, so the white letters always
// terminate hard against the tile and never dissolve into a near-white page or
// tab bar. Cutting off the tips/outer edges of letters (the points of a W, the
// side of an R) is acceptable — a hard edge everywhere matters more than
// showing every glyph whole.
//
// Two ways to hit that invariant, both shown so you can decide:
//   • STRETCH — textLength fills the letters to the 1.5px inset on all four
//     sides (flush, mild horizontal distortion). This is the spec you gave.
//   • CLIP    — keep the font's true proportions, size the letters BIG, and clip
//     everything to a 1.5px-inset rounded rect. Vertical is filled; the outer
//     sides of wide pairs get cut. No distortion.
//
// Non-system fonts (Archivo Black, Michroma) are embedded as subset woff2 via
// @font-face — an SVG favicon renders no font that isn't installed or embedded.
//
// Once a winner is chosen, fold it into generateSVGFavicon in favicon-utils.ts
// and delete this file, favicon-fonts.ts, and the lab route.

import type { FaviconConfig } from "@/constants/favicon-route-data";
import {
  ARCHIVO_BLACK_WOFF2_B64,
  MICHROMA_WOFF2_B64,
  embeddedFontFace,
} from "@/utils/favicon-fonts";

const S = 64; // canvas — matches favicon-utils
const INSET = 1.5; // guaranteed tile-color ring, in the 64-unit space
const RX = 12;
const INNER = S - INSET * 2; // 61
const CLIP_RX = RX - INSET; // 10.5

const ARIAL = { family: "Helvetica, Arial, sans-serif", weight: 700, cap: 0.716 };
const CONDENSED = {
  family:
    "'Arial Narrow', 'Roboto Condensed', 'Helvetica Neue Condensed', 'Segoe UI Semibold', sans-serif",
  weight: 700,
  cap: 0.72,
};
const ARCHIVO = { family: "ArchivoBlack", weight: 400, cap: 0.72 };
const MICHROMA = { family: "Michroma", weight: 400, cap: 0.7 };

function glyphs(config: FaviconConfig): string {
  return config.emoji || config.letter || "M";
}

/** Wrap a text element in the tile + the guaranteed 1.5px-inset clip ring. */
function frame(color: string, defs: string, textEl: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}">${defs}<clipPath id="ring"><rect x="${INSET}" y="${INSET}" width="${INNER}" height="${INNER}" rx="${CLIP_RX}"/></clipPath><rect width="${S}" height="${S}" rx="${RX}" fill="${color}"/><g clip-path="url(#ring)">${textEl}</g></svg>`;
}

type Face = { family: string; weight: number; cap: number };

// STRETCH: fill the letters to the 1.5px inset on all four sides.
function stretch(config: FaviconConfig, face: Face, defs = ""): string {
  const t = glyphs(config);
  const fs = (INNER / face.cap).toFixed(2); // cap-height == inner height
  const baseline = (S - INSET).toFixed(2); // 62.5
  const el = `<text x="${INSET}" y="${baseline}" textLength="${INNER}" lengthAdjust="spacingAndGlyphs" font-family="${face.family}" font-weight="${face.weight}" font-size="${fs}" fill="#FFFFFF">${t}</text>`;
  return frame(config.color, defs, el);
}

// CLIP: true proportions, big, clipped to the ring. `capH` sets vertical fill;
// `ls` (letter-spacing) pulls the pair together so less gets cut off the sides.
function clip(
  config: FaviconConfig,
  face: Face,
  capH: number,
  ls: number,
  defs = "",
): string {
  const t = glyphs(config);
  const fs = (capH / face.cap).toFixed(2);
  const baseline = ((S + capH) / 2).toFixed(2); // vertically centered
  const el = `<text x="32" y="${baseline}" text-anchor="middle" font-family="${face.family}" font-weight="${face.weight}" font-size="${fs}" letter-spacing="${ls}" fill="#FFFFFF">${t}</text>`;
  return frame(config.color, defs, el);
}

const ARCHIVO_DEFS = embeddedFontFace("ArchivoBlack", ARCHIVO_BLACK_WOFF2_B64);
const MICHROMA_DEFS = embeddedFontFace("Michroma", MICHROMA_WOFF2_B64);

export type FaviconVariantId =
  | "current"
  | "stretch15"
  | "helveticaClip"
  | "condensedClip"
  | "archivoStretch"
  | "archivoClip"
  | "michromaStretch"
  | "michromaClip";

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

// Baseline — today's live generator, verbatim, no ring (shows the problem).
function current(config: FaviconConfig): string {
  const t = glyphs(config);
  const len = t.length;
  const fontSize = len === 1 ? "46" : len === 2 ? "34" : "26";
  const y = len === 1 ? "55" : len === 2 ? "53" : "52";
  const spc = len === 2 ? "-1" : "0";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="${config.color}"/><text x="32" y="${y}" font-family="system-ui,-apple-system,sans-serif" font-size="${fontSize}" font-weight="800" fill="white" text-anchor="middle" letter-spacing="${spc}">${t}</text></svg>`;
}

export const FAVICON_VARIANTS: FaviconVariant[] = [
  {
    id: "current",
    label: "Current (live)",
    blurb: "Today's generator. No ring, small letters — the before.",
    distorts: false,
    generate: current,
  },
  {
    id: "stretch15",
    label: "Stretch · 1.5px inset (your spec)",
    blurb: "Letters filled to a 1.5px tile ring on all four sides. Flush everywhere, mild horizontal distortion. Arial.",
    distorts: true,
    slug: "stretch-15",
    generate: (c) => stretch(c, ARIAL),
  },
  {
    id: "helveticaClip",
    label: "Helvetica · big + clipped",
    blurb: "True Arial proportions, sized big, clipped to the 1.5px ring. No distortion; outer sides of wide pairs get cut.",
    distorts: false,
    slug: "helvetica-clip",
    generate: (c) => clip(c, ARIAL, 52, -5),
  },
  {
    id: "condensedClip",
    label: "Condensed · big + clipped",
    blurb: "Condensed face — narrower letters fit taller with less side-cut. Zero distortion; needs a condensed font or falls back.",
    distorts: false,
    slug: "condensed-clip",
    generate: (c) => clip(c, CONDENSED, 54, -2),
  },
  {
    id: "archivoStretch",
    label: "Archivo Black · stretch",
    blurb: "Archivo Black (embedded), filled to the 1.5px ring on all sides. Heavy and flush.",
    distorts: true,
    slug: "archivo-stretch",
    generate: (c) => stretch(c, ARCHIVO, ARCHIVO_DEFS),
  },
  {
    id: "archivoClip",
    label: "Archivo Black · clipped",
    blurb: "Archivo Black (embedded), true proportions, big + clipped to the ring. Very heavy; sides cut.",
    distorts: false,
    slug: "archivo-clip",
    generate: (c) => clip(c, ARCHIVO, 50, -4, ARCHIVO_DEFS),
  },
  {
    id: "michromaStretch",
    label: "Michroma · stretch",
    blurb: "Michroma (embedded), geometric/techy, filled to the 1.5px ring on all sides.",
    distorts: true,
    slug: "michroma-stretch",
    generate: (c) => stretch(c, MICHROMA, MICHROMA_DEFS),
  },
  {
    id: "michromaClip",
    label: "Michroma · clipped",
    blurb: "Michroma (embedded), true proportions, big + clipped. It's a wide face, so expect the most side-cut.",
    distorts: false,
    slug: "michroma-clip",
    generate: (c) => clip(c, MICHROMA, 50, -4, MICHROMA_DEFS),
  },
];
