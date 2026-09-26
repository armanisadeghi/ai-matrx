// features/pdf-extractor/intelligence-places.ts
//
// WHERE EACH PDF JOB RUNS — drawn on /intelligence/pdf.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.
// Documents over 200 pages are cleaned page by page by the knowledge page
// cleaner instead; that job is mapped on the knowledge search page.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const PDF_PLACES: FeaturePlaces = {
  feature: "pdf",
  label: "PDF tools",
  roots: ["features/pdf-extractor", "features/pdf", "features/source-studio"],
  places: [
    {
      id: "pdf-studio",
      label: "PDF studio",
      trigger: "Document actions: AI clean",
      // A document opens on the Source screen; the PDF tools (AI clean,
      // crop, templates) are the studio at `/tools/pdf-extractor?doc=<id>`.
      urlPattern: "/tools/pdf-extractor",
      mandateKeys: [K.pdf__content_cleaner],
      sources: ["features/pdf-extractor/studio/PdfStudioHeaderControls.tsx"],
    },
    {
      id: "pdf-extractor-window",
      label: "PDF extractor window",
      trigger: "Run AI Cleanup",
      mandateKeys: [K.pdf__content_cleaner],
      sources: ["features/pdf-extractor/components/PdfExtractorWorkspace.tsx"],
    },
  ],
};
