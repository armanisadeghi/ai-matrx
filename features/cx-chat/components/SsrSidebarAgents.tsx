"use client";

// SsrSidebarAgents — Agent list for the ssr/chat sidebar.
//
// Phase 4b migration: replaced cx-chat useAgentConsumer (agentCacheSlice, prompts table)
// with direct reads from agentDefinition slice (agents table, populated by Phase 1).
//
// Data: selectOwnedAgents / selectBuiltinAgents / selectSharedWithMeAgents selectors.
// Loading: selectAgentsSliceStatus.
// No selectAgent() upgrade call needed — agentDefinition data is always full.

import { useState, useMemo } from "react";
import { ChevronRight, Network, Lock, Search, X } from "lucide-react";
import { useSelector } from "react-redux";
import { selectUser } from "@/lib/redux/slices/userSlice";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectOwnedAgents,
  selectBuiltinAgents,
  selectSharedWithMeAgents,
  selectAgentsSliceStatus,
} from "@/features/agents/redux/agent-definition/selectors";
import type { AgentDefinitionRecord } from "@/features/agents/types/agent-definition.types";
import { filterAndSortBySearch } from "@/utils/search-scoring";

// Minimal agent shape needed by the sidebar — agentId drives navigation, name drives display.
interface SidebarAgent {
  promptId: string;
  name: string;
}

// ── Props ────────────────────────────────────────────────────────────────────

interface SsrSidebarAgentsProps {
  selectedAgent?: SidebarAgent | null;
  onAgentSelect?: (agent: SidebarAgent) => void;
  searchQuery?: string;
}

const DEFAULT_VISIBLE = 3;

// ── AgentListItem ─────────────────────────────────────────────────────────────

function AgentListItem({
  name,
  description,
  isSelected,
  onClick,
  newTabHref = "/demos/ssr/chat",
}: {
  name: string;
  description?: string | null;
  isSelected: boolean;
  onClick: () => void;
  newTabHref?: string;
}) {
  const handleClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      window.open(newTabHref, "_blank");
      return;
    }
    onClick();
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handleClick}
          className={`flex items-center gap-2 w-full px-2 py-[3px] rounded-md text-left transition-colors cursor-pointer ${
            isSelected
              ? "bg-accent/60 text-foreground"
              : "text-foreground/70 hover:bg-accent/40 hover:text-foreground"
          }`}
        >
          <Network className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          <span className="text-[11px] truncate flex-1">{name}</span>
          {isSelected && (
            <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
          )}
        </button>
      </TooltipTrigger>
      {description && (
        <TooltipContent
          side="right"
          sideOffset={8}
          collisionPadding={16}
          className="max-w-[200px] text-[11px] pointer-events-none"
        >
          {description}
        </TooltipContent>
      )}
    </Tooltip>
  );
}

// ── AgentSubsection ───────────────────────────────────────────────────────────

function AgentSubsection({
  title,
  agents,
  selectedAgentId,
  onSelect,
  emptyMessage,
  forceExpanded,
}: {
  title: string;
  agents: AgentDefinitionRecord[];
  selectedAgentId?: string | null;
  onSelect: (agent: AgentDefinitionRecord) => void;
  emptyMessage?: string;
  forceExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [localSearch, setLocalSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const expanded = forceExpanded || isExpanded;

  const filtered = useMemo(() => {
    if (!localSearch.trim()) return agents;
    return filterAndSortBySearch(agents, localSearch, [
      { get: (a) => a.name, weight: "title" },
      { get: (a) => a.description, weight: "body" },
    ]);
  }, [agents, localSearch]);

  const visible = expanded ? filtered : filtered.slice(0, DEFAULT_VISIBLE);
  const hasMore = filtered.length > DEFAULT_VISIBLE;
  const hiddenCount = filtered.length - DEFAULT_VISIBLE;

  const toggleSearch = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showSearch) {
      setLocalSearch("");
      setShowSearch(false);
    } else setShowSearch(true);
  };

  return (
    <div className="pt-0.5 pb-0.5">
      <div className="flex items-center gap-1 px-2 py-[3px]">
        <button
          onClick={() => setIsExpanded(!expanded)}
          className="flex items-center gap-1 flex-1 min-w-0 text-left"
        >
          <ChevronRight
            className={`h-2.5 w-2.5 text-muted-foreground transition-transform duration-150 flex-shrink-0 ${
              expanded ? "rotate-90" : ""
            }`}
          />
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider select-none truncate">
            {title}
          </span>
          {hasMore && !expanded && (
            <span className="text-[9px] text-muted-foreground ml-0.5 flex-shrink-0">
              +{hiddenCount}
            </span>
          )}
        </button>
        {agents.length > 3 && (
          <button
            onClick={toggleSearch}
            className="p-0.5 rounded text-muted-foreground hover:text-muted-foreground transition-colors flex-shrink-0"
            title="Search agents"
          >
            {showSearch ? (
              <X className="h-2.5 w-2.5" />
            ) : (
              <Search className="h-2.5 w-2.5" />
            )}
          </button>
        )}
      </div>

      {showSearch && (
        <div className="px-2 pb-1">
          <input
            type="text"
            placeholder="Filter..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            autoFocus
            className="w-full px-2 py-0.5 text-[11px] rounded bg-muted/50 text-foreground placeholder:text-muted-foreground outline-none focus:bg-muted/80 border-0"
            style={{ fontSize: "16px" }}
          />
        </div>
      )}

      <div className="px-1">
        {agents.length === 0 && emptyMessage && (
          <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-muted-foreground">
            <Lock className="h-2.5 w-2.5 flex-shrink-0" />
            <span>{emptyMessage}</span>
          </div>
        )}
        {visible.map((agent) => (
          <AgentListItem
            key={agent.id}
            name={agent.name}
            description={agent.description}
            isSelected={selectedAgentId === agent.id}
            onClick={() => onSelect(agent)}
            newTabHref={`/ssr/chat/a/${agent.id}`}
          />
        ))}
        {filtered.length === 0 && agents.length > 0 && localSearch && (
          <p className="px-2 py-1 text-[10px] text-muted-foreground">
            No matches
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SsrSidebarAgents({
  selectedAgent,
  onAgentSelect,
  searchQuery = "",
}: SsrSidebarAgentsProps) {
  const user = useSelector(selectUser);
  const isAuthenticated = !!user?.id;

  const owned = useAppSelector(selectOwnedAgents);
  const builtins = useAppSelector(selectBuiltinAgents);
  const shared = useAppSelector(selectSharedWithMeAgents);
  const status = useAppSelector(selectAgentsSliceStatus);
  const isLoading = status === "loading";

  // Apply external search query across all sources
  const filterByQuery = (agents: AgentDefinitionRecord[]) => {
    if (!searchQuery.trim()) return agents;
    return filterAndSortBySearch(agents, searchQuery, [
      { get: (a) => a.name, weight: "title" },
      { get: (a) => a.description, weight: "body" },
    ]);
  };

  const filteredOwned = useMemo(
    () => filterByQuery(owned),
    [owned, searchQuery],
  );
  const filteredBuiltins = useMemo(
    () => filterByQuery(builtins),
    [builtins, searchQuery],
  );
  const filteredShared = useMemo(
    () => filterByQuery(shared),
    [shared, searchQuery],
  );

  const handleSelect = (agent: AgentDefinitionRecord) => {
    onAgentSelect?.({
      promptId: agent.id,
      name: agent.name,
    });
  };

  const hasResults =
    filteredOwned.length > 0 ||
    filteredBuiltins.length > 0 ||
    filteredShared.length > 0;

  if (searchQuery && !hasResults) return null;

  return (
    <TooltipProvider delayDuration={400}>
      <div className="border-b border-border py-0.5">
        <AgentSubsection
          title="System Agents"
          agents={filteredBuiltins}
          selectedAgentId={selectedAgent?.promptId}
          onSelect={handleSelect}
          forceExpanded={!!searchQuery}
        />
        <AgentSubsection
          title="My Agents"
          agents={isAuthenticated ? filteredOwned : []}
          selectedAgentId={selectedAgent?.promptId}
          onSelect={handleSelect}
          emptyMessage={
            isAuthenticated
              ? isLoading
                ? "Loading..."
                : "No agents yet"
              : "Sign in to create agents"
          }
          forceExpanded={!!searchQuery}
        />
        {filteredShared.length > 0 && (
          <AgentSubsection
            title="Shared With Me"
            agents={filteredShared}
            selectedAgentId={selectedAgent?.promptId}
            onSelect={handleSelect}
            forceExpanded={!!searchQuery}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
