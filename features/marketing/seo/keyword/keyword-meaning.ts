"use client";

/**
 * THE KEYWORD'S MEANING, in one read — what the NEW keyword-intelligence
 * system says about a single keyword on a single site.
 *
 * Why this file exists: the Keyword Intelligence window is the shared dossier
 * that twelve surfaces open, and until 2026-08-24 it showed the 13 retired
 * mirror facets (Intent · Funnel stage · Specificity …) and nothing at all
 * from the stamp system — no Class, no Service, no Score, no Level, no
 * receipt. The facts were in the database and invisible in the one place a
 * curious person actually looks.
 *
 * It composes the canonical reads and adds NO read or write of its own:
 *   • Class · Score · Level · the receipt → `seo.gsc_keyword_value_for`
 *     (search-console/data-insights.ts — ONE resolver, never re-derived here)
 *   • Service (topic placement) + lineage → `seo.gsc_keyword_topics_for`
 *   • Every dimension stamp + provenance → `seo.gsc_keyword_stamps_for`
 *   • The dimension vocabulary itself   → `seo.facet_dimension_catalog`
 *
 * THE SCOPE RULE still holds: every one of those RPCs is asked for exactly the
 * one keyword being shown, never the site.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md
 *      common-docs/projects/keyword-intelligence-convergence/ADOPTION-SWEEP.md (gap 1)
 */

import { useQuery } from "@tanstack/react-query";

import {
  getGscKeywordValueFor,
  type GscKeywordValueRow,
} from "@/features/marketing/search-console/data-insights";
import {
  getKeywordServices,
  getKeywordStamps,
  type KeywordServicePlacement,
  type KeywordStamp,
} from "@/features/marketing/seo/keyword-workbench/data";
import {
  getFacetDimensionCatalog,
  type FacetDimension,
} from "@/features/marketing/seo/value-system/dimensions/data";

export interface KeywordMeaning {
  /** Class / Score / Level / receipt, straight from the one resolver. */
  value: GscKeywordValueRow | null;
  /** Where this keyword sits on the service tree, with its lineage. */
  service: KeywordServicePlacement | null;
  /** Every dimension answer this keyword carries, with provenance. */
  stamps: KeywordStamp[];
  /** Dimensions with NO answer yet — the honest other half of the dossier. */
  unanswered: FacetDimension[];
  /** The site's dimension vocabulary (for pickers and labels). */
  dimensions: FacetDimension[];
}

const EMPTY: KeywordMeaning = {
  value: null,
  service: null,
  stamps: [],
  unanswered: [],
  dimensions: [],
};

export const keywordMeaningKey = (
  siteId: string | null | undefined,
  keywordId: string | null | undefined,
) => ["marketing", "seo", "keyword-meaning", siteId ?? "", keywordId ?? ""] as const;

export async function getKeywordMeaning(
  siteId: string,
  keywordId: string,
  signal?: AbortSignal,
): Promise<KeywordMeaning> {
  const dimensions = await getFacetDimensionCatalog(siteId, signal);
  const slugs = dimensions.map((dimension) => dimension.slug);
  const [valueMap, serviceMap, stampMap] = await Promise.all([
    getGscKeywordValueFor(siteId, [keywordId], signal),
    getKeywordServices(siteId, [keywordId], signal),
    slugs.length > 0
      ? getKeywordStamps(siteId, [keywordId], slugs, signal)
      : Promise.resolve(new Map()),
  ]);
  const byDimension = stampMap.get(keywordId) ?? new Map<string, KeywordStamp>();
  const stamps = dimensions.flatMap((dimension) => {
    const stamp = byDimension.get(dimension.slug);
    return stamp ? [stamp] : [];
  });
  return {
    value: valueMap.get(keywordId) ?? null,
    service: serviceMap.get(keywordId) ?? null,
    stamps,
    unanswered: dimensions.filter((dimension) => !byDimension.has(dimension.slug)),
    dimensions,
  };
}

/**
 * The dossier's meaning half. Returns the EMPTY shape (never throws into the
 * caller's render) when there is no site binding or no library keyword — the
 * window is legitimately global in that case, and the panel says so itself.
 */
export function useKeywordMeaning(
  siteId: string | null | undefined,
  keywordId: string | null | undefined,
) {
  const enabled = Boolean(siteId && keywordId);
  const query = useQuery({
    queryKey: keywordMeaningKey(siteId, keywordId),
    queryFn: ({ signal }) => getKeywordMeaning(siteId!, keywordId!, signal),
    enabled,
    staleTime: 60_000,
  });
  return { ...query, data: query.data ?? EMPTY, enabled };
}

/**
 * The machine payload every consumer attaches — Copy-for-AI, the surface
 * scope, and the keyword brief all read THIS, so an agent launched from any
 * keyword surface sees the same class/service/score/level the human does.
 */
export function keywordMeaningPayload(
  meaning: KeywordMeaning,
): Record<string, unknown> | null {
  const { value, service, stamps } = meaning;
  if (!value && !service && stamps.length === 0) return null;
  return {
    class: value?.traffic_class ?? null,
    class_source: value?.class_source ?? null,
    service: service?.topicName ?? null,
    service_lineage: service?.lineage ?? null,
    service_assigned_by: service?.assignedBy ?? null,
    score: value?.value_score ?? null,
    level: value?.value_band ?? null,
    level_source: value?.value_source ?? null,
    receipt: value?.reasons ?? [],
    stamps: stamps.map((stamp) => ({
      dimension: stamp.dimension,
      dimension_label: stamp.dimensionLabel,
      value: stamp.value,
      value_label: stamp.valueLabel,
      source: stamp.source,
      pinned: stamp.pinned,
      notes: stamp.notes,
    })),
    unanswered_dimensions: meaning.unanswered.map((d) => d.slug),
  };
}

/** Human lines for `webCopy({ lines })` envelopes. */
export function keywordMeaningLines(
  meaning: KeywordMeaning,
): [string, string][] {
  const { value, service, stamps } = meaning;
  const lines: [string, string][] = [];
  if (value) {
    lines.push([
      "This site's verdict",
      `Class ${value.traffic_class ?? "not set"} · Level ${value.value_band ?? "unvalued"} · Score ${
        value.value_score === null || value.value_score === undefined
          ? "—"
          : Math.round(Number(value.value_score))
      } (${value.value_source ?? "unvalued"})`,
    ]);
  }
  if (service) {
    lines.push([
      "Service",
      service.lineage
        ? `${service.lineage} › ${service.topicName}`
        : service.topicName,
    ]);
  }
  if (stamps.length > 0) {
    lines.push([
      "Dimension answers",
      stamps
        .map(
          (stamp) =>
            `${stamp.dimensionLabel}: ${stamp.valueLabel}${stamp.pinned ? " (yours)" : ""}`,
        )
        .join(" · "),
    ]);
  }
  return lines;
}
