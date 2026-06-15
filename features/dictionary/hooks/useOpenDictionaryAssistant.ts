// features/dictionary/hooks/useOpenDictionaryAssistant.ts
//
// Launch the Dictionary Assistant as a floating-chat WIDGET (not the /chat
// route). Uses launchAgent(agentId, …) directly — NOT launchShortcut, because
// the shortcut record must already be loaded into Redux for launchShortcut to
// resolve it (getShortcutRecordFromState only reads state, never fetches), and
// the global dictionary shortcut isn't loaded on the management pages.
// launchAgent has no such dependency: it opens the agentFloatingChat overlay
// with the agent (which carries its model + dictionary tool + skills). The
// global shortcut row still exists for discovery in the shortcuts menus.

"use client";

import { useCallback, useState } from "react";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { DICTIONARY_AGENT_IDS, DICT_LEVEL_LABELS } from "@/features/dictionary/constants";
import type { DictLevel } from "@/features/dictionary/types";

export function useOpenDictionaryAssistant() {
  const { launchAgent } = useAgentLauncher();
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
        await launchAgent(DICTIONARY_AGENT_IDS.assistant, {
          surfaceKey: "dictionary:assistant",
          sourceFeature: "dictionary",
          apiEndpointMode: "agent",
          config: {
            displayMode: "floating-chat",
            autoRun: false,
            allowChat: true,
          },
          runtime: {
            // Orientation for the agent — it still resolves the concrete owner
            // via its list_owners tool before writing.
            applicationScope: {
              context: {
                dictionary_owner_level: opts.level,
                dictionary_owner_id: opts.ownerId ?? null,
                dictionary_owner_name: opts.ownerName ?? null,
                working_on: where,
              },
            },
          },
        });
      } finally {
        setIsPending(false);
      }
    },
    [launchAgent],
  );

  return { open, isPending };
}
