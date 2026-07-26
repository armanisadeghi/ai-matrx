"use client";

/**
 * useRunControlCounts — the at-a-glance numbers for the attach menu's
 * "This run" rows (Tools / Skills / Settings).
 *
 * These three rows describe RUN STATE — what is actually on for the next
 * message — so a count is real information, not decoration. The MATRX and
 * "From the web" rows are browse-into pickers over the user's libraries; a
 * library size tells the user nothing about this run and would cost a fetch
 * per row on every menu open, so those rows carry no count.
 *
 * The numbers mirror exactly what ships with the request:
 *   Tools    — the agent's configured tools (built-in + custom + MCP) plus the
 *              per-conversation `addedTools` folded in by `buildToolInjection`.
 *   Skills   — the agent's visible tiers (included + listed; forbidden is NOT
 *              active) plus `addedSkills`, deduped, matching
 *              `buildSkillConfigForRequest`. A disabled skill config counts
 *              only the explicit per-run adds, which re-enable it.
 *   Settings — the number of settings that differ from the agent's defaults,
 *              i.e. the exact `config_overrides` payload.
 *
 * Tools/Skills counts are withheld until the agent definition has loaded, so
 * the menu never shows a confident "0" that jumps to "12" a moment later.
 */

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentIdFromInstance } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import {
  selectAgentTools,
  selectAgentCustomTools,
  selectAgentMcpServers,
  selectAgentSkillConfig,
  selectAgentReadyForCustomExecution,
} from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentExecutionFull } from "@/features/agents/redux/agent-definition/thunks";
import { selectBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectSettingsOverridesForApi } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import { DEFAULT_BUILDER_ADVANCED_SETTINGS } from "@/features/agents/types/instance.types";
import type { ResourcePickerViewId } from "./resource-picker-menu-items";

export type ResourcePickerCounts = Partial<
  Record<Exclude<ResourcePickerViewId, null>, number>
>;

export function useRunControlCounts(
  conversationId?: string,
): ResourcePickerCounts {
  const dispatch = useAppDispatch();

  const agentId = useAppSelector((s) =>
    conversationId ? selectAgentIdFromInstance(conversationId)(s) : undefined,
  );
  const agentReady = useAppSelector((s) =>
    agentId ? selectAgentReadyForCustomExecution(s, agentId) : false,
  );
  const agentToolIds = useAppSelector((s) =>
    agentId ? selectAgentTools(s, agentId) : undefined,
  );
  const agentCustomTools = useAppSelector((s) =>
    agentId ? selectAgentCustomTools(s, agentId) : undefined,
  );
  const agentMcpServers = useAppSelector((s) =>
    agentId ? selectAgentMcpServers(s, agentId) : undefined,
  );
  const agentSkillConfig = useAppSelector((s) =>
    agentId ? selectAgentSkillConfig(s, agentId) : undefined,
  );
  const settings = useAppSelector((s) =>
    conversationId
      ? selectBuilderAdvancedSettings(conversationId)(s)
      : undefined,
  );
  const overrides = useAppSelector((s) =>
    conversationId
      ? selectSettingsOverridesForApi(conversationId)(s)
      : undefined,
  );

  // Same on-demand load the Tools/Skills pickers do — one row fetch per agent,
  // a no-op once the definition is in the slice.
  useEffect(() => {
    if (agentId && !agentReady) {
      void dispatch(fetchAgentExecutionFull(agentId));
    }
  }, [agentId, agentReady, dispatch]);

  if (!conversationId) return {};

  const advanced = settings ?? DEFAULT_BUILDER_ADVANCED_SETTINGS;
  const addedTools = advanced.addedTools ?? [];
  const addedSkills = advanced.addedSkills ?? [];

  const counts: ResourcePickerCounts = {};

  // No agent on the instance means there is nothing to wait for; the adds are
  // the whole story.
  if (!agentId || agentReady) {
    const builtIn = Array.isArray(agentToolIds) ? agentToolIds : [];
    const custom = Array.isArray(agentCustomTools) ? agentCustomTools : [];
    const mcp = Array.isArray(agentMcpServers) ? agentMcpServers : [];
    counts.tools =
      builtIn.length + custom.length + mcp.length + addedTools.length;

    const config = agentSkillConfig;
    const activeSkills = new Set<string>(addedSkills);
    if (config && !config.disabled) {
      for (const id of config.included) activeSkills.add(id);
      for (const id of config.listed) activeSkills.add(id);
    }
    counts.skills = activeSkills.size;
  }

  const changedSettings = overrides ? Object.keys(overrides).length : 0;
  if (changedSettings > 0) counts.run_settings = changedSettings;

  return counts;
}
