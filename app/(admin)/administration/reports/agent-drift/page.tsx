// app/(admin)/administration/reports/agent-drift/page.tsx
//
// Agent Drift report (admin scope) — platform-wide drift rollup across every
// user's agents, reusing the same engine as the user report in admin mode.
// Super-admin gating is inherited from the (admin) route layout; the
// agx_usage_report_admin / agx_usage_scan_admin RPCs also enforce
// is_super_admin() server-side.

import { AgentDriftReport } from "@/features/reports/components/agent-drift/AgentDriftReport";

export const metadata = {
  title: "Agent Drift | Reports | Administration",
  description: "Platform-wide agent drift across all users and organizations.",
};

export default function AdminAgentDriftReportPage() {
  return <AgentDriftReport mode="admin" />;
}
