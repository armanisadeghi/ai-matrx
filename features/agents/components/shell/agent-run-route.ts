export const USER_AGENT_RUN_BASE_PATH = "/agents";
export const ADMIN_AGENT_RUN_BASE_PATH = "/administration/agents/system-agents/agents";

export const AGENT_RUN_PATH_PATTERN =
  /^(?:\/agents|\/administration\/system-agents\/agents)\/[^/]+\/run(?:\/|$)/;

export interface AgentRunRoute {
  agentId: string;
  basePath: typeof USER_AGENT_RUN_BASE_PATH | typeof ADMIN_AGENT_RUN_BASE_PATH;
}

/** Resolve either supported runner URL to the shared runner route contract. */
export function resolveAgentRunRoute(pathname: string): AgentRunRoute | null {
  const match = pathname.match(
    /^(\/agents|\/administration\/system-agents\/agents)\/([^/]+)\/run(?:\/|$)/,
  );
  if (!match) return null;

  return {
    basePath: match[1] as AgentRunRoute["basePath"],
    agentId: match[2],
  };
}

export function buildAgentRunUrl(
  route: AgentRunRoute,
  conversationId?: string,
): string {
  const runPath = `${route.basePath}/${route.agentId}/run`;
  return conversationId
    ? `${runPath}?conversationId=${encodeURIComponent(conversationId)}`
    : runPath;
}
