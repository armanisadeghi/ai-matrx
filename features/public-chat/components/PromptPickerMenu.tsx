"use client";

import { useState, useMemo } from "react";
import { Search, Loader2, PartyPopper, ChevronDown } from "lucide-react";
import { LuBrain } from "react-icons/lu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useAgentCacheConsumer } from "@/features/agents/hooks/useAgentCacheConsumer";
import { DEFAULT_AGENTS } from "./AgentSelector";
import type { AgentConfig } from "../context/DEPRECATED-ChatContext";
import { filterAndSortBySearch } from "@/utils/search-scoring";

// ============================================================================
// TYPES
// ============================================================================

interface PromptPickerMenuProps {
  onSelect: (agent: AgentConfig) => void;
  disabled?: boolean;
  selectedAgent?: AgentConfig | null;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Truncate agent name for trigger button (compact); full name shown via title on hover.
 */
function truncateAgentName(name: string, maxLen = 20): string {
  if (name.length <= maxLen) return name;
  return name.substring(0, maxLen) + "…";
}

/**
 * @deprecated This component is deprecated. Use AgentPickerSheet instead.
 *
 * PromptPickerMenu - Combined menu for system agents and user prompts
 *
 * Features:
 * - System agents section (DEFAULT_AGENTS)
 * - User custom agents section (lazy-loaded)
 * - Search functionality
 * - Shows selected agent name (truncated)
 * - Brain icon for all agents
 *
 * MIGRATION: Replace with AgentPickerSheet which provides:
 * - Unified mobile (drawer) and desktop (dialog) experience
 * - Better responsive design
 * - Consistent with other agent selection UI
 */
export function PromptPickerMenu({
  onSelect,
  disabled = false,
  selectedAgent,
}: PromptPickerMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  // searchTerm lives in Redux so the selector filters across all fetched agents.
  // DEFAULT_AGENTS (hardcoded) are filtered locally since they're not in Redux.
  const {
    owned: userAgents,
    builtins,
    isLoading,
    selectAgent,
    searchTerm: searchQuery,
    setSearchTerm: setSearchQuery,
  } = useAgentCacheConsumer("prompt-picker", {
    ephemeral: true,
  });

  // DEFAULT_AGENTS are not in Redux — filter them locally against the Redux searchTerm
  const filteredSystemAgents = useMemo(() => {
    if (!searchQuery.trim()) return DEFAULT_AGENTS;
    return filterAndSortBySearch(DEFAULT_AGENTS, searchQuery, [
      { get: (a) => a.name, weight: "title" },
      { get: (a) => a.description, weight: "body" },
    ]);
  }, [searchQuery]);

  // builtins and userAgents are already filtered by the Redux selector
  const filteredBuiltins = builtins;
  const filteredUserAgents = userAgents;

  const handleSelectSystemAgent = (agent: (typeof DEFAULT_AGENTS)[0]) => {
    onSelect({
      promptId: agent.promptId,
      name: agent.name,
      description: agent.description,
      variableDefaults: agent.variableDefaults,
    });
    setIsOpen(false);
    setSearchQuery("");
  };

  const handleSelectAgent = async (
    id: string,
    source: "prompts" | "builtins" | "shared",
  ) => {
    await selectAgent(id, source, (fullAgent) => {
      onSelect({
        promptId: fullAgent.id,
        name: fullAgent.name,
        description: fullAgent.description,
        variableDefaults:
          fullAgent.variableDefaults as AgentConfig["variableDefaults"],
      });
    });
    setIsOpen(false);
    setSearchQuery("");
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) setSearchQuery("");
    setIsOpen(open);
  };

  const hasSystemResults =
    filteredSystemAgents.length > 0 || filteredBuiltins.length > 0;
  const hasUserResults = filteredUserAgents.length > 0;
  const hasResults = hasSystemResults || hasUserResults;
  const error = null; // errors are handled globally in agentCacheSlice

  // Get display name for selected agent
  const displayName = selectedAgent?.name
    ? truncateAgentName(selectedAgent.name)
    : "Select Agent";

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          className="p-1 rounded-xl flex items-center gap-1 border-2 border-border transition-colors text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed text-sm min-w-0 max-w-[200px]"
          title={
            selectedAgent?.name
              ? `Select agent: ${selectedAgent.name}`
              : "Select Agent"
          }
        >
          <LuBrain size={14} className="flex-shrink-0" />
          <span
            className="text-[11px] font-medium truncate"
            title={selectedAgent?.name}
          >
            {displayName}
          </span>
          <ChevronDown size={14} className="flex-shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="min-w-[280px] w-[360px] max-w-[min(90vw,400px)] p-0"
        align="start"
        side="top"
        sideOffset={8}
      >
        <div className="flex flex-col max-h-[500px]">
          {/* Header with Search */}
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search agents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-sm h-8"
                autoFocus
              />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {isLoading && userAgents.length === 0 ? (
              <div>
                {/* Show system agents while loading user prompts */}
                {hasSystemResults && (
                  <div>
                    <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      System Agents
                    </div>
                    <div className="pb-2">
                      {filteredSystemAgents.map((agent) => (
                        <AgentButton
                          key={agent.id}
                          name={agent.name}
                          description={agent.description}
                          variableCount={agent.variableDefaults?.length || 0}
                          isSelected={
                            selectedAgent?.promptId === agent.promptId
                          }
                          onClick={() => handleSelectSystemAgent(agent)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-col items-center justify-center py-8 text-gray-500 border-t border-border">
                  <Loader2 className="h-6 w-6 animate-spin mb-2" />
                  <span className="text-xs">Loading your agents...</span>
                </div>
              </div>
            ) : error ? (
              <div>
                {/* Show system agents even if user prompts failed */}
                {hasSystemResults && (
                  <div>
                    <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      System Agents
                    </div>
                    <div className="pb-2">
                      {filteredSystemAgents.map((agent) => (
                        <AgentButton
                          key={agent.id}
                          name={agent.name}
                          description={agent.description}
                          variableCount={agent.variableDefaults?.length || 0}
                          isSelected={
                            selectedAgent?.promptId === agent.promptId
                          }
                          onClick={() => handleSelectSystemAgent(agent)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-col items-center justify-center py-8 text-red-500 border-t border-border">
                  <span className="text-xs">Failed to load custom agents</span>
                </div>
              </div>
            ) : !hasResults ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                <span className="text-sm">
                  {searchQuery ? "No agents found" : "No agents available"}
                </span>
              </div>
            ) : (
              <div>
                {/* System Agents Section */}
                {hasSystemResults && (
                  <div>
                    <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      System Agents
                    </div>
                    <div className="pb-2">
                      {filteredSystemAgents.map((agent) => (
                        <AgentButton
                          key={agent.id}
                          name={agent.name}
                          description={agent.description}
                          variableCount={agent.variableDefaults?.length || 0}
                          isSelected={
                            selectedAgent?.promptId === agent.promptId
                          }
                          onClick={() => handleSelectSystemAgent(agent)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Builtin agents from Redux */}
                {filteredBuiltins.length > 0 && (
                  <div>
                    {filteredBuiltins.map((agent) => (
                      <AgentButton
                        key={agent.id}
                        name={agent.name}
                        description={agent.description}
                        variableCount={
                          Array.isArray(agent.variableDefaults)
                            ? agent.variableDefaults.length
                            : 0
                        }
                        isSelected={selectedAgent?.promptId === agent.id}
                        onClick={() => handleSelectAgent(agent.id, "builtins")}
                      />
                    ))}
                  </div>
                )}

                {/* User Custom Agents Section */}
                {hasUserResults && (
                  <div
                    className={hasSystemResults ? "border-t border-border" : ""}
                  >
                    <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      My Agents
                    </div>
                    <div className="pb-2">
                      {filteredUserAgents.map((agent) => (
                        <AgentButton
                          key={agent.id}
                          name={agent.name}
                          description={agent.description}
                          variableCount={
                            Array.isArray(agent.variableDefaults)
                              ? agent.variableDefaults.length
                              : 0
                          }
                          isSelected={selectedAgent?.promptId === agent.id}
                          onClick={() => handleSelectAgent(agent.id, "prompts")}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// AGENT BUTTON COMPONENT
// ============================================================================

interface AgentButtonProps {
  name: string;
  description?: string;
  variableCount: number;
  isSelected: boolean;
  onClick: () => void;
}

function AgentButton({
  name,
  description,
  variableCount,
  isSelected,
  onClick,
}: AgentButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 px-3 py-2.5 hover:bg-accent transition-colors text-left ${
        isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
      }`}
    >
      <div className="flex-shrink-0 mt-0.5">
        <LuBrain size={18} className="text-gray-600 dark:text-gray-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate"
          title={name}
        >
          {name}
        </div>
        {description && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
            {description}
          </div>
        )}
        {variableCount > 0 && (
          <div className="flex items-center gap-1 mt-1.5">
            <PartyPopper size={11} className="text-amber-500" />
            <span className="text-xs text-amber-600 dark:text-amber-400">
              {variableCount} variable{variableCount > 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>
      {isSelected && (
        <div className="flex-shrink-0 mt-1">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
        </div>
      )}
    </button>
  );
}

export default PromptPickerMenu;
