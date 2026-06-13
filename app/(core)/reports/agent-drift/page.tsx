// app/(core)/reports/agent-drift/page.tsx
//
// Agent Drift report (user scope) — red flags across all the caller's agents,
// with a master-detail drill-in that reuses the Find Usages engine.

import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { AgentDriftReport } from "@/features/reports/components/agent-drift/AgentDriftReport";

export const metadata = {
  title: "Agent Drift | Reports | AI Matrx",
  description: "Every agent whose usages have drifted — breaking, silent, and stale-pin findings.",
};

export default async function AgentDriftReportPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/login?next=/reports/agent-drift");

  return <AgentDriftReport mode="user" />;
}
