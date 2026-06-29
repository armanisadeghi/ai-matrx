// features/education/route-helpers.ts
//
// Shared helpers for the dynamic axis routes so each route file stays a thin
// wrapper over the data-driven renderers. Server-only (used in route modules).
import type { Metadata } from "next";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import { getAxisEntry } from "./data/registry";
import { EDU_TOOL_BY_SLUG } from "./data/tools";
import { EDU_AXIS_BY_ID, eduHref } from "./constants";
import type { EduAxisId } from "./types";

/** Build per-entry metadata for an axis detail page, or a sensible fallback. */
export function axisDetailMetadata(axisId: EduAxisId, slug: string): Metadata {
  const entry = getAxisEntry(axisId, slug);
  const axis = EDU_AXIS_BY_ID[axisId];
  if (!entry) {
    return createDynamicRouteMetadata("/education", {
      title: "Education",
      description: "AI Matrx Education",
      letter: axis?.letter ?? "Ed",
    });
  }
  return createDynamicRouteMetadata("/education", {
    titlePrefix: axis.label,
    title: entry.name,
    description: entry.description,
    letter: entry.letter,
    keywords: entry.keywords,
    canonicalPath: eduHref(axis.segment, slug),
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
    });
  }
  return createDynamicRouteMetadata("/education", {
    titlePrefix: "Study",
    title: tool.name,
    description: tool.description,
    letter: tool.letter,
    canonicalPath: eduHref(slug),
  });
}
