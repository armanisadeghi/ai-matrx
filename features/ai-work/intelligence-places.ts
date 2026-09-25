// features/ai-work/intelligence-places.ts
//
// WHERE EACH CONVERSATION ANALYSIS JOB RUNS — drawn on /intelligence/conversation.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const CONVERSATION_PLACES: FeaturePlaces = {
  feature: "conversation",
  label: "Conversation analysis",
  roots: ["features/ai-work"],
  places: [
    {
      id: "analyze",
      label: "An AI Work conversation",
      trigger: "Analyze: outcomes, actions, decisions, drift, vision",
      mandateKeys: [
        K.conversation__outcome_summarizer,
        K.conversation__action_auditor,
        K.conversation__decision_ledger,
        K.conversation__drift_auditor,
        K.conversation__vision_interviewer,
      ],
      sources: ["features/ai-work/analysis/catalog.ts"],
    },
  ],
};
