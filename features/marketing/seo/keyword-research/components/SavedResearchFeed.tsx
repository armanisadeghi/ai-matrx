"use client";

/**
 * Renders a durable keyword-research artifact with the SAME blocks the live
 * stream renders. Intent classifications are reconstructed from the canonical
 * `seo.keyword` rows written by the research pipeline.
 *
 * Selection is not passed here: the blocks source it from the mounted surface
 * (`keyword_selection` UI state + the `keyword_selection` write target), so
 * the saved view and the live view behave identically with no duplicated
 * interaction wiring. See KeywordResearchBlock's header.
 */

import { useQuery } from "@tanstack/react-query";

import KeywordClassificationBatchBlock from "@/components/mardown-display/blocks/keyword-research/KeywordClassificationBatchBlock";
import KeywordResearchBlock from "@/components/mardown-display/blocks/keyword-research/KeywordResearchBlock";
import {
  KEYWORD_CLASSIFICATION_FACT_KEYS,
  type KeywordClassificationBatchData,
  type KeywordRelationshipResearchData,
} from "@/features/content-ir/kinds/keyword-research";
import { listKeywordsWithMarketByPhrases } from "@/features/marketing/seo/keyword-research/data/queries";
import type { KeywordResearchArtifact } from "@/types/python-generated/stream-events";

export interface SavedResearchFeedProps {
  artifact: KeywordResearchArtifact;
}

export default function SavedResearchFeed({
  artifact,
}: SavedResearchFeedProps) {
  const phrases = [
    artifact.primary_keyword,
    ...(artifact.keyword_lists ?? []).flatMap((list) => list.keywords ?? []),
  ];
  const classifications = useQuery({
    queryKey: ["seo", "keyword-research", "classifications", ...phrases],
    queryFn: ({ signal }) =>
      listKeywordsWithMarketByPhrases(phrases, signal),
    enabled: phrases.length > 0,
  });

  const researchData: KeywordRelationshipResearchData = {
    primaryKeyword: artifact.primary_keyword,
    lists: (artifact.keyword_lists ?? []).map((list) => ({
      label: list.label,
      keywords: list.keywords ?? [],
      complete: true,
    })),
    isComplete: true,
  };

  const classificationData: KeywordClassificationBatchData = {
    classifierVersion:
      classifications.data?.find((row) => row.classifier_version)
        ?.classifier_version ?? null,
    results: (classifications.data ?? []).map((row) => {
      const facts: Record<string, string> = {};
      for (const key of KEYWORD_CLASSIFICATION_FACT_KEYS) {
        const value = row[key];
        if (typeof value === "string" && value && value !== "none") {
          facts[key] = value;
        }
      }
      return {
        phrase: row.phrase,
        facts,
        overallConfidence: row.classification_confidence,
        secondaryInterpretation: null,
        error: null,
        complete: true,
      };
    }),
    isComplete: true,
  };

  return (
    <div className="space-y-3">
      <KeywordResearchBlock serverData={researchData} />
      {classifications.isLoading ? (
        <div className="h-20 animate-pulse rounded-lg border border-border bg-muted/40" />
      ) : classificationData.results.length > 0 ? (
        <KeywordClassificationBatchBlock serverData={classificationData} />
      ) : null}
    </div>
  );
}
