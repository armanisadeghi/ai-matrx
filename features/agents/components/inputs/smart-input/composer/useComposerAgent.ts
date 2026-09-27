"use client";

/**
 * useComposerAgent — who is answering in this conversation, and on what model,
 * as the agent pill shows it (brief §8, Amendment 1 A2).
 *
 * Every value comes from what already exists: the conversation's agent id, the
 * agent definition slice, the per-conversation model override layer, the model
 * registry, the ONE agent catalog (for `chat-agent` presets) and the
 * `chat.default_new_chat` mandate (Custom — Arman, 2026-09-27: "Custom IS the
 * default chat mode we have").
 */

import { useEffect } from "react";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { useAgentCatalogRows } from "@ai-matrx/agents/catalog/react";
import type { AgentSummary } from "@ai-matrx/agents/catalog";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useMandate } from "@/features/mandates/useMandate";
import { selectAgentIdFromInstance } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import {
  selectAgentModelId,
  selectAgentName,
} from "@/features/agents/redux/agent-definition/selectors";
import { selectInstanceOverrideState } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import { selectModelLabelById } from "@/features/ai-models/redux/modelRegistrySlice";
import { useModelOptions } from "@/features/ai-models/hooks/useModels";
import { initializeChatAgents } from "@/features/agents/redux/agent-definition/thunks";

/** The tag that makes an agent a Chat-mode preset (A2: "rules later; for now read the tag"). */
export const CHAT_AGENT_TAG = "chat-agent";

export interface ComposerPreset {
  id: string;
  name: string;
  modelLabel: string | null;
}

export interface ComposerAgentInfo {
  agentId: string | null;
  agentName: string | null;
  /** The model this conversation will run on: the override, else the agent's own. */
  effectiveModelId: string | null;
  effectiveModelLabel: string | null;
  /** The agent currently holding `chat.default_new_chat` — shown as "Custom". */
  customAgentId: string | null;
  isCustom: boolean;
  preset: ComposerPreset | null;
  presets: ComposerPreset[];
}

function isPresetRow(row: AgentSummary): boolean {
  return !row.isArchived && row.isActive !== false && row.tags.includes(CHAT_AGENT_TAG);
}

/** The model this conversation will run on: its override, else the agent's own. */
export function useEffectiveModelId(conversationId: string): string | null {
  const agentId = useAppSelector(selectAgentIdFromInstance(conversationId)) ?? null;
  const agentModelId = useAppSelector((state) => (agentId ? selectAgentModelId(state, agentId) : null));
  const overrideState = useAppSelector(selectInstanceOverrideState(conversationId));
  const baseModel = overrideState?.baseSettings?.model ?? null;
  const overrideModel = overrideState?.overrides?.model ?? null;
  return (
    (typeof overrideModel === "string" ? overrideModel : null) ??
    (typeof baseModel === "string" ? baseModel : null) ??
    agentModelId ??
    null
  );
}

export function useComposerAgent(conversationId: string): ComposerAgentInfo {
  const dispatch = useAppDispatch();
  // The registry + catalog loads are idempotent (TTL + in-flight dedup) and
  // shared with every other picker on the page.
  useModelOptions();
  useEffect(() => {
    dispatch(initializeChatAgents());
  }, [dispatch]);

  const agentId = useAppSelector(selectAgentIdFromInstance(conversationId)) ?? null;
  const agentName = useAppSelector((state) => (agentId ? selectAgentName(state, agentId) : undefined)) ?? null;
  const effectiveModelId = useEffectiveModelId(conversationId);
  const effectiveModelLabel = useAppSelector((state) => selectModelLabelById(state, effectiveModelId)) ?? null;

  const { mandate: customMandate } = useMandate(MANDATE_KEYS.chat__default_new_chat, { optional: true });
  const customAgentId = customMandate?.agentId ?? null;

  const rows = useAgentCatalogRows();
  const presetRows = rows.filter(isPresetRow);
  const modelLabels = useAppSelector((state) =>
    presetRows.map((row) => selectModelLabelById(state, row.modelId) ?? null).join("\u0000"),
  ).split("\u0000");
  const presets: ComposerPreset[] = presetRows.map((row, index) => ({
    id: row.id,
    name: row.name ?? "Untitled agent",
    modelLabel: modelLabels[index] || null,
  }));

  return {
    agentId,
    agentName,
    effectiveModelId,
    effectiveModelLabel,
    customAgentId,
    isCustom: Boolean(agentId && customAgentId && agentId === customAgentId),
    preset: presets.find((p) => p.id === agentId) ?? null,
    presets,
  };
}
