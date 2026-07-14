// File: @/utils/favicon-utils.ts
// Utilities for managing dynamic favicons across the application

import {
  faviconRouteData,
  type FaviconConfig,
  type FaviconRouteEntry,
} from "@/constants/favicon-route-data";
import { Metadata } from "next";
import { ARCHIVO_GLYPHS } from "@/utils/favicon-archivo-glyphs";

/** Narrowed non-array/non-string/non-URL branch of `Metadata["icons"]`. */
type MetadataIcons = Exclude<
  NonNullable<Metadata["icons"]>,
  string | URL | ReadonlyArray<unknown>
>;

/** True only for the `Icons` map shape (`{ icon?, shortcut?, apple?, other? }`) — excludes string/URL/array icon shorthands. */
function isMetadataIconsMap(
  icons: NonNullable<Metadata["icons"]>,
): icons is MetadataIcons {
  return (
    typeof icons === "object" &&
    !(icons instanceof URL) &&
    !Array.isArray(icons)
  );
}

// ─── System-route color families ──────────────────────────────────────────────
// These route trees have a FIXED COLOR so users can instantly identify the
// category of a tab. The LETTER is always supplied per-route — never shared —
// so 20 yellow tabs each show a different 2-char code.
//
// Rule: every subroute in these trees MUST pass an explicit `letter` to
// createRouteMetadata / createDynamicRouteMetadata. The fallback below is only
// used for the root index page of the tree.

/** Demo route family — warm yellow. Each subroute picks its own 2-char letter. */
export const DEMO_COLOR = "#ca8a04";
/** Tests / experimental / beta family — lime green. */
export const TEST_COLOR = "#65a30d";
/** Administration family — deep indigo (distinct from the red app accent). */
export const ADMIN_COLOR = "#4338ca";

function pathnameIsUnderDemoHosts(pathname: string): boolean {
  return (
    pathname === "/demo" ||
    pathname.startsWith("/demo/") ||
    pathname === "/demos" ||
    pathname.startsWith("/demos/") ||
    pathname === "/component-demo" ||
    pathname.startsWith("/component-demo/") ||
    pathname === "/p/demo" ||
    pathname.startsWith("/p/demo/") ||
    // Entity-isolation migration: demo moved to (legacy)/legacy/demo, URL /legacy/demo.
    pathname === "/legacy/demo" ||
    pathname.startsWith("/legacy/demo/")
  );
}

function pathnameIsUnderTestHosts(pathname: string): boolean {
  return (
    pathname === "/tests" ||
    pathname.startsWith("/tests/") ||
    pathname === "/beta" ||
    pathname.startsWith("/beta/") ||
    pathname === "/experimental" ||
    pathname.startsWith("/experimental/") ||
    // Entity-isolation migration: tests moves to /legacy/tests in Phase 3.
    pathname === "/legacy/tests" ||
    pathname.startsWith("/legacy/tests/")
  );
}

function pathnameIsUnderAdminHosts(pathname: string): boolean {
  return (
    pathname === "/administration" ||
    pathname.startsWith("/administration/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    // Entity-isolation migration: admin moves to /legacy/admin in Phase 3.
    pathname === "/legacy/admin" ||
    pathname.startsWith("/legacy/admin/")
  );
}

// ─── Active favicon style ─────────────────────────────────────────────────────
// The badge design generateSVGFavicon renders for EVERY route. Flip this one
// value to instantly restore the previous look — nothing else changes.
//   "archivoStretch" — big Archivo Black letters filled to a 1.5px tile ring
//                      (bakeoff winner; two-letter codes read large and flush).
//   "legacy"         — the previous small system-font badge (deactivated).
const FAVICON_STYLE: "archivoStretch" | "legacy" = "archivoStretch";

// Geometry shared by the active style (64-unit canvas).
const FAV_S = 64;
const FAV_INSET = 1.5; // guaranteed tile-color ring around the whole edge
const FAV_RX = 12;
const FAV_INNER = FAV_S - FAV_INSET * 2; // 61

// ── Tunable badge geometry ────────────────────────────────────────────────────
// MIN_ASPECT: how much horizontal squeeze a multi-letter code may take. 1 = zero
//   distortion (letters keep true proportions); lower = more squeeze allowed to
//   grow taller. 0.82 keeps distortion mild and readable.
const FAV_MIN_ASPECT = 0.82;
// Fraction of the inner box a multi-letter code fills vertically (cap height).
const FAV_MULTI_VFILL = 0.9;
// Fraction of the inner box a SINGLE letter fills — deliberately moderate so N,
// C, etc. look calm, not blown up. No distortion ever for a single letter.
const FAV_SINGLE_FILL = 0.66;

/**
 * ACTIVE generator — Archivo Black letters as vector OUTLINES on the tile.
 *
 * - Letters are real <path> outlines (not <text>), so they render in every
 *   browser's restricted favicon rasterizer — where @font-face is ignored and
 *   named fonts silently produce nothing.
 * - Multi-letter codes are sized by the letters' INK bounds and optically
 *   centered; horizontal squeeze is capped at FAV_MIN_ASPECT so they read
 *   natural, not stretched.
 * - A single letter uses a uniform (undistorted) scale at a moderate size.
 * - A 1.5px-inset rounded clip guarantees the tile ring so white letters never
 *   dissolve into a near-white page or tab bar.
 * - Any character without an outline (emoji, punctuation) falls back to the
 *   legacy text badge so a favicon is never blank.
 */
function generateSVGFaviconArchivo(config: FaviconConfig): string {
  const { color } = config;
  const displayText = config.emoji || config.letter || "M";
  const glyphs = [...displayText].map((c) => ARCHIVO_GLYPHS[c]);

  // Emoji / unmapped glyph → legacy text render (never blank).
  if (glyphs.some((g) => !g)) return generateSVGFaviconLegacy(config);

  // Lay glyphs left-to-right by advance; collect ink bounds of the whole word.
  let cursor = 0;
  let inkX0 = Infinity;
  let inkX1 = -Infinity;
  let inkY0 = Infinity;
  let inkY1 = -Infinity;
  const paths = glyphs
    .map((g) => {
      inkX0 = Math.min(inkX0, cursor + g!.x0);
      inkX1 = Math.max(inkX1, cursor + g!.x1);
      inkY0 = Math.min(inkY0, g!.y0);
      inkY1 = Math.max(inkY1, g!.y1);
      const p = `<path transform="translate(${cursor} 0)" d="${g!.d}"/>`;
      cursor += g!.a;
      return p;
    })
    .join("");

  const inkW = inkX1 - inkX0;
  const inkH = inkY1 - inkY0;

  let scaleX: number;
  let scaleY: number;
  if (glyphs.length >= 2) {
    // Fit the ink width to the box, then allow only a bounded vertical grow so
    // letters get taller (less short/wide) without heavy distortion.
    scaleX = FAV_INNER / inkW;
    scaleY = Math.min((FAV_MULTI_VFILL * FAV_INNER) / inkH, scaleX / FAV_MIN_ASPECT);
  } else {
    // Single letter: uniform, moderate, undistorted; never overflow the width.
    scaleX = scaleY = Math.min(
      (FAV_SINGLE_FILL * FAV_INNER) / inkH,
      FAV_INNER / inkW,
    );
  }

  // Optically center the ink box in both axes (SVG y flips: y_svg = ty - y*scaleY).
  const tx = FAV_INSET + (FAV_INNER - inkW * scaleX) / 2 - inkX0 * scaleX;
  const ty = FAV_INSET + (FAV_INNER - inkH * scaleY) / 2 + inkY1 * scaleY;
  const transform = `translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${scaleX.toFixed(5)} ${(-scaleY).toFixed(5)})`;

  const clip = `<clipPath id="fring"><rect x="${FAV_INSET}" y="${FAV_INSET}" width="${FAV_INNER}" height="${FAV_INNER}" rx="${FAV_RX - FAV_INSET}"/></clipPath>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FAV_S} ${FAV_S}"><defs>${clip}</defs><rect width="${FAV_S}" height="${FAV_S}" rx="${FAV_RX}" fill="${color}"/><g clip-path="url(#fring)" fill="#FFFFFF"><g transform="${transform}">${paths}</g></g></svg>`;
}

/**
 * DEACTIVATED — the previous small system-font badge. Kept intact so flipping
 * FAVICON_STYLE back to "legacy" restores the exact prior look.
 */
function generateSVGFaviconLegacy(config: FaviconConfig): string {
  const { color, letter, emoji } = config;
  const displayText = emoji || letter || "M";
  const len = displayText.length;

  const fontSize = len === 1 ? "46" : len === 2 ? "34" : "26";
  const yPosition = len === 1 ? "55" : len === 2 ? "53" : "52";
  const letterSpacing = len === 2 ? "-1" : "0";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${color}" rx="10"/><text x="32" y="${yPosition}" font-family="system-ui,-apple-system,sans-serif" font-size="${fontSize}" font-weight="800" fill="white" text-anchor="middle" letter-spacing="${letterSpacing}">${displayText}</text></svg>`;
}

/**
 * Generates an SVG favicon for a route badge, in the currently-active style
 * (see FAVICON_STYLE). Used by every route through generateFaviconMetadata.
 */
export function generateSVGFavicon(config: FaviconConfig): string {
  return FAVICON_STYLE === "archivoStretch"
    ? generateSVGFaviconArchivo(config)
    : generateSVGFaviconLegacy(config);
}

/**
 * Converts an SVG string to a data URI that can be used as favicon
 * @param svg - SVG string
 * @returns Data URI string
 */
export function svgToDataURI(svg: string): string {
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, "%27")
    .replace(/"/g, "%22");
  return `data:image/svg+xml,${encoded}`;
}

/**
 * Finds the navigation link configuration for a given route
 * @param pathname - The current pathname (e.g., "/notes", "/chat")
 * @returns The matching navigation link or undefined
 */
export function findNavigationLinkByPath(
  pathname: string,
): FaviconRouteEntry | undefined {
  // Try exact match first
  const exactMatch = faviconRouteData.find((link) => link.href === pathname);
  if (exactMatch) return exactMatch;

  // Try to match by route prefix (for nested routes)
  // Sort by href length (descending) to match more specific routes first
  const sortedLinks = [...faviconRouteData].sort(
    (a, b) => b.href.length - a.href.length,
  );
  return sortedLinks.find((link) => pathname.startsWith(link.href));
}

/**
 * Returns the system color for a pathname that belongs to a color-family
 * (demo / tests / admin), or undefined if the route is not in any family.
 * Used by the metadata helpers so they can inject the correct color even when
 * the caller provides a custom letter.
 */
export function getSystemRouteColor(pathname: string): string | undefined {
  if (pathnameIsUnderDemoHosts(pathname)) return DEMO_COLOR;
  if (pathnameIsUnderTestHosts(pathname)) return TEST_COLOR;
  if (pathnameIsUnderAdminHosts(pathname)) return ADMIN_COLOR;
  return undefined;
}

/**
 * Gets the favicon configuration for a given route.
 *
 * For system-route families (demo / tests / admin): returns the family color
 * with a generic fallback letter. Callers should always pass an explicit letter
 * via createRouteMetadata({ letter: "GH" }) rather than relying on this fallback.
 *
 * For primary routes: returns the config from `favicon-route-data` (via pathname match).
 */
export function getFaviconConfigByPath(
  pathname: string,
): FaviconConfig | undefined {
  // System color families — color is fixed, letter falls back to first 2 chars of
  // the last path segment. Callers should always supply an explicit letter instead.
  const systemColor = getSystemRouteColor(pathname);
  if (systemColor) {
    // Derive a fallback 2-char letter from the pathname segment for the index page.
    // Sub-routes should never hit this fallback — they pass their own letter.
    const segment = pathname.replace(/\/$/, "").split("/").pop() ?? "Mx";
    const fallbackLetter = segment
      .slice(0, 2)
      .replace(/[^a-zA-Z]/g, "Mx")
      .slice(0, 2);
    return { color: systemColor, letter: fallbackLetter || "Mx" };
  }

  const link = findNavigationLinkByPath(pathname);
  return link?.favicon;
}

/**
 * Generates Next.js metadata with a custom favicon for the given route.
 *
 * @param pathname - The route path — used to look up the color family or nav entry
 * @param additionalMetadata - Other metadata to merge (title, description, OG, etc.)
 * @param letterOverride - Explicit 1–2 char badge text. Required for any route inside
 *   a system color family (demo / tests / admin). Without it, a generic fallback letter
 *   is used — always override it.
 */
export function generateFaviconMetadata(
  pathname: string,
  additionalMetadata?: Partial<Metadata>,
  letterOverride?: string,
): Metadata {
  let config = getFaviconConfigByPath(pathname);

  // Apply the letter override — keeps the resolved color but replaces the letter.
  if (config && letterOverride) {
    config = { ...config, letter: letterOverride };
  }

  if (!config) {
    // Return empty metadata if no config found
    return additionalMetadata ?? {};
  }

  const svg = generateSVGFavicon(config);
  const dataURI = svgToDataURI(svg);

  const faviconIcons = {
    icon: [{ url: dataURI, type: "image/svg+xml" }],
  };

  // Merge with additional metadata if provided
  if (additionalMetadata) {
    const result: Metadata = {
      ...additionalMetadata,
    };

    // Merge icons properly - prioritize our favicon icon
    if (additionalMetadata.icons && isMetadataIconsMap(additionalMetadata.icons)) {
      result.icons = {
        ...additionalMetadata.icons,
        ...faviconIcons,
      };
    } else {
      result.icons = faviconIcons;
    }

    return result;
  }

  return {
    icons: faviconIcons,
  };
}

/**
 * Helper to create a favicon metadata object with custom config
 * Useful for routes that don't have a navigation link but still need a unique favicon
 * @param config - Custom favicon configuration
 * @param additionalMetadata - Additional metadata to merge
 * @returns Metadata object for Next.js
 */
export function createCustomFaviconMetadata(
  config: FaviconConfig,
  additionalMetadata?: Partial<Metadata>,
): Metadata {
  const svg = generateSVGFavicon(config);
  const dataURI = svgToDataURI(svg);

  const faviconIcons = {
    icon: [{ url: dataURI, type: "image/svg+xml" }],
  };

  if (additionalMetadata) {
    const result: Metadata = {
      ...additionalMetadata,
    };

    // Merge icons properly - prioritize our favicon icon
    if (additionalMetadata.icons && isMetadataIconsMap(additionalMetadata.icons)) {
      result.icons = {
        ...additionalMetadata.icons,
        ...faviconIcons,
      };
    } else {
      result.icons = faviconIcons;
    }

    return result;
  }

  return {
    icons: faviconIcons,
  };
}

/**
 * Gets all routes that have favicon configurations
 * Useful for generating static favicons or documentation
 */
export function getAllRoutesWithFavicons() {
  return faviconRouteData
    .filter(
      (link): link is FaviconRouteEntry & { favicon: FaviconConfig } =>
        link.favicon !== undefined,
    )
    .map((link) => ({
      href: link.href,
      favicon: link.favicon,
    }));
}
