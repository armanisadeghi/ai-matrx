import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { OrchestrasBrowser } from "@/features/agents/orchestras/components/OrchestrasBrowser";

export const metadata: Metadata = {
  title: "Orchestras",
  description: "Conductors presiding over teams of agents.",
};

export default async function OrchestrasPage() {
  // Guests never see the sets workspace — bounce to the /agents landing
  // (same server-side convention as /agents/all).
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect("/agents");

  return <OrchestrasBrowser />;
}
