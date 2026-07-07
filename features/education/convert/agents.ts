// features/education/convert/agents.ts
//
// Agent ids used by the converter's own generators. Feature-owned generators
// (deck → flashcards, mind_map → media) reference THEIR feature's agent ids
// (FC_AGENTS, EDU_MEDIA_AGENTS) — only ids authored for the converter/ingest
// flow itself live here.

export const CONVERT_AGENTS = {
  /**
   * source_content, title, focus → { title, summary_markdown, key_points[], trust }
   * Grounded study-summary generator. Authored 2026-07-07 (P9 Universal Ingest)
   * on gemini-3.5-flash; same TrustEnvelope contract as the flashcard/mindmap
   * generators. Tracks the latest published version.
   */
  summarize: "92b607a4-ad8c-488c-bd21-7030dbdd2142",
} as const;

export type ConvertAgentKey = keyof typeof CONVERT_AGENTS;
