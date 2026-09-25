// components/agent-copy/intelligence-places.ts
//
// WHERE EACH COPY-FOR-AI JOB RUNS — drawn on /intelligence/alchemy.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const ALCHEMY_PLACES: FeaturePlaces = {
  feature: "alchemy",
  label: "Copy for AI",
  roots: ["components/agent-copy"],
  places: [
    {
      id: "prepare",
      label: "Copy for AI",
      trigger: "Prepare the content before copying",
      mandateKeys: [K.alchemy__prepare_content],
      sources: [
        "components/agent-copy/AlchemyHost.tsx",
        "components/agent-copy/useAlchemyDisclosure.ts",
      ],
    },
  ],
};
