// features/dictionary/intelligence-places.ts
//
// WHERE EACH DICTIONARY JOB RUNS — drawn on /intelligence/dictionary.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const DICTIONARY_PLACES: FeaturePlaces = {
  feature: "dictionary",
  label: "Dictionary",
  roots: ["features/dictionary"],
  places: [
    {
      id: "assistant",
      label: "Dictionary",
      trigger: "Workspace guide",
      urlPattern: "/dictionary/admin",
      mandateKeys: [K.dictionary__workspace_guide],
      sources: [
        "features/dictionary/constants.ts",
        "features/dictionary/hooks/useOpenDictionaryAssistant.ts",
      ],
    },
  ],
};
