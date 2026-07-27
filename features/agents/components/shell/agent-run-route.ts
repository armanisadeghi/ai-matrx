export const USER_AGENT_RUN_BASE_PATH = "/agents";
export const ADMIN_AGENT_RUN_BASE_PATH = "/administration/agents/system-agents/agents";

// Both the pattern and the resolver are DERIVED from the two base-path
// constants — never hand-written. They used to be independent literals and
// drifted: the regex said "/administration/system-agents/agents" while the
// constant (and the real route, app/(admin)/administration/agents/system-agents/agents/[id]/run)
// said "/administration/agents/system-agents/agents". The admin runner's
// sidebar menu and route-menu registry therefore never activated on it.
const BASE_PATHS = [
  USER_AGENT_RUN_BASE_PATH,
  ADMIN_AGENT_RUN_BASE_PATH,
] as const;

const escapeForRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const BASE_PATH_ALTERNATION = BASE_PATHS.map(escapeForRegex).join("|");

export const AGENT_RUN_PATH_PATTERN = new RegExp(
  `^(?:${BASE_PATH_ALTERNATION})/[^/]+/run(?:/|$)`,
);

const AGENT_RUN_ROUTE_PATTERN = new RegExp(
  `^(${BASE_PATH_ALTERNATION})/([^/]+)/run(?:/|$)`,
);

export interface AgentRunRoute {
  agentId: string;
  basePath: typeof USER_AGENT_RUN_BASE_PATH | typeof ADMIN_AGENT_RUN_BASE_PATH;
}

/** Resolve either supported runner URL to the shared runner route contract. */
export function resolveAgentRunRoute(pathname: string): AgentRunRoute | null {
  const match = pathname.match(AGENT_RUN_ROUTE_PATTERN);
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
