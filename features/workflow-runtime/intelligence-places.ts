// features/workflow-runtime/intelligence-places.ts
//
// WHERE EACH WORKFLOW JOB RUNS — drawn on /intelligence/workflow.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.
// Most workflow jobs run inside the Workflow Studio (a separate app in the
// aidream repo: Conductor, step Stewards, setup wizard, Plan Room and its
// assists, recovery advice, run assists) or in server-only pipelines (the
// extract sweep, research workflow probes), so no screen here names them and
// they read "Not recorded yet".

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const WORKFLOW_PLACES: FeaturePlaces = {
  feature: "workflow",
  label: "Workflows",
  roots: [
    "features/workflow-runtime",
    "features/workflow-emit",
    "features/workflow-comparison",
    "app/(core)/workflows",
  ],
  places: [
    {
      id: "run",
      label: "Run a workflow",
      trigger: "Run it — every AI step of the run",
      urlPattern: "/workflows/[workflowId]",
      mandateKeys: [K.workflow__step_intelligence],
      sources: ["features/workflow-runtime/components/run/WorkflowRunPage.tsx"],
    },
  ],
};
