// features/ai-work/conversations/intelligence-places.ts
//
// WHERE EACH CODING SESSION JOB RUNS — drawn on /intelligence/coding_session.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.
//
// The responder answers, on the server, a reply typed on a conversation
// mirrored from a coding tool (the continuation route resolves it). The
// translation reference is never run — the bridge only reads the agent it
// names — so it has no place and reads "Not recorded yet".

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const CODING_SESSION_PLACES: FeaturePlaces = {
  feature: "coding_session",
  label: "Coding sessions",
  roots: ["features/ai-work/conversations", "app/(core)/work/conversations"],
  places: [
    {
      id: "reply",
      label: "A mirrored coding conversation",
      trigger: "Send to AI Matrx",
      urlPattern: "/work/conversations/[conversationId]",
      mandateKeys: [K.coding_session__conversation_responder],
      sources: ["features/ai-work/conversations/components/AiMatrxReplyComposer.tsx"],
    },
  ],
};
