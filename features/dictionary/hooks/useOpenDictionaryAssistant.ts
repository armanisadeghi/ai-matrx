// features/dictionary/hooks/useOpenDictionaryAssistant.ts
//
// Launch the Dictionary Assistant as a floating-chat WIDGET (not the /chat
// route) through its Mandate (`dictionary.workspace_guide`) — NOT
// launchShortcut, because the shortcut record must already be loaded into
// Redux for launchShortcut to resolve it (getShortcutRecordFromState only reads
// state, never fetches), and the global dictionary shortcut isn't loaded on
// the management pages. `launchMandate` resolves the mandate inside the launch
// thunk (agent AND the binding's config_overrides) and opens the
// agentFloatingChat overlay. `useMandate` gates the affordance: while the
// mandate is unresolved the button is disabled with the reason — never a
// hardcoded fallback agent.

"use client";

import { useCallback, useState } from "react";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { useMandate } from "@/features/agents/mandates/useMandate";
import {
  DICTIONARY_ASSISTANT_MANDATE_KEY,
  DICT_LEVEL_LABELS,
} from "@/features/dictionary/constants";
import type { DictLevel } from "@/features/dictionary/types";

export function useOpenDictionaryAssistant() {
  const { launchMandate } = useAgentLauncher();
  const {
    mandate,
    loading: mandateLoading,
    error: mandateError,
  } = useMandate(DICTIONARY_ASSISTANT_MANDATE_KEY);
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
        await launchMandate(DICTIONARY_ASSISTANT_MANDATE_KEY, {
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
    [launchMandate],
  );

  return {
    open,
    isPending,
    /** True until the mandate resolves, or when it cannot — disable the button. */
    unavailable: mandateLoading || mandate === null,
    /** Why the assistant is unavailable (null while merely loading). */
    mandateError,
  };
}
