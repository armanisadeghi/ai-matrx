"use client";

/**
 * AgentListInlinePicker — embeddable agent browser (search + Mine/Shared/System tabs).
 *
 * Reuses the same core as `AgentListDropdown` (`useAgentListCore` +
 * `AgentListContent`) without a popover/drawer shell. Intended for surfaces
 * that dedicate a panel region to agent selection (ProTextarea Custom Agent, etc.).
 */

import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentDefinitionRecord } from "@/features/agents/types/agent-definition.types";
import { useAgentListCore } from "./useAgentListCore";
import { AgentListContent } from "./core/AgentListContent";
import { AgentDetailCard } from "./core/AgentDetailCard";
import { AgentMobileSubView } from "./core/AgentMobileSubView";

export interface AgentListInlinePickerProps {
  /** Unique consumer id for filter/tab state (see `useAgentConsumer`). */
  consumerId: string;
  onSelect: (agentId: string) => void;
  activeAgentId?: string | null;
  className?: string;
  /** Auto-focus the search field on mount. Default true. */
  autoFocusSearch?: boolean;
}

export function AgentListInlinePicker({
  consumerId,
  onSelect,
  activeAgentId = null,
  className,
  autoFocusSearch = true,
}: AgentListInlinePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [catSearch, setCatSearch] = useState("");
  const [tagSearch, setTagSearch] = useState("");
  const [mobileDetailAgent, setMobileDetailAgent] =
    useState<AgentDefinitionRecord | null>(null);
  const [mobileSubView, setMobileSubView] = useState<
    "sort" | "categories" | "tags" | null
  >(null);

  const {
    agents,
    isLoading,
    allCategories,
    allTags,
    consumer,
    tabCounts,
    activeFilterCount,
    hoveredAgent,
    ensureLoaded,
    handleSelectAgent: coreSelectAgent,
    handleAgentHover,
    handleAgentHoverEnd,
  } = useAgentListCore({ consumerId, onSelect });

  useEffect(() => {
    ensureLoaded();
    if (!autoFocusSearch) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [ensureLoaded, autoFocusSearch]);

  const handleSelectAgent = (agent: AgentDefinitionRecord) => {
    coreSelectAgent(agent);
    setMobileDetailAgent(null);
    setMobileSubView(null);
  };

  const handleFilterChipClick = (panel: "sort" | "categories" | "tags") => {
    setMobileSubView(panel);
  };

  // Single-column layout — no hover side panel (same as mobile drawer).
  const isMobile = true;

  if (mobileDetailAgent) {
    return (
      <div className={cn("flex h-full min-h-0 flex-col", className)}>
        <button
          type="button"
          onClick={() => setMobileDetailAgent(null)}
          className="flex shrink-0 items-center gap-1.5 border-b border-border px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-muted/30"
        >
          <ChevronRight className="h-4 w-4 rotate-180" />
          Back
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <AgentDetailCard
            agent={mobileDetailAgent}
            onSelect={() => handleSelectAgent(mobileDetailAgent)}
          />
        </div>
      </div>
    );
  }

  if (mobileSubView) {
    return (
      <div className={cn("flex h-full min-h-0 flex-col", className)}>
        <AgentMobileSubView
          view={mobileSubView}
          consumer={consumer}
          allCategories={allCategories}
          allTags={allTags}
          catSearch={catSearch}
          setCatSearch={setCatSearch}
          tagSearch={tagSearch}
          setTagSearch={setTagSearch}
          onBack={() => {
            setMobileSubView(null);
            setCatSearch("");
            setTagSearch("");
          }}
        />
      </div>
    );
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <AgentListContent
        agents={agents}
        isLoading={isLoading}
        consumer={consumer}
        activeAgentId={activeAgentId}
        allCategories={allCategories}
        allTags={allTags}
        inputRef={inputRef}
        onSelectAgent={handleSelectAgent}
        onReset={consumer.resetFilters}
        activeFilterCount={activeFilterCount}
        isMobile={isMobile}
        hoveredAgent={hoveredAgent}
        onAgentHover={(agent) => handleAgentHover(agent, false)}
        onAgentHoverEnd={(agent) => handleAgentHoverEnd(agent, () => {})}
        onDetailPress={setMobileDetailAgent}
        onFilterChipClick={handleFilterChipClick}
        rightPanel={null}
        tabCounts={tabCounts}
      />
    </div>
  );
}
