// features/product-capture/intelligence-places.ts
//
// WHERE EACH PRODUCT CAPTURE JOB RUNS — drawn on /intelligence/product_capture.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const PRODUCT_CAPTURE_PLACES: FeaturePlaces = {
  feature: "product_capture",
  label: "Product capture",
  roots: ["features/product-capture", "app/(core)/tools/product-capture"],
  places: [
    {
      id: "instant",
      label: "Instant product capture",
      trigger: "Photograph a product — instant analysis",
      urlPattern: "/tools/product-capture/instant",
      mandateKeys: [K.product_capture__instant_analysis],
      sources: [
        "features/product-capture/components/CaptureScreen.tsx",
        "features/product-capture/hooks/useInstantAnalysis.ts",
        "app/(core)/tools/product-capture/instant/page.tsx",
      ],
    },
  ],
};
