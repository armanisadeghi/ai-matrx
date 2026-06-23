"use client";

import { useMemo } from "react";
import type { ToolRendererProps } from "../../types";
import { resultAsObject } from "../_shared";
import { SerpToolInline } from "../seo-shared/SerpToolInline";
import {
  descriptionItemToEntry,
  type SeoDescriptionsResult,
} from "@/features/seo/serp/types";

/**
 * Inline renderer for `seo_check_meta_descriptions`. Renders each description
 * as a real simulated Google result (description as the snippet, with a muted
 * title placeholder) via the shared `SerpToolInline`.
 */
export function SeoMetaDescriptionsInline({
  entry,
  onOpenOverlay,
  toolGroupId,
}: ToolRendererProps) {
  const entries = useMemo(() => {
    const obj = resultAsObject(entry) as unknown as SeoDescriptionsResult | null;
    if (!obj?.description_analysis?.length) return [];
    return obj.description_analysis.map(descriptionItemToEntry);
  }, [entry]);

  if (!entries.length) return null;

  return (
    <SerpToolInline
      entries={entries}
      noun="description"
      onOpenOverlay={onOpenOverlay}
      toolGroupId={toolGroupId}
    />
  );
}
