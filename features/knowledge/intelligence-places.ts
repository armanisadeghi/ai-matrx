// features/knowledge/intelligence-places.ts
//
// WHERE EACH KNOWLEDGE-ASSET JOB RUNS — drawn on /intelligence/knowledge.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.
// The document verifier has no place: it runs only when a chat agent calls
// its verify tool, never from a screen.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const KNOWLEDGE_PLACES: FeaturePlaces = {
  feature: "knowledge",
  label: "Knowledge assets",
  roots: ["features/rag/components/library", "features/knowledge"],
  places: [
    {
      id: "knowledge-assets",
      label: "A library document's knowledge assets",
      trigger: "Build section summaries, build synthetic Q&A",
      urlPattern: "/rag/library",
      mandateKeys: [K.knowledge__section_summarizer, K.knowledge__qa_generator],
      sources: ["features/rag/components/library/KnowledgeAssetPanel.tsx"],
    },
  ],
};
