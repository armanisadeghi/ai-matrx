// features/agents/orchestras/hooks/useConductorPromptStatus.ts
//
// Detects whether an conductor is TEMPLATE-BASED (its system prompt has the
// `<available_agents>` section our automated system fills) and whether that section
// is OUT OF SYNC with the Orchestra's current members (so the builder can surface a
// "Sync agent listings" action only when it's meaningful, and flag when it's stale).

"use client";

import { useEffect, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAgentReadyForBuilder,
  selectAgentSystemMessage,
} from "@/features/agents/redux/agent-definition/selectors";
import { fetchFullAgent } from "@/features/agents/redux/agent-definition/thunks";
import { AVAILABLE_AGENTS_RE } from "../conductor/constants";

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const SECTION_RE = /<available_agents>([\s\S]*?)<\/available_agents>/i;

export interface ConductorPromptStatus {
  ready: boolean;
  /** The prompt has the `<available_agents>` markers → our system can auto-fill it. */
  isTemplate: boolean;
  /** The listed agents don't match the Orchestra's current members → needs a sync. */
  outOfSync: boolean;
}

export function useConductorPromptStatus(
  conductorId: string,
  memberIds: string[],
): ConductorPromptStatus {
  const dispatch = useAppDispatch();
  const ready = useAppSelector((s) =>
    selectAgentReadyForBuilder(s, conductorId),
  );
  const sysMsg = useAppSelector((s) =>
    selectAgentSystemMessage(s, conductorId),
  );

  // Load the full definition once (guarded on readiness) — the list row has no messages.
  useEffect(() => {
    if (conductorId && !ready) dispatch(fetchFullAgent(conductorId));
  }, [conductorId, ready, dispatch]);

  return useMemo(() => {
    const block = sysMsg?.content?.find((b) => b.type === "text");
    const sysText = block?.type === "text" ? (block.text ?? "") : "";
    const isTemplate = AVAILABLE_AGENTS_RE.test(sysText);
    if (!isTemplate) return { ready, isTemplate: false, outOfSync: false };

    const section = sysText.match(SECTION_RE)?.[1] ?? "";
    const promptIds = new Set(
      (section.match(UUID_RE) ?? []).map((s) => s.toLowerCase()),
    );
    const memberSet = new Set(memberIds.map((s) => s.toLowerCase()));
    let outOfSync = promptIds.size !== memberSet.size;
    if (!outOfSync) {
      for (const id of memberSet) {
        if (!promptIds.has(id)) {
          outOfSync = true;
          break;
        }
      }
    }
    return { ready, isTemplate: true, outOfSync };
  }, [sysMsg, memberIds, ready]);
}
