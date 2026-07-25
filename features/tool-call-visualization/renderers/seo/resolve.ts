/**
 * Result-shape resolver for the unified `seo` tool.
 *
 * The backend consolidated five SEO tools behind ONE `seo` tool that
 * dispatches on an `action` argument (aidream
 * `packages/matrx-ai/matrx_ai/tools/implementations/seo.py`):
 *
 *   check_batch        -> { batch_analysis, count }
 *   check_titles       -> { title_analysis, count }
 *   check_descriptions -> { description_analysis, count }
 *   keyword_data       -> { keywords_data, total_keywords, date_range, … }
 *   collect_rank       -> { receipt }
 *
 * We resolve on the RESULT SHAPE, with `action` only as a tiebreaker. That is
 * deliberate: the same resolver then also serves the three legacy tool names
 * (`seo_check_meta_tags_batch` / `_titles` / `_descriptions` /
 * `seo_get_keyword_data`) still present in persisted conversation history —
 * one renderer, every payload this platform has ever produced.
 */

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { resultAsObject } from "../_shared";
import {
  batchItemToEntry,
  descriptionItemToEntry,
  titleItemToEntry,
  type DescriptionAnalysisItem,
  type MetaTagBatchItem,
  type SerpEntry,
  type TitleAnalysisItem,
} from "@/features/marketing/seo/serp/types";
import {
  parseSeoKeywordData,
  type SeoKeywordDataResult,
} from "@/features/marketing/seo/keyword-research/types";
import {
  parseSeoCollectionReceipt,
  type SeoCollectionReceipt,
} from "@/features/marketing/seo/rank/types";

/** A meta check (batch / titles / descriptions) reduced to SERP entries. */
export interface SeoMetaVariant {
  kind: "meta";
  entries: SerpEntry[];
  /** Singular lowercase noun for this check, e.g. "meta tag". */
  noun: string;
  /** `null` omits the line in the simulated result entirely. */
  titlePlaceholder?: string | null;
  descriptionPlaceholder?: string | null;
  passed: number;
  failed: number;
}

export interface SeoKeywordVariant {
  kind: "keywords";
  data: SeoKeywordDataResult;
}

export interface SeoRankVariant {
  kind: "rank";
  receipt: SeoCollectionReceipt;
}

export type SeoVariant = SeoMetaVariant | SeoKeywordVariant | SeoRankVariant;

function metaVariant(
  entries: SerpEntry[],
  noun: string,
  placeholders: Pick<SeoMetaVariant, "titlePlaceholder" | "descriptionPlaceholder">,
): SeoMetaVariant {
  const passed = entries.filter((e) => e.overallOk).length;
  return {
    kind: "meta",
    entries,
    noun,
    ...placeholders,
    passed,
    failed: entries.length - passed,
  };
}

function objectArray<T>(raw: unknown): T[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is T => !!item && typeof item === "object" && !Array.isArray(item),
  );
}

/**
 * Resolve a tool entry to the variant its result carries, or `null` when the
 * payload is absent/unrecognized (the caller falls back to the generic view).
 */
export function resolveSeoVariant(entry: ToolLifecycleEntry): SeoVariant | null {
  const result = resultAsObject(entry);
  if (!result) return null;

  const batch = objectArray<MetaTagBatchItem>(result.batch_analysis);
  if (batch.length) {
    return metaVariant(batch.map(batchItemToEntry), "meta tag", {});
  }

  const titles = objectArray<TitleAnalysisItem>(result.title_analysis);
  if (titles.length) {
    return metaVariant(titles.map(titleItemToEntry), "title", {
      descriptionPlaceholder: null,
    });
  }

  const descriptions = objectArray<DescriptionAnalysisItem>(
    result.description_analysis,
  );
  if (descriptions.length) {
    return metaVariant(descriptions.map(descriptionItemToEntry), "description", {
      titlePlaceholder: null,
    });
  }

  const keywords = parseSeoKeywordData(result);
  if (keywords) return { kind: "keywords", data: keywords };

  const receipt = parseSeoCollectionReceipt(result.receipt);
  if (receipt) return { kind: "rank", receipt };

  return null;
}

/** The `action` argument, when the call carries one (unified tool only). */
export function seoAction(entry: ToolLifecycleEntry): string | null {
  const args = entry.arguments;
  if (!args || typeof args !== "object") return null;
  const action = (args as Record<string, unknown>).action;
  return typeof action === "string" ? action : null;
}

/** Card title for a resolved variant — what the user reads first. */
export function seoVariantTitle(variant: SeoVariant): string {
  switch (variant.kind) {
    case "meta": {
      const n = variant.entries.length;
      return `${n} ${variant.noun}${n === 1 ? "" : "s"} analyzed`;
    }
    case "keywords": {
      const n = variant.data.keywords_data.length;
      return `${n} keyword${n === 1 ? "" : "s"} researched`;
    }
    case "rank":
      return "Rank check recorded";
  }
}

/** Quiet sub-line beneath the card title. */
export function seoVariantSub(variant: SeoVariant): string | null {
  switch (variant.kind) {
    case "meta":
      return variant.failed > 0
        ? `${variant.passed} passing · ${variant.failed} need attention`
        : `All ${variant.passed} passing`;
    case "keywords": {
      const { from, to } = variant.data.date_range;
      return from && to ? `${from} → ${to}` : null;
    }
    case "rank": {
      const { created_observations, existing_observations } = variant.receipt;
      const total = created_observations + existing_observations;
      return `${total} observation${total === 1 ? "" : "s"}`;
    }
  }
}
