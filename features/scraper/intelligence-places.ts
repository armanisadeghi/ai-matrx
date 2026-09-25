// features/scraper/intelligence-places.ts
//
// WHERE EACH SCRAPER JOB RUNS — drawn on /intelligence/scraper.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";
import { SCRAPER_ANALYSIS_MANDATES } from "./constants/analysis-agents";

export const SCRAPER_PLACES: FeaturePlaces = {
  feature: "scraper",
  label: "Scraper",
  aliases: { SCRAPER_ANALYSIS_MANDATES },
  roots: ["features/scraper"],
  places: [
    {
      id: "keywords",
      label: "A scraped page",
      trigger: "Keyword analysis tab",
      urlPattern: "/scraper/[id]",
      mandateKeys: [MANDATE_KEYS.scraper__keyword_analysis],
      sources: ["features/scraper/parts/agent-analysis/KeywordAnalysis.tsx"],
    },
    {
      id: "fact-check",
      label: "A scraped page",
      trigger: "Fact check tab",
      urlPattern: "/scraper/[id]",
      mandateKeys: [MANDATE_KEYS.scraper__fact_check],
      sources: ["features/scraper/parts/agent-analysis/FactChecker.tsx"],
    },
  ],
};
