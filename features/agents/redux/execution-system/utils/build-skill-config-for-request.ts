/**
 * buildSkillConfigForRequest — fold per-conversation skill picks from the Smart
 * Input into the effective `skill_config` wire payload.
 *
 * `builderAdvancedSettings.addedSkills` holds registry skill UUIDs the user added
 * to THIS conversation/run — additive on top of the agent's saved tiers, same
 * contract as `addedTools`. Added skills land in `included` (full body in the
 * system preamble). If an added id was in `forbidden`, it is promoted out.
 *
 * Returns `undefined` when there is nothing to send — the server keeps the
 * agent's persisted skill_config.
 */

import type { RootState } from "@/lib/redux/store";
import { selectAgentSkillConfig } from "@/features/agents/redux/agent-definition/selectors";
import type { SkillConfig } from "@/features/skills/types";

export function buildSkillConfigForRequest(
  agentSkillConfig: SkillConfig,
  addedSkills: string[] | undefined,
): SkillConfig | undefined {
  const added = addedSkills?.filter(Boolean) ?? [];
  if (added.length === 0) return undefined;

  const addedSet = new Set(added);
  const included = [
    ...agentSkillConfig.included.filter((id) => !addedSet.has(id)),
    ...added,
  ];
  const forbidden = agentSkillConfig.forbidden.filter((id) => !addedSet.has(id));

  return {
    included,
    listed: [...agentSkillConfig.listed],
    forbidden,
    disabled: agentSkillConfig.disabled,
  };
}

/** Snake_case wire shape for AgentStartRequest / ConversationContinueRequest. */
export function skillConfigToWire(
  config: SkillConfig,
): Record<string, unknown> {
  return {
    included: config.included,
    listed: config.listed,
    forbidden: config.forbidden,
    disabled: config.disabled,
  };
}

const EMPTY_SKILL_CONFIG: SkillConfig = {
  included: [],
  listed: [],
  forbidden: [],
  disabled: false,
};

/**
 * Attach merged `skill_config` onto an outbound agent/conversation payload when
 * the Smart Input skills picker has additive picks for this conversation.
 */
export function attachSkillConfigFromState(
  state: RootState,
  conversationId: string,
  payload: { skill_config?: Record<string, unknown> },
): void {
  const instance = state.conversations.byConversationId[conversationId];
  if (!instance) return;

  const agentId = instance.initialAgentVersionId ?? instance.agentId;
  const agentSkillConfig = agentId
    ? selectAgentSkillConfig(state, agentId)
    : EMPTY_SKILL_CONFIG;

  const addedSkills =
    state.instanceUIState.byConversationId[conversationId]
      ?.builderAdvancedSettings?.addedSkills;

  const effective = buildSkillConfigForRequest(agentSkillConfig, addedSkills);
  if (effective) {
    payload.skill_config = skillConfigToWire(effective);
  }
}
