"use client";

import { useEffect } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { effectiveOfferingPinOf, readEffectiveModelId } from "@ai-matrx/agents/settings";
import { useModelClassControls } from "@ai-matrx/chat/agents/identity/model-catalog";
import { getSettingsStore, useAgentSettingsEntry } from "@ai-matrx/chat/agents/identity/settings-store";
import { selectAgentModelId, selectAgentSettings } from "@ai-matrx/chat/agents/redux/agent-definition/selectors";

/**
 * Seeds the page's settings store (agent core B4 — the ONE holder) with the builder's agent
 * settings, and loads the pinned class's controls so `useNormalizedControls` reads that class,
 * not the preferred one. (The retired `agentSettings` slice was never seeded here, so the builder
 * read no model controls at all.)
 */
export function useAgentSettingsClassControls(agentId: string): void {
  const settings = useAppSelector((state) => selectAgentSettings(state, agentId));
  const recordModelId = useAppSelector((state) => selectAgentModelId(state, agentId));
  useEffect(() => {
    if (!settings && !recordModelId) return;
    getSettingsStore().ensure({
      agentId,
      context: "builder",
      settings: { ...(settings ?? {}), ...(recordModelId ? { model: recordModelId } : {}) },
    });
  }, [agentId, settings, recordModelId]);
  const entry = useAgentSettingsEntry(agentId);
  useModelClassControls(readEffectiveModelId(entry), effectiveOfferingPinOf(entry) ?? null);
}
