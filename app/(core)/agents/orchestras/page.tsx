import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { AgentSetsBrowser } from "@/features/agents/agent-sets/components/AgentSetsBrowser";

export const metadata: Metadata = {
  title: "Agent Sets",
  description: "Orchestrators presiding over teams of agents.",
};

export default async function AgentSetsPage() {
  // Guests never see the sets workspace — bounce to the /agents landing
  // (same server-side convention as /agents/all).
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/agents");

  return <AgentSetsBrowser />;
}
