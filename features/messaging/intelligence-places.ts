// features/messaging/intelligence-places.ts
//
// WHERE EACH MESSAGES JOB RUNS — drawn on /intelligence/messaging.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const MESSAGING_PLACES: FeaturePlaces = {
  feature: "messaging",
  label: "Messages",
  roots: ["features/messaging"],
  places: [
    {
      id: "conversation",
      label: "Messages",
      trigger: "Catch up, summarize, action items, draft a reply",
      urlPattern: "/messages",
      mandateKeys: [
        K.messaging__conversation_catch_up,
        K.messaging__conversation_summary,
        K.messaging__action_item_extraction,
        K.messaging__reply_drafting,
      ],
      sources: ["features/messaging/lib/messagingMandates.ts"],
    },
  ],
};
