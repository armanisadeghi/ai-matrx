"use client";

import { useScraperKeywordSearchForm } from "@/features/scraper/hooks/useScraperKeywordSearchForm";
import { ScraperKeywordSearchPageBody } from "@/features/scraper/parts/ScraperKeywordSearchPanel";

export default function ScraperSearchPage() {
  const form = useScraperKeywordSearchForm();

  return (
    <div className="h-page flex flex-col overflow-hidden bg-textured">
      <ScraperKeywordSearchPageBody form={form} />
    </div>
  );
}
