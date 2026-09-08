"use client";

import { cn } from "@/lib/utils";
import { WORKFLOW_PICKER_TABS, type WorkflowTab } from "../types";
import type { WorkflowTabCounts } from "../useWorkflowListCore";

export interface WorkflowListTabsProps {
  tab: WorkflowTab;
  setTab: (tab: WorkflowTab) => void;
  counts: WorkflowTabCounts;
  /** Hard restriction for constrained pickers. */
  visibleTabs?: readonly WorkflowTab[];
}

/**
 * The scope strip. These are the SAME four scopes /workflows/all offers
 * (lib/list-scope) — a picker that invented its own words would teach a
 * meaning the rest of the platform does not share.
 */
export function WorkflowListTabs({
  tab,
  setTab,
  counts,
  visibleTabs,
}: WorkflowListTabsProps) {
  return (
    <div
      className="flex items-center gap-0.5 px-2 pb-1 overflow-x-auto scrollbar-none shrink-0"
      role="tablist"
      aria-label="Workflow scope"
    >
      {WORKFLOW_PICKER_TABS.filter(
        ({ value }) => !visibleTabs || visibleTabs.includes(value),
      ).map(({ value, label }) => {
        const active = tab === value;
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setTab(value)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors shrink-0",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            <span>{label}</span>
            <span
              className={cn("tabular-nums opacity-70", active && "opacity-90")}
            >
              {counts[value]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
