// features/commerce-intake/intelligence-places.ts
//
// WHERE EACH COMMERCE INTAKE JOB RUNS — drawn on /intelligence/commerce_intake.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const COMMERCE_INTAKE_PLACES: FeaturePlaces = {
  feature: "commerce_intake",
  label: "Commerce intake",
  roots: ["features/commerce-intake", "app/(core)/commerce"],
  places: [
    {
      id: "instant",
      label: "Instant intake",
      trigger: "Photograph an item — instant analysis",
      urlPattern: "/commerce/intake/instant",
      mandateKeys: [K.commerce_intake__instant_analysis],
      sources: [
        "features/commerce-intake/components/IntakeCaptureScreen.tsx",
        "features/commerce-intake/hooks/useInstantIntakeAnalysis.ts",
        "app/(core)/commerce/intake/instant/page.tsx",
        "app/(core)/commerce/intake/v2/instant/page.tsx",
        "app/(core)/commerce/intake/v3/instant/page.tsx",
      ],
    },
  ],
};
