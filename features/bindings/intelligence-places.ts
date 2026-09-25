// features/bindings/intelligence-places.ts
//
// WHERE EACH JOB-BUILDING JOB RUNS — drawn on /intelligence/mandates.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const MANDATES_PLACES: FeaturePlaces = {
  feature: "mandates",
  label: "Job builder",
  roots: ["features/bindings", "features/agents/agent-creators"],
  places: [
    {
      id: "holder-draft",
      label: "A job's binding workspace",
      trigger: "Draft an agent for this job",
      mandateKeys: [K.mandates__holder_draft],
      sources: [
        "features/bindings/HolderDraftPanel.tsx",
        "features/bindings/holder-draft-brief.ts",
      ],
    },
    {
      id: "agent-generator",
      label: "Agent builder",
      trigger: "Generate an agent",
      mandateKeys: [K.mandates__holder_draft],
      sources: ["features/agents/agent-creators/interactive-builder/AgentGenerator.tsx"],
    },
  ],
};
