// features/agents/agent-sets/hooks/useOrchestratorPromptStatus.ts
//
// Detects whether an orchestrator is TEMPLATE-BASED (its system prompt has the
// `<available_agents>` section our automated system fills) and whether that section
// is OUT OF SYNC with the set's current members (so the builder can surface a
// "Sync agent listings" action only when it's meaningful, and flag when it's stale).

"use client";

import { useEffect, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAgentReadyForBuilder,
  selectAgentSystemMessage,
} from "@/features/agents/redux/agent-definition/selectors";
import { fetchFullAgent } from "@/features/agents/redux/agent-definition/thunks";
import { AVAILABLE_AGENTS_RE } from "../orchestrator/constants";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const SECTION_RE = /<available_agents>([\s\S]*?)<\/available_agents>/i;

export interface OrchestratorPromptStatus {
  ready: boolean;
  /** The prompt has the `<available_agents>` markers → our system can auto-fill it. */
  isTemplate: boolean;
  /** The listed agents don't match the set's current members → needs a sync. */
  outOfSync: boolean;
}

export function useOrchestratorPromptStatus(
  orchestratorId: string,
  memberIds: string[],
): OrchestratorPromptStatus {
  const dispatch = useAppDispatch();
  const ready = useAppSelector((s) => selectAgentReadyForBuilder(s, orchestratorId));
  const sysMsg = useAppSelector((s) => selectAgentSystemMessage(s, orchestratorId));

  // Load the full definition once (guarded on readiness) — the list row has no messages.
  useEffect(() => {
    if (orchestratorId && !ready) dispatch(fetchFullAgent(orchestratorId));
  }, [orchestratorId, ready, dispatch]);

  return useMemo(() => {
    const block = sysMsg?.content?.find((b) => b.type === "text");
    const sysText = block?.type === "text" ? block.text : "";
    const isTemplate = AVAILABLE_AGENTS_RE.test(sysText);
    if (!isTemplate) return { ready, isTemplate: false, outOfSync: false };

    const section = sysText.match(SECTION_RE)?.[1] ?? "";
    const promptIds = new Set((section.match(UUID_RE) ?? []).map((s) => s.toLowerCase()));
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
