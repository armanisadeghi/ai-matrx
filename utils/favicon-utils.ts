// File: @/utils/favicon-utils.ts
// Utilities for managing dynamic favicons across the application

import {
  faviconRouteData,
  type FaviconConfig,
  type FaviconRouteEntry,
} from "@/constants/favicon-route-data";
import { Metadata } from "next";

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

/**
 * Generates an SVG favicon optimised for browser-tab rendering (~16–32px).
 *
 * Design choices for small-size legibility:
 * - Slightly smaller corner radius (rx=10) keeps more of the colour field visible
 * - Slightly lighter inner text shadow improves contrast on coloured backgrounds
 * - 2-char letters use a condensed letter-spacing so they fit without crowding
 */
export function generateSVGFavicon(config: FaviconConfig): string {
  const { color, letter, emoji } = config;
  const displayText = emoji || letter || "M";
  const len = displayText.length;

  // Font sizes tuned so the glyph fills the 64×64 canvas at the right weight
  const fontSize = len === 1 ? "46" : len === 2 ? "34" : "26";
  // Optical vertical centering for cap-height (not ascender)
  const yPosition = len === 1 ? "55" : len === 2 ? "53" : "52";
  // Tighten letter-spacing for 2-char combos so both letters stay inside the badge
  const letterSpacing = len === 2 ? "-1" : "0";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${color}" rx="10"/><text x="32" y="${yPosition}" font-family="system-ui,-apple-system,sans-serif" font-size="${fontSize}" font-weight="800" fill="white" text-anchor="middle" letter-spacing="${letterSpacing}">${displayText}</text></svg>`;
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
    return (additionalMetadata || {}) as Metadata;
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
    if (
      additionalMetadata.icons &&
      typeof additionalMetadata.icons === "object" &&
      !Array.isArray(additionalMetadata.icons)
    ) {
      result.icons = {
        ...(additionalMetadata.icons as Record<string, any>),
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
    if (
      additionalMetadata.icons &&
      typeof additionalMetadata.icons === "object" &&
      !Array.isArray(additionalMetadata.icons)
    ) {
      result.icons = {
        ...(additionalMetadata.icons as Record<string, any>),
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
    .filter((link) => link.favicon)
    .map((link) => ({
      href: link.href,
      favicon: link.favicon!,
    }));
}
