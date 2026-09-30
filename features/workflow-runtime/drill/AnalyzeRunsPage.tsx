"use client";

/**
 * `/workflows/runs/analyze` — the person's own runs as numbers, beside her runs list (lane
 * DRILL-CONVERSIONS). Same chrome as `RunsListPage`: `RouteHeader` with the way back to the list, body
 * `h-full overflow-hidden` with ONE inner scroll area flowing behind the glass header.
 */

import { BarChart3 } from "lucide-react";

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@ai-matrx/tap-target/buttons";

import { WorkflowRunsExplorer } from "./WorkflowRunsExplorer";

export function AnalyzeRunsPage() {
  return (
    <>
      <RouteHeader
        left={
          <div className="flex min-w-0 items-center">
            <ChevronLeftTapButton href="/workflows/runs" ariaLabel="Back to your runs" />
            <BarChart3 className="ml-1 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="ml-1.5 min-w-0 truncate text-sm font-medium text-foreground">Runs · Analyze</span>
          </div>
        }
      />
      <div className="h-full overflow-hidden">
        <div className="h-full overflow-y-auto pt-[var(--shell-header-h)]">
          <WorkflowRunsExplorer lane="mine" />
        </div>
      </div>
    </>
  );
}
