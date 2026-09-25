// features/agents/components/chat/intelligence-places.ts
//
// WHERE EACH CHAT JOB RUNS — drawn on /intelligence/chat. Proved against the
// files named below by features/mandates/feature-intelligence/__tests__/
// declared-places.test.ts (every job named in its sources, every chat
// component under `roots` that names a job mapped here).

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";
import { DEFAULT_NEW_CHAT_MANDATE_KEY } from "./chat-quick-actions.config";

const K = MANDATE_KEYS;
const QUICK = [
  K.chat__quick_showcase,
  K.chat__quick_fair_news,
  K.chat__quick_writing_partner,
  K.chat__quick_flashcards,
  K.chat__quick_org_chart,
  K.chat__quick_image,
  K.chat__quick_research,
  K.chat__quick_audio_plan,
  K.chat__cx_default,
];

export const CHAT_PLACES: FeaturePlaces = {
  feature: "chat",
  label: "Chat",
  aliases: { DEFAULT_NEW_CHAT_MANDATE_KEY },
  roots: ["features/agents/components/chat", "app/(core)/chat"],
  places: [
    {
      id: "new",
      label: "New chat",
      trigger: "The assistant you talk to first",
      urlPattern: "/chat/new",
      mandateKeys: [K.chat__default_new_chat],
      sources: [
        "app/(core)/chat/new/page.tsx",
        "features/agents/components/chat/ChatNewClient.tsx",
        "features/agents/components/chat/ChatNewHeader.tsx",
        "features/agents/components/chat/NewChatGreeting.tsx",
      ],
    },
    {
      id: "quick-actions",
      label: "New chat",
      trigger: "Quick-start chips",
      urlPattern: "/chat/new",
      mandateKeys: QUICK,
      sources: [
        "features/agents/components/chat/chat-quick-actions.config.ts",
        "features/agents/components/chat/NewChatGreeting.tsx",
      ],
    },
    {
      id: "conversation",
      label: "A conversation",
      trigger: "Every reply",
      urlPattern: "/chat/[conversationId]",
      mandateKeys: [K.chat__default_new_chat],
      sources: [
        "app/(core)/chat/[conversationId]/page.tsx",
        "features/agents/components/chat/ChatConversationRoom.tsx",
        "features/agents/components/chat/ChatRoomClient.tsx",
      ],
    },
    {
      id: "talk",
      label: "Talk",
      trigger: "Voice conversation",
      urlPattern: "/chat/talk",
      mandateKeys: [K.chat__default_new_chat],
      sources: ["app/(core)/chat/talk/page.tsx"],
    },
    {
      id: "response-modes",
      label: "Chat response modes",
      trigger: "Research, video, data and brainstorm modes",
      mandateKeys: [
        K.chat__cx_default,
        K.chat__response_mode_video,
        K.chat__response_mode_research,
        K.chat__response_mode_data,
        K.chat__response_mode_brainstorm,
      ],
      sources: ["features/cx-chat/components/agent/local-agents.ts"],
    },
  ],
};
