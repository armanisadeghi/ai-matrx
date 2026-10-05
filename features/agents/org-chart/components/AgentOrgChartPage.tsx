// features/agents/org-chart/components/AgentOrgChartPage.tsx
//
// /agents/org-chart — the whole agent org chart the viewer can see.

"use client";

import { Network } from "lucide-react";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { AgentOrgChartView } from "./AgentOrgChartView";

export function AgentOrgChartPage() {
  return (
    <>
      <RecordPageHeader
        backHref="/agents"
        parents={[{ label: "Agents", href: "/agents" }]}
        record={{ name: "Org chart" }}
        actions={[{ label: "Orchestras", icon: Network, href: "/agents/orchestras", showLabel: true }]}
      />
      <div className="flex h-full flex-col overflow-hidden pt-[var(--shell-header-h)]">
        <div className="min-h-0 flex-1">
          <AgentOrgChartView />
        </div>
      </div>
    </>
  );
}
