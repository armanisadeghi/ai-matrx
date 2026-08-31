import type { AgentTab } from "@/features/agents/redux/agent-consumers/slice";

/** User-facing label for the `system` ownership tab in agent list pickers. */
export const AGENT_PUBLIC_TAB_LABEL = "Public";

/** Badge label for builtin agents in picker rows. */
export const AGENT_PUBLIC_BADGE_LABEL = "Public";

export function agentListEmptyLabel(tab: AgentTab): string {
  switch (tab) {
    case "system":
      // 🚨 The tab IS the system tab, and the surfaces that mount this picker
      // call that rung "System" (V1 round 3). Saying "public" here made the
      // empty state name a different thing from the rung the person had just
      // chosen. The tab's own LABEL is a wider vocabulary question and is left
      // alone — this only stops the empty state contradicting its own case.
      return "No system agents found";
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
