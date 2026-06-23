"use client";

import { useMemo } from "react";
import type { ToolRendererProps } from "../../types";
import { resultAsObject } from "../_shared";
import { SerpToolInline } from "../seo-shared/SerpToolInline";
import { titleItemToEntry, type SeoTitlesResult } from "@/features/seo/serp/types";

/**
 * Inline renderer for `seo_check_meta_titles`. Renders each title as a real
 * simulated Google result (title + URL line, description omitted) via the
 * shared `SerpToolInline`.
 */
export function SeoMetaTitlesInline({
  entry,
  onOpenOverlay,
  toolGroupId,
}: ToolRendererProps) {
  const entries = useMemo(() => {
    const obj = resultAsObject(entry) as unknown as SeoTitlesResult | null;
    if (!obj?.title_analysis?.length) return [];
    return obj.title_analysis.map(titleItemToEntry);
  }, [entry]);

  if (!entries.length) return null;

  return (
    <SerpToolInline
      entries={entries}
      noun="title"
      descriptionPlaceholder={null}
      onOpenOverlay={onOpenOverlay}
      toolGroupId={toolGroupId}
    />
  );
}
