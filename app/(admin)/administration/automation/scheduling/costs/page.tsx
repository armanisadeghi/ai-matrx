// Scheduling admin › Costs — every automation on the platform (scheduled tasks,
// scheduled agents, recurring mandates, workflow triggers) with what it cost in
// the last 30 days, how it behaves (models, turns) and the spend-rule red flags.
// One database rollup (scheduler.automation_cost_rollup) feeds this tab, the
// System jobs tab and the org admin page: features/scheduling/service/automationCosts.ts.
"use client";

import { AutomationCostTable } from "@/features/scheduling/components/costs/AutomationCostTable";

export default function AdminAutomationCostsPage() {
  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      <AutomationCostTable orgId={null} seat="admin" />
    </div>
  );
}
