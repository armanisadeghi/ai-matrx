// features/rag/intelligence-places.ts
//
// WHERE EACH KNOWLEDGE SEARCH AND INGEST JOB RUNS — drawn on /intelligence/rag.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.
// The chunk contextualizer has no place: contextual retrieval is switched off
// on the server, so nothing runs it.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const RAG_PLACES: FeaturePlaces = {
  feature: "rag",
  label: "Knowledge search",
  roots: ["features/rag/components", "features/pdf-extractor"],
  places: [
    {
      id: "search-pipeline",
      label: "Knowledge search",
      trigger: "Pipeline settings: HyDE expansion and multi-query",
      urlPattern: "/rag/search",
      mandateKeys: [K.rag__hyde_generator, K.rag__query_expander],
      sources: ["features/rag/components/search/RagSearchExperience.tsx"],
    },
    {
      id: "library-document",
      label: "A library document",
      trigger: "Process or re-process the document (page cleanup stage)",
      urlPattern: "/rag/library",
      mandateKeys: [K.rag__pdf_page_cleaner],
      sources: ["features/rag/components/library/LibraryDocDetailSheet.tsx"],
    },
    {
      id: "pdf-studio",
      label: "PDF studio",
      trigger: "AI clean on a long document (page by page)",
      urlPattern: "/tools/pdf-extractor/[id]",
      mandateKeys: [K.rag__pdf_page_cleaner],
      sources: ["features/pdf-extractor/studio/PdfStudioHeaderControls.tsx"],
    },
    {
      id: "pdf-extractor-window",
      label: "PDF extractor window",
      trigger: "Run AI Cleanup on a long document (page by page)",
      mandateKeys: [K.rag__pdf_page_cleaner],
      sources: ["features/pdf-extractor/components/PdfExtractorWorkspace.tsx"],
    },
  ],
};
