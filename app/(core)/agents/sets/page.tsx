import type { Metadata } from "next";
import { AgentSetsBrowser } from "@/features/agents/agent-sets/components/AgentSetsBrowser";

export const metadata: Metadata = {
  title: "Agent Sets",
  description: "Orchestrators presiding over teams of agents.",
};

export default function AgentSetsPage() {
  return <AgentSetsBrowser />;
}
