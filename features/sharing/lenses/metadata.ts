/**
 * Share-lens metadata — the SERVER-SAFE half of the lens registry.
 *
 * `generateMetadata` (and, next, the OG image route) must not import the
 * client renderers, so per-lens social/meta extraction lives here, keyed on
 * the entity token exactly like `./registry.tsx`. A lens without an entry
 * falls back to the generic title/description — the same floor guarantee as
 * the render side.
 */

import { readKeywordResearchArtifact } from "@/features/marketing/seo/keyword-research/data/artifact";
import type { ResolvedShareToken } from "@/utils/permissions/shareLinks";

export interface ShareLensMeta {
  title: string;
  description: string;
}

type ShareLensMetaResolver = (result: ResolvedShareToken) => ShareLensMeta | null;

function genericTitle(resource: Record<string, unknown> | undefined): string | null {
  if (!resource) return null;
  for (const k of ["label", "title", "name", "display_label", "file_name", "folder_name"]) {
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

/**
 * Kind-instance meta — POLYMORPHIC token, so it dispatches on the data shape
 * exactly like the renderer (`./kind-instance.tsx`) and returns null for any
 * kind without a presentation, which falls back to the generic title/desc.
 */
function kindInstanceMeta(result: ResolvedShareToken): ShareLensMeta | null {
  const artifact = readKeywordResearchArtifact(result.resource?.["data"]);
  if (!artifact) return null;
  const lists = artifact.keyword_lists ?? [];
  const keywordCount = lists.reduce(
    (total, list) => total + (list.keywords?.length ?? 0),
    0,
  );
  return {
    title: `Keyword research: ${artifact.primary_keyword}`,
    description: `${keywordCount} related keywords across ${lists.length} ${
      lists.length === 1 ? "cluster" : "clusters"
    } — with search volume, competition, CPC, and buyer intent for “${artifact.primary_keyword}”.`,
  };
}

const SHARE_LENS_META: Record<string, ShareLensMetaResolver> = {
  seo_collection_run: aiVisibilityMeta,
  content_ir_kind_instance: kindInstanceMeta,
};

/**
 * Per-lens OG-image payloads (the social-card image, `opengraph-image.tsx`).
 * A lens without an entry gets the branded generic card — same floor
 * guarantee as render + meta. The OG route owns the JSX; this module owns the
 * per-token data extraction so the route never sniffs resource shapes.
 */
export type ShareLensOg =
  | {
      kind: "ai_visibility";
      brand: string;
      query: string;
      enginesChecked: number;
      mentions: number;
      bestRank: number | null;
    }
  | { kind: "generic"; badge: string; title: string; description: string };

function aiVisibilityOg(result: ResolvedShareToken): ShareLensOg | null {
  const stored = result.resource?.["result"];
  if (!stored || typeof stored !== "object" || Array.isArray(stored))
    return null;
  const report = stored as Record<string, unknown>;
  if (report.result_kind !== "ai_visibility.analyze") return null;
  const providers = Array.isArray(report.providers)
    ? report.providers.filter(
        (value): value is Record<string, unknown> =>
          Boolean(value) && typeof value === "object" && !Array.isArray(value),
      )
    : [];
  const completed = providers.filter(
    (provider) => provider.status === "completed",
  );
  const ranks = completed
    .map((provider) => provider.target_recommendation_rank)
    .filter((value): value is number => typeof value === "number");
  return {
    kind: "ai_visibility",
    brand:
      typeof report.brand_name === "string"
        ? report.brand_name
        : "AI Visibility",
    query:
      typeof report.query === "string"
        ? report.query
        : "See how answer engines recommend this brand",
    enginesChecked: completed.length,
    mentions: completed.filter(
      (provider) => provider.target_mentioned === true,
    ).length,
    bestRank: ranks.length ? Math.min(...ranks) : null,
  };
}

/**
 * Kind-instance OG card: the branded generic card, but badged with the KIND
 * ("Keyword research") instead of the token's label ("Kind Instance"), which
 * means nothing to a recipient. Unrecognized kinds return null → generic.
 */
function kindInstanceOg(result: ResolvedShareToken): ShareLensOg | null {
  const meta = kindInstanceMeta(result);
  if (!meta) return null;
  return {
    kind: "generic",
    badge: "Keyword research",
    title: meta.title,
    description: meta.description,
  };
}

const SHARE_LENS_OG: Record<
  string,
  (result: ResolvedShareToken) => ShareLensOg | null
> = {
  seo_collection_run: aiVisibilityOg,
  content_ir_kind_instance: kindInstanceOg,
};

/** Resolve the OG-image payload for a resolved token — always returns a value. */
export function resolveShareLensOg(result: ResolvedShareToken): ShareLensOg {
  const resolver = result.resourceType
    ? SHARE_LENS_OG[result.resourceType]
    : undefined;
  const lensOg = resolver ? resolver(result) : null;
  if (lensOg) return lensOg;
  const meta = resolveShareLensMeta(result);
  return {
    kind: "generic",
    badge: result.displayLabel ?? "Shared item",
    title: meta.title,
    description: meta.description,
  };
}

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
