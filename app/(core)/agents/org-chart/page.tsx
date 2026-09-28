import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { AgentOrgChartPage } from "@/features/agents/org-chart/components/AgentOrgChartPage";

export const metadata: Metadata = {
  title: "Org Chart",
  description: "Every agent in its place: Orchestras below their Conductors, plus the structure you record by hand.",
};

export default async function OrgChartPage() {
  // Same convention as /agents/orchestras: guests go to the /agents landing.
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect("/agents");
  return <AgentOrgChartPage />;
}
