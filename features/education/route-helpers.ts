// features/education/route-helpers.ts
//
// Shared helpers for the dynamic axis routes so each route file stays a thin
// wrapper over the data-driven renderers. Server-only (used in route modules).
import type { Metadata } from "next";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import { getAxisEntries, getAxisEntry } from "./data/registry";
import { EDU_TOOL_BY_SLUG } from "./data/tools";
import { EDU_AXIS_BY_ID, EDU_ORIGIN, eduHref } from "./constants";
import type { EduAxisId } from "./types";

/**
 * Static params for an axis's [slug] route — every non-planned entry (incl.
 * index-hidden leaves like grade pages, which are real, linkable URLs). Pair
 * with `export const dynamicParams = true` + `revalidate` in the route so new
 * entries still render on demand.
 */
export function axisStaticParams(axisId: EduAxisId): { slug: string }[] {
  return getAxisEntries(axisId)
    .filter((e) => e.status !== "planned")
    .map((e) => ({ slug: e.slug }));
}

/**
 * Build per-entry metadata for an axis detail page, or a sensible fallback.
 * `metadataBase` is pinned to `EDU_ORIGIN` (not inherited from the root
 * layout) so `canonicalPath` and any relative OG image resolve against the
 * configured public education origin — aimatrx.com by default, learn.aimatrx.com
 * once `NEXT_PUBLIC_EDU_ORIGIN` is set. See `constants.ts#EDU_ORIGIN`.
 */
export function axisDetailMetadata(axisId: EduAxisId, slug: string): Metadata {
  const entry = getAxisEntry(axisId, slug);
  const axis = EDU_AXIS_BY_ID[axisId];
  if (!entry) {
    return createDynamicRouteMetadata("/education", {
      title: "Education",
      description: "AI Matrx Education",
      letter: axis?.letter ?? "Ed",
      metadataBase: EDU_ORIGIN,
    });
  }
  return createDynamicRouteMetadata("/education", {
    titlePrefix: axis.label,
    title: entry.name,
    description: entry.description,
    letter: entry.letter,
    keywords: entry.keywords,
    canonicalPath: eduHref(axis.segment, slug),
    metadataBase: EDU_ORIGIN,
  });
}

/** Metadata for a coming-soon tool route, derived from the tools registry. */
export function toolMetadata(slug: string): Metadata {
  const tool = EDU_TOOL_BY_SLUG[slug];
  if (!tool) {
    return createDynamicRouteMetadata("/education", {
      title: "Education",
      description: "AI Matrx Education",
      letter: "Ed",
      metadataBase: EDU_ORIGIN,
    });
  }
  return createDynamicRouteMetadata("/education", {
    titlePrefix: "Study",
    title: tool.name,
    description: tool.description,
    letter: tool.letter,
    canonicalPath: eduHref(slug),
    metadataBase: EDU_ORIGIN,
  });
}
