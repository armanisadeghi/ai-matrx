"use client";

import { useMemo } from "react";
import type { ToolRendererProps } from "../../types";
import { resultAsObject } from "../_shared";
import { SerpToolOverlay } from "../seo-shared/SerpToolOverlay";
import { batchItemToEntry, type SeoMetaTagsResult } from "@/features/seo/serp/types";

/**
 * Overlay renderer for `seo_check_meta_tags_batch` — the analyzed meta tags
 * staged as a full Google search-results page with per-result validation,
 * via the shared `SerpToolOverlay`. No header (the ToolGroupTab supplies it).
 */
export function SeoMetaTagsOverlay({ entry }: ToolRendererProps) {
  const entries = useMemo(() => {
    const obj = resultAsObject(entry) as unknown as SeoMetaTagsResult | null;
    if (!obj?.batch_analysis?.length) return [];
    return obj.batch_analysis.map(batchItemToEntry);
  }, [entry]);

  return <SerpToolOverlay entries={entries} noun="meta tag" />;
}
