/**
 * One-shot analysis MANDATES mounted on full-scrape result tabs.
 *
 * Each tab resolves its mandate at render time (`useMandate`) and runs the
 * resolved Holder at call time (`useScraperAgentAnalysis` → `resolveMandate`).
 * Both mandates are declared against provision `scraper.page_analysis`, which
 * offers `content` — the scraped page text — so the tabs send exactly that
 * variable. No agent id lives here: binding an agent to a tab is a rebind on
 * /agents/mandates, never a code change. An unresolved mandate (not yet seeded
 * or bound) renders the tab's unbound state with the picker + the door — it
 * never silently runs a hardcoded id.
 */
export const SCRAPER_ANALYSIS_MANDATES = {
  factChecker: "scraper.fact_check",
  keywordAnalysis: "scraper.keyword_analysis",
} as const;

/** The `scraper.page_analysis` provision's offered value carrying the page text. */
export const SCRAPER_ANALYSIS_CONTENT_VARIABLE = "content";
