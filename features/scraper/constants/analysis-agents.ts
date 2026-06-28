/**
 * One-shot analysis agents mounted on full-scrape result tabs.
 * IDs are unchanged from the legacy recipe + broker slot mapping.
 */
export const SCRAPER_ANALYSIS_AGENTS = {
  factChecker: {
    agentId: "07e85962-71c8-4a2d-acb0-80d1771a4594",
    /** Legacy broker UUID — still the agent variable slot key. */
    contentVariableId: "59dd12d8-8bec-40ae-af24-09d2cf28a806",
  },
  keywordAnalysis: {
    agentId: "0288e091-6252-4cca-b140-7ba94b4eb206",
    contentVariableId: "86c303c3-e10f-4426-b739-f20172a4d754",
  },
} as const;
