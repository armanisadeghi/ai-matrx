"use client";

import { useScraperKeywordSearchForm } from "@/features/scraper/hooks/useScraperKeywordSearchForm";
import { ScraperKeywordSearchPageBody } from "@/features/scraper/parts/ScraperKeywordSearchPanel";
import { ScraperSurfaceMount } from "@/features/scraper/agent-context/ScraperSurfaceMount";
import { RESULT_LIMIT_DEFAULT } from "@/features/scraper/scrape-command";

export default function ScraperSearchPage() {
  const form = useScraperKeywordSearchForm();

  return (
    // `matrx-user/scraper` — the web-search mount. Nothing is scraped here, so
    // it owns the keyword, the result budget and which hit is open; there is
    // no single-URL input and no page budget on this view.
    <ScraperSurfaceMount
      context={{
        mode: "web",
        selected: null,
        activeTab: "pretty",
        failureReason: form.hasError ? form.error : null,
        searchKeyword: form.keywords,
        maxResults: parseInt(form.maxResults, 10) || RESULT_LIMIT_DEFAULT,
        searchHits: form.flatResults,
        selectedHitIndex: form.selectedHitIndex,
        isScraping: form.isLoading,
      }}
      write={{
        setKeyword: form.setKeywords,
        setMaxResults: (value) => form.setMaxResults(String(value)),
        selectSearchHit: (index) => form.setSelectedHitIndex(index),
        hitCount: form.flatResults.length,
        notHereHint:
          "This is the Search route, which searches without scraping. Open /scraper/quick for a single URL, /scraper/search-and-scrape to search and scrape, or the floating Web Scraper workspace, which owns every mode at once.",
      }}
    >
      <div
        className="h-full flex flex-col overflow-hidden bg-textured"
        style={{ paddingTop: "var(--shell-header-h)" }}
      >
        <ScraperKeywordSearchPageBody form={form} />
      </div>
    </ScraperSurfaceMount>
  );
}
