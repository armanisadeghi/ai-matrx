"use client";

import { cn } from "@/lib/utils";
import { AGENT_PUBLIC_TAB_LABEL } from "@/features/agents/constants/agent-list-labels";
import type { AgentTab } from "@/features/agents/redux/agent-consumers/slice";
import type { UseAgentConsumerReturn } from "@/features/agents/hooks/useAgentConsumer";

export interface AgentListTabCounts {
  mine: number;
  shared: number;
  all: number;
  system: number;
}

const PICKER_TABS: {
  value: AgentTab;
  label: string;
  countKey: keyof AgentListTabCounts;
}[] = [
  { value: "mine", label: "Mine", countKey: "mine" },
  { value: "shared", label: "Shared", countKey: "shared" },
  { value: "all", label: "All", countKey: "all" },
  { value: "system", label: AGENT_PUBLIC_TAB_LABEL, countKey: "system" },
];

interface AgentListTabsProps {
  consumer: UseAgentConsumerReturn;
  tabCounts: AgentListTabCounts;
}

export function AgentListTabs({ consumer, tabCounts }: AgentListTabsProps) {
  return (
    <div
      className="flex items-center gap-0.5 px-2 pb-1 overflow-x-auto scrollbar-none shrink-0"
      role="tablist"
      aria-label="Agent ownership"
    >
      {PICKER_TABS.map(({ value, label, countKey }) => {
        const active = consumer.tab === value;
        const count = tabCounts[countKey];
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => consumer.setTab(value)}
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
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
