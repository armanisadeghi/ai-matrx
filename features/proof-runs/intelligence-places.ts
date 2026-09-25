// features/proof-runs/intelligence-places.ts
//
// WHERE EACH PROOF RUN JOB RUNS — drawn on /intelligence/proof_runs.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.
//
// The judge runs on the server when a check whose scenario carries a judge
// rule is run from the proof-run console; the rule is authored in the
// scenario editor, which is where the indicator sits.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const PROOF_RUNS_PLACES: FeaturePlaces = {
  feature: "proof_runs",
  label: "Proof runs",
  roots: ["features/proof-runs", "app/(admin)/administration/compute/proof-runs"],
  places: [
    {
      id: "judge-rule",
      label: "Proof-run console",
      trigger: "Run a check whose scenario has a judge rule",
      urlPattern: "/administration/compute/proof-runs",
      mandateKeys: [K.proof_runs__judge],
      sources: ["features/proof-runs/components/ScenarioEditor.tsx"],
    },
  ],
};
