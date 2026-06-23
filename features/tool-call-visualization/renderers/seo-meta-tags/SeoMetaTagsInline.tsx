"use client";

import { useMemo } from "react";
import type { ToolRendererProps } from "../../types";
import { resultAsObject } from "../_shared";
import { SerpToolInline } from "../seo-shared/SerpToolInline";
import { batchItemToEntry, type SeoMetaTagsResult } from "@/features/seo/serp/types";

/**
 * Inline renderer for `seo_check_meta_tags_batch`. Renders each analyzed
 * title+description as a real simulated Google result via the shared
 * `SerpToolInline` (same `SerpResult` primitive as the calculator page).
 */
export function SeoMetaTagsInline({
  entry,
  onOpenOverlay,
  toolGroupId,
}: ToolRendererProps) {
  const entries = useMemo(() => {
    const obj = resultAsObject(entry) as unknown as SeoMetaTagsResult | null;
    if (!obj?.batch_analysis?.length) return [];
    return obj.batch_analysis.map(batchItemToEntry);
  }, [entry]);

  if (!entries.length) return null;

  return (
    <SerpToolInline
      entries={entries}
      noun="meta tag"
      onOpenOverlay={onOpenOverlay}
      toolGroupId={toolGroupId}
    />
  );
}
