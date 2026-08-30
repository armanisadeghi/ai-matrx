import KeywordResearchWorkbench from "@/features/marketing/seo/keyword-research/components/KeywordResearchWorkbench";

/**
 * Keyword research — map keyword relationships with AI research and explore
 * live market data. The workbench itself is site-agnostic (it researches a
 * market, not a property); it lives inside the site's keyword family because
 * that is where the work starts.
 *
 * Moved from the flat `/marketing/keyword-research`; no PageHeader here — the
 * site shell above already owns the route chrome.
 */
export default function MarketingSeoKeywordResearchPage() {
  return <KeywordResearchWorkbench />;
}
