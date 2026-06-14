// features/dictionary/hooks/useOpenDictionaryAssistant.ts
//
// Launch the Dictionary Assistant as a floating-chat WIDGET (not the /chat
// route). Uses the global shortcut (DICTIONARY_ASSISTANT_SHORTCUT_ID) via the
// canonical useAgentLauncher().launchShortcut path — dispatching it opens the
// agentFloatingChat overlay automatically. The owner the user launched from is
// passed as scope so the agent knows what they're working on (it still confirms
// via its list_owners tool).

"use client";

import { useCallback, useState } from "react";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import {
  DICTIONARY_ASSISTANT_SHORTCUT_ID,
  DICT_LEVEL_LABELS,
} from "@/features/dictionary/constants";
import type { DictLevel } from "@/features/dictionary/types";

export function useOpenDictionaryAssistant() {
  const { launchShortcut } = useAgentLauncher();
  const [isPending, setIsPending] = useState(false);

  const open = useCallback(
    async (opts: { level: DictLevel; ownerId?: string; ownerName?: string }) => {
      const where =
        opts.level === "user"
          ? "my personal dictionary"
          : `the ${DICT_LEVEL_LABELS[opts.level].toLowerCase()} dictionary` +
            (opts.ownerName ? ` for "${opts.ownerName}"` : "");

      setIsPending(true);
      try {
        await launchShortcut(
          DICTIONARY_ASSISTANT_SHORTCUT_ID,
          {
            // Orientation for the agent — it still resolves the concrete owner
            // via its list_owners tool before writing.
            context: {
              dictionary_owner_level: opts.level,
              dictionary_owner_id: opts.ownerId ?? null,
              dictionary_owner_name: opts.ownerName ?? null,
              working_on: where,
            },
          },
          {
            surfaceKey: `dictionary:assistant`,
            sourceFeature: "dictionary",
            config: { displayMode: "floating-chat" },
          },
        );
      } finally {
        setIsPending(false);
      }
    },
    [launchShortcut],
  );

  return { open, isPending };
}
