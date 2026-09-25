// features/agents/orchestras/intelligence-places.ts
//
// WHERE EACH ORCHESTRA JOB RUNS — drawn on /intelligence/orchestras.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const ORCHESTRAS_PLACES: FeaturePlaces = {
  feature: "orchestras",
  label: "Orchestras",
  roots: ["features/agents/orchestras"],
  places: [
    {
      id: "builder",
      label: "Orchestra builder",
      trigger: "Describe each member's role",
      urlPattern: "/agents/orchestras",
      mandateKeys: [K.orchestras__role_describer],
      sources: ["features/agents/orchestras/conductor/constants.ts"],
    },
  ],
};
