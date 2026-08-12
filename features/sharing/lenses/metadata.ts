/**
 * Share-lens metadata — the SERVER-SAFE half of the lens registry.
 *
 * `generateMetadata` (and, next, the OG image route) must not import the
 * client renderers, so per-lens social/meta extraction lives here, keyed on
 * the entity token exactly like `./registry.tsx`. A lens without an entry
 * falls back to the generic title/description — the same floor guarantee as
 * the render side.
 */

import type { ResolvedShareToken } from "@/utils/permissions/shareLinks";

export interface ShareLensMeta {
  title: string;
  description: string;
}

type ShareLensMetaResolver = (result: ResolvedShareToken) => ShareLensMeta | null;

function genericTitle(resource: Record<string, unknown> | undefined): string | null {
  if (!resource) return null;
  for (const k of ["label", "title", "name", "display_label"]) {
    const v = resource[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

/** AI visibility report meta — moved verbatim from the /s/[token] page's
 * hard-coded sniff when the lens registry was extracted (2026-08-13). */
function aiVisibilityMeta(result: ResolvedShareToken): ShareLensMeta | null {
  const value = result.resource?.["result"];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const report = value as Record<string, unknown>;
  if (report.result_kind !== "ai_visibility.analyze") return null;
  const providers = Array.isArray(report.providers) ? report.providers : [];
  const hasCompletedAnswer = providers.some((provider) => {
    if (!provider || typeof provider !== "object" || Array.isArray(provider))
      return false;
    const item = provider as Record<string, unknown>;
    return (
      item.status === "completed" &&
      typeof item.answer_text === "string" &&
      item.answer_text.trim().length > 0
    );
  });
  if (!hasCompletedAnswer) return null;
  const brand =
    typeof report.brand_name === "string" ? report.brand_name : "this brand";
  const query =
    typeof report.query === "string" ? report.query : "a real buyer question";
  return {
    title: `${brand} AI Visibility Report`,
    description: `See how ChatGPT, Claude, Gemini, and Perplexity answer “${query}” — including brand position, mentions, citations, and decision signals.`,
  };
}

const SHARE_LENS_META: Record<string, ShareLensMetaResolver> = {
  seo_collection_run: aiVisibilityMeta,
};

/**
 * Resolve share metadata for a resolved token. Always returns a value: a
 * registered lens meta when available, else the generic floor.
 */
export function resolveShareLensMeta(result: ResolvedShareToken): ShareLensMeta {
  const resolver = result.resourceType
    ? SHARE_LENS_META[result.resourceType]
    : undefined;
  const lensMeta = resolver ? resolver(result) : null;
  if (lensMeta) return lensMeta;
  const title =
    genericTitle(result.resource) ?? result.displayLabel ?? "Shared item";
  return {
    title,
    description: `A ${result.displayLabel ?? "resource"} shared with you on AI Matrx.`,
  };
}
