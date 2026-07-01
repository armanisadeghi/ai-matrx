import type { AgentTab } from "@/features/agents/redux/agent-consumers/slice";

/** User-facing label for the `system` ownership tab in agent list pickers. */
export const AGENT_PUBLIC_TAB_LABEL = "Public";

/** Badge label for builtin agents in picker rows. */
export const AGENT_PUBLIC_BADGE_LABEL = "Public";

export function agentListEmptyLabel(tab: AgentTab): string {
  switch (tab) {
    case "system":
      return "No public agents found";
    case "shared":
      return "No shared agents found";
    default:
      return "No agents found";
  }
}

/** Whether a list picker should default to the public (`system`) tab instead of Mine. */
export function shouldDefaultAgentListToPublicTab(args: {
  userId: string | null;
  ownedCount: number;
  agentsLoaded: boolean;
}): boolean {
  if (!args.userId) return true;
  if (!args.agentsLoaded) return false;
  return args.ownedCount === 0;
}
