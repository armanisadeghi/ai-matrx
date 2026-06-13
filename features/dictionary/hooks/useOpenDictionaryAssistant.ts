// features/dictionary/hooks/useOpenDictionaryAssistant.ts
//
// Launch the Dictionary Assistant chat from inside any management UI, with the
// owner pre-seeded as a draft message so the agent knows what the user is
// working on. Reuses the canonical /chat/a/<agentId> route + the chat
// draft-transfer primitive — no new launch mechanism.

"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { stashChatDraftTransfer } from "@/features/agents/components/chat/chat-draft-transfer";
import { DICTIONARY_AGENT_IDS, DICT_LEVEL_LABELS } from "@/features/dictionary/constants";
import type { DictLevel } from "@/features/dictionary/types";

export function useOpenDictionaryAssistant() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const open = useCallback(
    (opts: {
      level: DictLevel;
      ownerName?: string;
      agentId?: string;
    }) => {
      const agentId = opts.agentId ?? DICTIONARY_AGENT_IDS.assistant;
      const where =
        opts.level === "user"
          ? "my personal dictionary"
          : `the ${DICT_LEVEL_LABELS[opts.level].toLowerCase()} dictionary` +
            (opts.ownerName ? ` for "${opts.ownerName}"` : "");
      stashChatDraftTransfer({
        text: `I'd like to work on ${where}. Help me review and add terms.`,
        targetAgentId: agentId,
      });
      startTransition(() => {
        router.push(`/chat/a/${encodeURIComponent(agentId)}`);
      });
    },
    [router],
  );

  return { open, isPending };
}
