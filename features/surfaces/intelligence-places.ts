// features/surfaces/intelligence-places.ts
//
// WHERE EACH AGENT BINDING JOB RUNS — drawn on /intelligence/surfaces_client.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const SURFACES_CLIENT_PLACES: FeaturePlaces = {
  feature: "surfaces_client",
  label: "Agent bindings",
  aliases: { BINDING_MAPPER_MANDATE_KEY: K.surfaces_client__binding_mapper },
  roots: ["features/surfaces/components", "features/bindings"],
  places: [
    {
      id: "bind-agent",
      label: "Bind an agent to a screen",
      trigger: "Suggest bindings",
      mandateKeys: [K.surfaces_client__binding_mapper],
      sources: [
        "features/surfaces/components/bind/BindingSuggestionsTab.tsx",
        "features/surfaces/utils/binding-suggestions.ts",
      ],
    },
    {
      id: "one-binding",
      label: "A job's binding workspace",
      trigger: "Map the inputs",
      mandateKeys: [K.surfaces_client__binding_mapper],
      sources: ["features/bindings/OneBindingWorkspace.tsx"],
    },
  ],
};
