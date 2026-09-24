// app/(core)/reports/agent-drift/page.tsx
//
// Agent Drift report (user scope) — red flags across all the caller's agents,
// with a master-detail drill-in that reuses the Find Usages engine.

import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { AgentDriftReport } from "@/features/reports/components/agent-drift/AgentDriftReport";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";

export const metadata = {
  title: "Agent Drift | Reports | AI Matrx",
  description: "Every agent whose usages have drifted — breaking, silent, and stale-pin findings.",
};

export default async function AgentDriftReportPage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Reports"
        route="/reports/agent-drift"
        description="Agent drift findings across your agents — sign in to view your report."
      />
    );
  }

  return <AgentDriftReport mode="user" />;
}
