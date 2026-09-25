// features/hindsight/intelligence-places.ts
//
// WHERE EACH HINDSIGHT JOB RUNS — drawn on /intelligence/hindsight.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.
//
// The reviewer runs on the server when Review now (or Review just this) is
// pressed and when guidance is sent into its thread; the replay judge ranks an
// admin-started replay. The crystallizer has no screen: its only door is an
// admin API with no client, so it reads "Not recorded yet".

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const HINDSIGHT_PLACES: FeaturePlaces = {
  feature: "hindsight",
  label: "Hindsight",
  roots: [
    "features/hindsight",
    "app/(core)/agents/[id]/hindsight",
    "app/(admin)/administration/agents/hindsight",
  ],
  places: [
    {
      id: "agent-workspace",
      label: "Agent improvement workspace",
      trigger: "Review now, Review just this, Send guidance",
      urlPattern: "/agents/[id]/hindsight",
      mandateKeys: [K.hindsight__reviewer],
      sources: ["features/hindsight/workspace/EnrollmentSidebar.tsx"],
    },
    {
      id: "admin-console",
      label: "Hindsight console",
      trigger: "Review now, Review just this, Send guidance",
      urlPattern: "/administration/agents/hindsight",
      mandateKeys: [K.hindsight__reviewer],
      sources: ["features/hindsight/components/EnrollmentDetailPanel.tsx"],
    },
    {
      id: "replay",
      label: "Runs waiting for the next review",
      trigger: "Replay a recorded call (admins)",
      urlPattern: "/administration/agents/hindsight",
      mandateKeys: [K.hindsight__replay_judge],
      sources: ["features/hindsight/components/PendingExamplesPanel.tsx"],
    },
  ],
};
