"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { agentListEmptyLabel } from "@/features/agents/constants/agent-list-labels";
import type { UseAgentConsumerReturn } from "@/features/agents/hooks/useAgentConsumer";
import type { AgentDefinitionRecord } from "@/features/agents/types/agent-definition.types";
import type { RightPanel } from "./types";
import { SearchInput } from "./primitives";
import { AgentFilterBar } from "./AgentFilterBar";
import { AgentListTabs, type AgentListTabCounts } from "./AgentListTabs";
import { AgentRow } from "./AgentRow";

export interface AgentListContentProps {
  agents: AgentDefinitionRecord[];
  isLoading: boolean;
  consumer: UseAgentConsumerReturn;
  activeAgentId: string | null;
  allCategories: string[];
  allTags: string[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSelectAgent: (a: AgentDefinitionRecord) => void;
  /** Per-row href for cmd/ctrl+click. Defaults to `/agents/[id]`. */
  resolveAgentHref?: (agent: AgentDefinitionRecord) => string;
  onReset: () => void;
  activeFilterCount: number;
  isMobile: boolean;
  hoveredAgent: AgentDefinitionRecord | null;
  onAgentHover: (a: AgentDefinitionRecord) => void;
  onAgentHoverEnd: (a: AgentDefinitionRecord) => void;
  onDetailPress: (a: AgentDefinitionRecord) => void;
  onFilterChipClick: (panel: "sort" | "categories" | "tags") => void;
  rightPanel: RightPanel;
  tabCounts: AgentListTabCounts;
  /** Label override for the builtin tab — admin surfaces pass "System". */
  systemTabLabel?: string;
  /** Resolved current agent — pinned at the top when the list opens. */
  pinnedAgent?: AgentDefinitionRecord | null;
  /** When true, scroll the list to the pinned row (top). */
  listOpen?: boolean;
}

export function AgentListContent({
  agents,
  isLoading,
  consumer,
  activeAgentId,
  allCategories,
  allTags,
  inputRef,
  onSelectAgent,
  resolveAgentHref,
  onReset,
  activeFilterCount,
  isMobile,
  hoveredAgent,
  onAgentHover,
  onAgentHoverEnd,
  onDetailPress,
  onFilterChipClick,
  rightPanel,
  tabCounts,
  systemTabLabel,
  pinnedAgent = null,
  listOpen = false,
}: AgentListContentProps) {
  const listScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listOpen && pinnedAgent) {
      listScrollRef.current?.scrollTo({ top: 0 });
    }
  }, [listOpen, pinnedAgent?.id]);

  const emptyLabel = agentListEmptyLabel(consumer.tab);

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-2 pt-2 pb-1 shrink-0">
        <SearchInput
          ref={inputRef}
          value={consumer.searchTerm}
          onChange={consumer.setSearchTerm}
          placeholder="Search agents..."
        />
      </div>

      <AgentListTabs
        consumer={consumer}
        tabCounts={tabCounts}
        systemTabLabel={systemTabLabel}
      />

      {/* Filter bar */}
      <AgentFilterBar
        consumer={consumer}
        allCategories={allCategories}
        allTags={allTags}
        activeFilterCount={activeFilterCount}
        isMobile={isMobile}
        rightPanel={rightPanel}
        onFilterChipClick={onFilterChipClick}
        onReset={onReset}
      />

      <div className="h-px bg-border shrink-0" />

      {/* Agent list */}
      <div ref={listScrollRef} className="overflow-y-auto flex-1 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Loading...</span>
          </div>
        ) : agents.length === 0 && !pinnedAgent ? (
          <div className="flex flex-col items-center py-8 text-muted-foreground">
            <span className="text-xs">{emptyLabel}</span>
          </div>
        ) : (
          <div className="py-0.5">
            {pinnedAgent && (
              <>
                <div className="px-3 pt-1.5 pb-0.5">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Current agent
                  </span>
                </div>
                <AgentRow
                  key={`pinned-${pinnedAgent.id}`}
                  agent={pinnedAgent}
                  isActive
                  isHovered={hoveredAgent?.id === pinnedAgent.id}
                  isMobile={isMobile}
                  onClick={() => onSelectAgent(pinnedAgent)}
                  href={resolveAgentHref?.(pinnedAgent)}
                  onHover={() => onAgentHover(pinnedAgent)}
                  onHoverEnd={() => onAgentHoverEnd(pinnedAgent)}
                  onDetailPress={() => onDetailPress(pinnedAgent)}
                />
                <div className="mx-2 my-0.5 h-px bg-border" />
              </>
            )}
            {agents.map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                isActive={agent.id === activeAgentId}
                isHovered={hoveredAgent?.id === agent.id}
                isMobile={isMobile}
                onClick={() => onSelectAgent(agent)}
                href={resolveAgentHref?.(agent)}
                onHover={() => onAgentHover(agent)}
                onHoverEnd={() => onAgentHoverEnd(agent)}
                onDetailPress={() => onDetailPress(agent)}
              />
            ))}
            {agents.length === 0 && pinnedAgent && (
              <div className="flex flex-col items-center py-4 text-muted-foreground">
                <span className="text-xs">{emptyLabel}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer count */}
      <div className="h-px bg-border shrink-0" />
      <div className="flex items-center justify-between px-2.5 py-1.5 shrink-0">
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {agents.length} agent{agents.length !== 1 ? "s" : ""}
        </span>
        {consumer.searchTerm && (
          <button
            onClick={() => consumer.setSearchTerm("")}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear search
          </button>
        )}
      </div>
    </div>
  );
}
