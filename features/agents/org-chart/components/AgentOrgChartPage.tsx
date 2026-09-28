// features/agents/org-chart/components/AgentOrgChartPage.tsx
//
// /agents/org-chart — the whole agent org chart the viewer can see.

"use client";

import { useRouter } from "next/navigation";
import { GitFork } from "lucide-react";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { ChevronLeftTapButton } from "@ai-matrx/tap-target/buttons";
import HeaderActions from "@/features/shell/components/header/variants/shared/HeaderActions";
import type { HeaderAction } from "@/features/shell/components/header/variants/types";
import { AgentOrgChartView } from "./AgentOrgChartView";

export function AgentOrgChartPage() {
  const router = useRouter();
  const headerActions: HeaderAction[] = [
    { icon: "Network", label: "Orchestras", onPress: () => router.push("/agents/orchestras") },
  ];
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center">
          <ChevronLeftTapButton onClick={() => router.back()} variant="transparent" ariaLabel="Back" />
          <GitFork className="ml-1 h-4 w-4 shrink-0 rotate-180 text-muted-foreground" />
          <span className="ml-2 truncate text-sm font-semibold text-foreground">Org Chart</span>
          <div className="ml-auto flex items-center">
            <HeaderActions actions={headerActions} sheetTitle="Org Chart" />
          </div>
        </div>
      </PageHeader>
      <div className="flex h-full flex-col overflow-hidden pt-[var(--shell-header-h)]">
        <div className="min-h-0 flex-1">
          <AgentOrgChartView />
        </div>
      </div>
    </>
  );
}
