import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { OrchestrasBrowser } from "@/features/agents/orchestras/components/OrchestrasBrowser";

export const metadata: Metadata = {
  title: "Orchestras",
  description: "Orchestrators presiding over teams of agents.",
};

export default async function OrchestrasPage() {
  // Guests never see the sets workspace — bounce to the /agents landing
  // (same server-side convention as /agents/all).
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/agents");

  return <OrchestrasBrowser />;
}
