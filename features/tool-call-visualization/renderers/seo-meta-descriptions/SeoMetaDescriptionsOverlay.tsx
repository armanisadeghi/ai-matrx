"use client";

import { useMemo } from "react";
import type { ToolRendererProps } from "../../types";
import { resultAsObject } from "../_shared";
import { SerpToolOverlay } from "../seo-shared/SerpToolOverlay";
import {
  descriptionItemToEntry,
  type SeoDescriptionsResult,
} from "@/features/seo/serp/types";

/**
 * Overlay renderer for `seo_check_meta_descriptions` — descriptions staged as
 * a Google search-results page (description as the snippet) with
 * desktop/mobile width validation.
 */
export function SeoMetaDescriptionsOverlay({ entry }: ToolRendererProps) {
  const entries = useMemo(() => {
    const obj = resultAsObject(entry) as unknown as SeoDescriptionsResult | null;
    if (!obj?.description_analysis?.length) return [];
    return obj.description_analysis.map(descriptionItemToEntry);
  }, [entry]);

  return <SerpToolOverlay entries={entries} noun="description" />;
}
