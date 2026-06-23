"use client";

import { useMemo } from "react";
import type { ToolRendererProps } from "../../types";
import { resultAsObject } from "../_shared";
import { SerpToolOverlay } from "../seo-shared/SerpToolOverlay";
import { titleItemToEntry, type SeoTitlesResult } from "@/features/seo/serp/types";

/**
 * Overlay renderer for `seo_check_meta_titles` — titles staged as a Google
 * search-results page (title + URL line) with desktop/mobile width validation.
 */
export function SeoMetaTitlesOverlay({ entry }: ToolRendererProps) {
  const entries = useMemo(() => {
    const obj = resultAsObject(entry) as unknown as SeoTitlesResult | null;
    if (!obj?.title_analysis?.length) return [];
    return obj.title_analysis.map(titleItemToEntry);
  }, [entry]);

  return (
    <SerpToolOverlay entries={entries} noun="title" descriptionPlaceholder={null} />
  );
}
