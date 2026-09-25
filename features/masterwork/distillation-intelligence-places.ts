// features/masterwork/distillation-intelligence-places.ts
//
// WHERE EACH DISTILLATION JOB RUNS — drawn on /intelligence/distillation.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.
//
// The unfolding-case lane lives on a rulebook: the dialog streams the case to
// the server, which unfolds it into moments and (for a teaching case, not a
// sealed test case) distils each window into draft rules. The masterwork
// feature's own jobs are mapped separately in ./intelligence-places.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const DISTILLATION_PLACES: FeaturePlaces = {
  feature: "distillation",
  label: "Distillation",
  roots: ["features/masterwork/components/detail"],
  places: [
    {
      id: "unfolding-case",
      label: "Rulebook page",
      trigger: "Add a case that unfolded over time",
      urlPattern: "/masterwork/[rulebookId]",
      mandateKeys: [K.distillation__timeline_unfolder, K.distillation__timeline_distiller],
      sources: ["features/masterwork/components/detail/IngestTimelineDialog.tsx"],
    },
  ],
};
