// features/agents/components/ambient-assistant/intelligence-places.ts
//
// WHERE EACH AMBIENT ASSISTANT JOB RUNS — drawn on /intelligence/ambient.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const AMBIENT_PLACES: FeaturePlaces = {
  feature: "ambient",
  label: "Ambient assistant",
  roots: ["features/agents/components/ambient-assistant"],
  places: [
    {
      id: "page-guidance",
      label: "Any page",
      trigger: "The page assistant (where a module has none of its own)",
      mandateKeys: [K.ambient__page_guidance],
      sources: ["features/agents/components/ambient-assistant/ambientAssistantMandates.ts"],
    },
    {
      id: "listen",
      label: "An assistant message",
      trigger: "Listen — the spoken summary",
      mandateKeys: [K.ambient__spoken_summary],
      sources: ["features/surfaces/manifests/assistant-message.manifest.ts"],
    },
  ],
};
