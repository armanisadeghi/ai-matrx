// File: @/utils/route-metadata.ts
// Helpers for generating route metadata with favicons, OpenGraph, and Twitter cards.
//
// TAB TITLE RULE: specific word FIRST, category LAST.
//   ✅  "Build | Agents"   ← first word differs per tab — easy to scan
//   ❌  "Agents Build"     ← all Agents tabs start the same — impossible to scan
//
// FAVICON LETTER RULE: every route should have a UNIQUE letter badge.
//   - For system color families (demo/tests/admin): color is fixed, letter MUST be unique per route.
//   - For primary routes: color + letter come from `favicon-route-data` (nav hrefs are defined in `features/shell/constants/nav-data.ts`).
//   - Pass `letter` to override or supply a per-route badge when needed.
//
// The root (a)/layout.tsx sets template: "%s — AI Matrx".
// These helpers set only the %s portion — do NOT append "| AI Matrx" here.

import { Metadata } from "next";
import { generateFaviconMetadata } from "./favicon-utils";
import { siteConfig } from "@/config/extras/site";

/**
 * Creates metadata for a static route layout.
 *
 * `title`       — the %s for the root template. Pass the section name for root
 *                 layouts ("Agents"), or use `titlePrefix` for sub-layouts.
 * `titlePrefix` — specific word shown FIRST in the tab:
 *                 titlePrefix="Build" + title="Agents" → "Build | Agents — AI Matrx"
 * `letter`      — 1–2 char badge for the favicon. REQUIRED for routes inside a
 *                 system color family (demo / tests / admin) — every route in the
 *                 family must use a UNIQUE letter so tabs are distinguishable.
 *                 Optional for primary routes (falls back to favicon-route-data match).
 *
 * @example
 * // Root section layout (primary route — letter from favicon-route-data)
 * export const metadata = createRouteMetadata("/agents", {
 *   title: "Agents",
 *   description: "Build, configure, and deploy AI agents",
 * });
 *
 * @example
 * // Sub-section layout — specific word first + unique letter
 * export const metadata = createRouteMetadata("/agents", {
 *   titlePrefix: "Build",
 *   title: "Agents",
 *   description: "Configure and build an AI agent",
 *   letter: "AB",   // "Agent Builder" — unique across all open Agents tabs
 * });
 *
 * @example
 * // Demo sub-route — letter is REQUIRED and must be unique per demo
 * export const metadata = createRouteMetadata("/demo", {
 *   titlePrefix: "Glass Header",
 *   title: "Demo",
 *   description: "Glass header component demo",
 *   letter: "GH",   // Never reuse this across other demo routes
 * });
 */
export function createRouteMetadata(
  pathname: string,
  options?: {
    title?: string;
    titlePrefix?: string;
    description?: string;
    /** Favicon badge text (1–2 chars). Required for demo/tests/admin routes. */
    letter?: string;
    /** SEO keywords for this route. */
    keywords?: string[];
    /** Self-referential canonical path, e.g. "/education/subjects". Resolves
     *  against `metadataBase` (set in app/config/metadata.ts). */
    canonicalPath?: string;
    additionalMetadata?: Partial<Metadata>;
  },
): Metadata {
  const { title, titlePrefix, description, letter, keywords, canonicalPath, additionalMetadata } =
    options || {};

  // Compose the browser-tab title: "Prefix | Section" or just "Section"
  const composedTitle =
    titlePrefix && title
      ? `${titlePrefix} | ${title} | AI Matrx Agentic Harness`
      : `${title} | AI Matrx Agentic Harness`;

  // OG/Twitter titles always include the brand name
  const socialTitle = composedTitle
    ? `${composedTitle} | AI Matrx`
    : "AI Matrx";

  const baseMetadata: Partial<Metadata> = {};

  if (composedTitle) {
    baseMetadata.title = composedTitle;
  }

  if (description) {
    baseMetadata.description = description;
  }

  if (keywords?.length) {
    baseMetadata.keywords = keywords;
  }

  if (canonicalPath) {
    baseMetadata.alternates = { canonical: canonicalPath };
  }

  if (!additionalMetadata?.openGraph && (composedTitle || description)) {
    baseMetadata.openGraph = {
      title: socialTitle,
      description: description || siteConfig.description,
      type: "website",
      siteName: "AI Matrx",
      images: [
        {
          url: siteConfig.ogImage,
          width: 1200,
          height: 630,
          alt: composedTitle || "AI Matrx",
        },
      ],
    };
  }

  if (!additionalMetadata?.twitter && (composedTitle || description)) {
    baseMetadata.twitter = {
      card: "summary_large_image",
      title: socialTitle,
      description: description || siteConfig.description,
      images: [siteConfig.ogImage],
    };
  }

  const mergedMetadata = {
    ...baseMetadata,
    ...additionalMetadata,
  };

  return generateFaviconMetadata(pathname, mergedMetadata, letter);
}

/**
 * Creates metadata for dynamic [id] routes where title/description come from
 * fetched data. Use inside `generateMetadata()` functions.
 *
 * `titlePrefix` — verb or context shown BEFORE the fetched name in the tab:
 *   titlePrefix="Run", title=agent.name → "Run | My Agent — AI Matrx"
 * `letter`      — favicon badge text. Required for demo/tests/admin routes.
 *   For dynamic agent sub-pages, derive from the action: "AB" (Agent Builder),
 *   "AR" (Agent Runner), etc.
 *
 * @example
 * export async function generateMetadata({ params }) {
 *   const { id } = await params;
 *   const agent = await getAgent(id);
 *   return createDynamicRouteMetadata("/agents", {
 *     title: agent.name,
 *     description: agent.description,
 *   });
 * }
 *
 * @example
 * // Agent Builder sub-page — unique badge per action type
 * return createDynamicRouteMetadata("/agents", {
 *   titlePrefix: "Build",
 *   title: agent.name,
 *   description: `Configure ${agent.name}`,
 *   letter: "AB",
 * });
 */
export function createDynamicRouteMetadata(
  pathname: string,
  options: {
    title: string;
    titlePrefix?: string;
    description?: string;
    /** Favicon badge text (1–2 chars). Required for demo/tests/admin routes. */
    letter?: string;
    ogImage?: string;
    /** SEO keywords for this route. */
    keywords?: string[];
    /** Self-referential canonical path; resolves against `metadataBase`. */
    canonicalPath?: string;
  },
): Metadata {
  const { title, titlePrefix, description, letter, ogImage, keywords, canonicalPath } = options;

  const composedTitle = titlePrefix ? `${titlePrefix} | ${title}` : title;
  const desc = description || siteConfig.description;
  const image = ogImage || siteConfig.ogImage;
  const socialTitle = `${composedTitle} | AI Matrx`;

  return generateFaviconMetadata(
    pathname,
    {
      title: composedTitle,
      description: desc,
      ...(keywords?.length ? { keywords } : {}),
      ...(canonicalPath ? { alternates: { canonical: canonicalPath } } : {}),
      openGraph: {
        title: socialTitle,
        description: desc,
        type: "website",
        siteName: "AI Matrx",
        images: [{ url: image, width: 1200, height: 630, alt: composedTitle }],
      },
      twitter: {
        card: "summary_large_image",
        title: socialTitle,
        description: desc,
        images: [image],
      },
    },
    letter,
  );
}

/**
 * Quick helper — only sets the favicon for a route, no other metadata changes.
 * Pass `letter` to set the badge text (required for demo/tests/admin routes).
 */
export function getRouteFavicon(pathname: string, letter?: string): Metadata {
  return generateFaviconMetadata(pathname, undefined, letter);
}
