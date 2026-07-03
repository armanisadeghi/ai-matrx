/**
 * Resolve canonical `ui_surface.url_pattern` values from code.
 *
 * Priority:
 *   1. Explicit `SurfaceManifest.urlPattern`
 *   2. Inverted `SURFACE_BY_ROUTE_PREFIX` (shortest prefix per surface)
 *   3. Heuristic `/<local-slug>` for simple matrx-user page surfaces
 *
 * Used by manifest sync to backfill `ui.ui_surface.url_pattern` during
 * registration — the column existed in the schema but was never wired into
 * the sync pipeline.
 */

import type { SurfaceManifest } from "@/features/surfaces/types";
import { SURFACE_ROUTE_MAPPINGS } from "@/features/surfaces/utils/route-to-surface";

/** Explicit overrides where the route prefix alone is not the right pattern. */
const URL_PATTERN_OVERRIDES: Readonly<Record<string, string>> = {
  "matrx-admin/system-agents": "/administration",
  "matrx-user/chat": "/chat",
  "matrx-user/code-editor": "/code-editor",
  "matrx-user/transcript-scribe": "/transcripts/scribe/:sessionId",
  "matrx-user/transcript-scribe-live": "/transcripts/scribe/:sessionId",
  "matrx-user/chat-voice": "/chat/voice",
};

function buildDefaultUrlPatternMap(): ReadonlyMap<string, string> {
  const bySurface = new Map<string, string>();

  for (const { prefix, surface } of SURFACE_ROUTE_MAPPINGS) {
    const override = URL_PATTERN_OVERRIDES[surface];
    const candidate = override ?? prefix.replace(/\/$/, "");
    const existing = bySurface.get(surface);
    if (!existing || candidate.length < existing.length) {
      bySurface.set(surface, candidate);
    }
  }

  return bySurface;
}

const DEFAULT_URL_PATTERN_BY_SURFACE = buildDefaultUrlPatternMap();

/** Heuristic for page surfaces not yet listed in the route map. */
function heuristicUrlPattern(surfaceName: string): string | null {
  const slash = surfaceName.indexOf("/");
  if (slash < 0) return null;
  const client = surfaceName.slice(0, slash);
  const local = surfaceName.slice(slash + 1);
  if (!local || local.includes("/")) return null;

  if (client === "matrx-user") {
    return `/${local}`;
  }
  if (client === "matrx-admin") {
    return `/administration/${local}`;
  }
  if (client === "matrx-public") {
    return `/${local}`;
  }
  return null;
}

/** Default url_pattern for a surface when the manifest does not declare one. */
export function getDefaultUrlPatternForSurface(
  surfaceName: string,
): string | null {
  return (
    URL_PATTERN_OVERRIDES[surfaceName] ??
    DEFAULT_URL_PATTERN_BY_SURFACE.get(surfaceName) ??
    heuristicUrlPattern(surfaceName)
  );
}

/**
 * Resolve the url_pattern a manifest sync should write for this surface.
 * Returns null when no canonical pattern is known.
 */
export function resolveSurfaceUrlPattern(
  manifest: Pick<SurfaceManifest, "surfaceName" | "urlPattern">,
): string | null {
  const explicit = manifest.urlPattern?.trim();
  if (explicit) return explicit;
  return getDefaultUrlPatternForSurface(manifest.surfaceName);
}
