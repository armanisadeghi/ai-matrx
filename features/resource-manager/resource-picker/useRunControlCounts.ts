"use client";

/**
 * useRunControlCounts — the at-a-glance numbers for the attach menu's
 * "This run" rows (Tools / Skills).
 *
 * These rows describe RUN STATE — what is actually on for the next message —
 * so a count is real information, not decoration. The Files / MATRX / URL
 * rows are browse-into pickers over the user's libraries; a library size
 * tells the user nothing about this run and would cost a fetch per row on
 * every menu open, so those rows carry no count.
 *
 * The numbers mirror exactly what ships with the request:
 *   Tools    — the agent's configured tools (built-in + custom) plus the
 *              per-conversation `addedTools` folded in by `buildToolInjection`.
 *   Skills   — the agent's visible tiers (included + listed; forbidden is NOT
 *              active) plus `addedSkills`, deduped, matching
 *              `buildSkillConfigForRequest`. A disabled skill config counts
 *              only the explicit per-run adds, which re-enable it.
 *
 * Tools/Skills counts are withheld until the agent's RUN TIER has loaded, so
 * the menu never shows a confident "0" that jumps to "12" a moment later.
 *
 * P24 (PACKAGE-INDEPENDENCE §3): this hook runs on every chat page, so it reads
 * the run tier (`fetchAgentRunTier`), never the definition. The run tier
 * carries the built-in tool ids plus plain counts (custom tools, active skills),
 * so both numbers show on load; once a picker has loaded the real lists, the
 * lists win (they dedupe per-run adds exactly).
 */

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentIdFromInstance } from "@ai-matrx/chat/agents/redux/execution-system/conversations/conversations.selectors";
import { hasField } from "@ai-matrx/agents/field-flags";
import {
  selectAgentById,
  selectAgentTools,
  selectAgentCustomTools,
  selectAgentSkillConfig,
  selectAgentRunTier,
} from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import { fetchAgentRunTier } from "@ai-matrx/chat/agents/redux/agent-definition/thunks";
import { selectBuilderAdvancedSettings } from "@ai-matrx/chat/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { DEFAULT_BUILDER_ADVANCED_SETTINGS } from "@ai-matrx/chat/agents/types/instance.types";
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
    agentId ? selectAgentRunTier(s, agentId).isReady : false,
  );
  const customToolsKnown = useAppSelector((s) => {
    const record = agentId ? selectAgentById(s, agentId) : undefined;
    return !!record && hasField(record._loadedFields, "customTools");
  });
  const skillConfigKnown = useAppSelector((s) => {
    const record = agentId ? selectAgentById(s, agentId) : undefined;
    return !!record && hasField(record._loadedFields, "skillConfig");
  });
  const runCounts = useAppSelector((s) =>
    agentId ? selectAgentRunTier(s, agentId).counts : null,
  );
  const agentToolIds = useAppSelector((s) =>
    agentId ? selectAgentTools(s, agentId) : undefined,
  );
  const agentCustomTools = useAppSelector((s) =>
    agentId ? selectAgentCustomTools(s, agentId) : undefined,
  );
  const agentSkillConfig = useAppSelector((s) =>
    agentId ? selectAgentSkillConfig(s, agentId) : undefined,
  );
  const settings = useAppSelector((s) =>
    conversationId
      ? selectBuilderAdvancedSettings(conversationId)(s)
      : undefined,
  );

  // The run tier — one small read per agent, a no-op once it is in the slice.
  useEffect(() => {
    if (agentId && !agentReady) {
      void dispatch(fetchAgentRunTier(agentId));
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
    const customCount = customToolsKnown
      ? custom.length
      : (runCounts?.customTools ?? null);
    if (!agentId || customCount !== null) {
      counts.tools =
        new Set([...builtIn, ...addedTools]).size + (customCount ?? 0);
    }

    if (agentId && !skillConfigKnown && runCounts) {
      // Run tier: the agent's active-skill count (0 when its config is
      // disabled — then only the explicit per-run adds count, which re-enable it).
      counts.skills = runCounts.skills + addedSkills.length;
    } else {
      const config = agentSkillConfig;
      const activeSkills = new Set<string>(addedSkills);
      if (config && !config.disabled) {
        for (const id of config.included) activeSkills.add(id);
        for (const id of config.listed) activeSkills.add(id);
      }
      counts.skills = activeSkills.size;
    }
  }

  return counts;
}
