import type { AgentConfig } from "../context/DEPRECATED-ChatContext";
import type { AgentRecord } from "@/lib/redux/slices/agentCacheSlice";
import { DEFAULT_AGENTS } from "../components/AgentSelector";

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  promptId: DEFAULT_AGENTS[0].promptId,
  name: DEFAULT_AGENTS[0].name,
  description: DEFAULT_AGENTS[0].description,
  variableDefaults: DEFAULT_AGENTS[0].variableDefaults,
};

/**
 * Resolves an AgentConfig from an agent ID by checking:
 * 1. Hardcoded DEFAULT_AGENTS (system agents)
 * 2. AgentRecord array (builtins, user prompts, or shared agents from Redux cache)
 */
export function resolveAgentFromId(
  agentId: string | null,
  agents: AgentRecord[] = [],
): AgentConfig | null {
  if (!agentId) return null;

  const systemAgent = DEFAULT_AGENTS.find((a) => a.promptId === agentId);
  if (systemAgent) {
    return {
      promptId: systemAgent.promptId,
      name: systemAgent.name,
      description: systemAgent.description,
      variableDefaults: systemAgent.variableDefaults,
    };
  }

  const cached = agents.find((a) => a.id === agentId);
  if (cached) {
    return {
      promptId: cached.id,
      name: cached.name,
      description: cached.description,
      variableDefaults:
        cached.variableDefaults as AgentConfig["variableDefaults"],
    };
  }

  return null;
}
