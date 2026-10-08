"use client";

import { useAppSelector } from "@/lib/redux/hooks";
import { effectiveOfferingPinOf } from "@ai-matrx/chat/agents/redux/agent-settings/internal-utils";
import { useModelClassControls } from "@ai-matrx/chat/agents/identity/model-catalog";

/**
 * Loads the pinned class's controls for an agent-settings entry so
 * `useNormalizedControls` reads that class, not the preferred one.
 * (The class controls live in the core model catalog — chat's `useModelClassControls`.)
 */
export function useAgentSettingsClassControls(agentId: string): void {
  const modelId = useAppSelector((state) => {
    const entry = state.agentSettings?.entries[agentId];
    const id = entry?.overrides?.model ?? entry?.defaults?.model;
    return typeof id === "string" ? id : null;
  });
  const offeringId = useAppSelector((state) => {
    return effectiveOfferingPinOf(state.agentSettings?.entries[agentId]) ?? null;
  });
  useModelClassControls(modelId, offeringId);
}
