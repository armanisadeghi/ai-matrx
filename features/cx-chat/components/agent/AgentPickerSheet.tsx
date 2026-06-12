"use client";

// AgentPickerSheet — Phase 4b migration.
//
// Replaced old cx-chat useAgentConsumer (agentCacheSlice / prompts table) with
// direct reads from agentDefinition slice (agents table).
// Search is now local state; all agents are already loaded by useChatCatalogueInit.
// No more selectAgent() upgrade call — agentDefinition data is always full.

import { useState, useMemo, useRef, useEffect } from "react";
import {
  Search,
  X,
  Check,
  Cuboid,
  Loader2,
  Star,
  User,
  Globe,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectOwnedAgents,
  selectBuiltinAgents,
  selectAgentsSliceStatus,
} from "@/features/agents/redux/agent-definition/selectors";
import type { AgentDefinitionRecord } from "@/features/agents/types/agent-definition.types";
import { DEFAULT_AGENTS } from "@/features/cx-chat/components/agent/local-agents";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import type { AgentConfig } from "@/features/cx-chat/types/agents";
import { filterAndSortBySearch } from "@/utils/search-scoring";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toAgentConfig(agent: AgentDefinitionRecord): AgentConfig {
  return {
    promptId: agent.id,
    name: agent.name,
    description: agent.description ?? undefined,
    variableDefaults:
      agent.variableDefinitions as AgentConfig["variableDefaults"],
  };
}

// ── Filter type ───────────────────────────────────────────────────────────────

type FilterType = "all" | "system" | "mine";

const FILTERS: { id: FilterType; label: string; icon: React.ReactNode }[] = [
  { id: "all", label: "All", icon: <Globe className="h-3 w-3" /> },
  { id: "system", label: "System", icon: <Star className="h-3 w-3" /> },
  { id: "mine", label: "My Agents", icon: <User className="h-3 w-3" /> },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface AgentPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAgent?: AgentConfig | null;
  onSelect: (agent: AgentConfig) => void;
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-4 pb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
      {children}
    </div>
  );
}

function FilterToggles({
  active,
  onChange,
  systemCount,
  userCount,
}: {
  active: FilterType;
  onChange: (filter: FilterType) => void;
  systemCount: number;
  userCount: number;
}) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
      {FILTERS.map((f) => {
        const isActive = active === f.id;
        const count =
          f.id === "system"
            ? systemCount
            : f.id === "mine"
              ? userCount
              : systemCount + userCount;
        return (
          <button
            key={f.id}
            onClick={() => onChange(f.id)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex-shrink-0 ${
              isActive
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            {f.icon}
            <span>{f.label}</span>
            <span
              className={`ml-0.5 ${isActive ? "text-background/70" : "text-muted-foreground/60"}`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Mobile agent list item ────────────────────────────────────────────────────

function MobileAgentItem({
  promptId,
  name,
  description,
  isSelected,
  icon,
  onSelect,
}: {
  promptId: string;
  name: string;
  description?: string | null;
  isSelected: boolean;
  icon?: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 text-left transition-colors rounded-xl px-4 py-3 ${
        isSelected
          ? "bg-primary/10 dark:bg-primary/15"
          : "hover:bg-accent/60 active:bg-accent"
      }`}
    >
      <div className="flex-shrink-0 flex items-center justify-center rounded-lg bg-muted w-9 h-9">
        <span className="text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">
          {icon || <Cuboid className="h-4 w-4" />}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-medium text-foreground truncate">
          {name}
        </div>
        {description && (
          <div className="text-[13px] text-muted-foreground line-clamp-1 mt-0.5">
            {description}
          </div>
        )}
      </div>
      {isSelected && (
        <div className="flex-shrink-0">
          <Check className="h-4 w-4 text-primary" />
        </div>
      )}
    </button>
  );
}

// ── Desktop agent card ────────────────────────────────────────────────────────

function DesktopAgentCard({
  promptId,
  name,
  description,
  varCount,
  isSelected,
  icon,
  badge,
  onSelect,
}: {
  promptId: string;
  name: string;
  description?: string | null;
  varCount?: number;
  isSelected: boolean;
  icon?: React.ReactNode;
  badge?: string;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`group relative flex flex-col items-start gap-2 p-3 rounded-xl border text-left transition-all duration-150 ${
        isSelected
          ? "border-primary/40 bg-primary/5 dark:bg-primary/10 ring-1 ring-primary/20"
          : "border-border hover:border-primary/30 hover:bg-accent/40 active:bg-accent/60"
      }`}
    >
      <div className="flex items-start justify-between w-full">
        <div
          className={`flex items-center justify-center rounded-lg w-8 h-8 ${isSelected ? "bg-primary/15" : "bg-muted"}`}
        >
          <span
            className={`[&_svg]:h-4 [&_svg]:w-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
          >
            {icon || <Cuboid className="h-4 w-4" />}
          </span>
        </div>
        {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
      </div>

      <div className="w-full">
        <div className="text-sm font-medium text-foreground truncate leading-tight">
          {name}
        </div>
        {description && (
          <div className="text-xs text-muted-foreground line-clamp-2 mt-1 leading-relaxed">
            {description}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 mt-auto">
        {badge && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
            {badge}
          </span>
        )}
        {(varCount ?? 0) > 0 && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
            {varCount} {varCount === 1 ? "input" : "inputs"}
          </span>
        )}
      </div>
    </button>
  );
}

// ── Mobile bottom sheet ───────────────────────────────────────────────────────

function MobileAgentPicker({
  open,
  onOpenChange,
  selectedAgent,
  onSelect,
}: AgentPickerSheetProps) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");

  const owned = useAppSelector(selectOwnedAgents);
  const builtins = useAppSelector(selectBuiltinAgents);
  const status = useAppSelector(selectAgentsSliceStatus);
  const isLoading = status === "loading";

  useEffect(() => {
    if (!open) {
      setSearchTerm("");
      setShowSearch(false);
      setFilter("all");
    }
  }, [open]);

  const q = searchTerm.toLowerCase().trim();

  const filteredSystem = useMemo(() => {
    if (filter === "mine") return [];
    if (!q) return DEFAULT_AGENTS;
    return filterAndSortBySearch(DEFAULT_AGENTS, q, [
      { get: (a) => a.name, weight: "title" },
      { get: (a) => a.description, weight: "body" },
    ]);
  }, [q, filter]);

  const filteredBuiltins = useMemo(() => {
    if (filter === "mine") return [];
    if (!q) return builtins;
    return filterAndSortBySearch(builtins, q, [
      { get: (a) => a.name, weight: "title" },
      { get: (a) => a.description, weight: "body" },
    ]);
  }, [builtins, q, filter]);

  const filteredOwned = useMemo(() => {
    if (filter === "system") return [];
    if (!q) return owned;
    return filterAndSortBySearch(owned, q, [
      { get: (a) => a.name, weight: "title" },
      { get: (a) => a.description, weight: "body" },
    ]);
  }, [owned, q, filter]);

  const systemCount = DEFAULT_AGENTS.length + builtins.length;

  const handleSelectBuiltin = (agent: AgentDefinitionRecord) => {
    onSelect(toAgentConfig(agent));
    onOpenChange(false);
    setSearchTerm("");
    setFilter("all");
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85dvh]">
        <div className="flex items-center justify-between px-4 pt-2 pb-1">
          <DrawerTitle className="text-base font-semibold">
            Choose an Agent
          </DrawerTitle>
          <button
            onClick={() => {
              if (showSearch) {
                setSearchTerm("");
                setShowSearch(false);
              } else setShowSearch(true);
            }}
            className="p-2 -mr-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
          >
            {showSearch ? (
              <X className="h-5 w-5" />
            ) : (
              <Search className="h-5 w-5" />
            )}
          </button>
        </div>

        {showSearch && (
          <div className="px-4 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search agents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-muted text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 border-0"
                style={{ fontSize: "16px" }}
              />
            </div>
          </div>
        )}

        <div className="px-4 pb-2">
          <FilterToggles
            active={filter}
            onChange={setFilter}
            systemCount={systemCount}
            userCount={owned.length}
          />
        </div>

        <div
          className="flex-1 overflow-y-auto overscroll-contain"
          style={{
            paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))",
          }}
        >
          {(filteredSystem.length > 0 || filteredBuiltins.length > 0) && (
            <>
              <SectionHeader>System Agents</SectionHeader>
              <div className="px-2">
                {filteredSystem.map((agent) => (
                  <MobileAgentItem
                    key={agent.id}
                    promptId={agent.promptId}
                    name={agent.name}
                    description={agent.description}
                    icon={
                      (agent as typeof agent & { icon?: React.ReactNode }).icon
                    }
                    isSelected={selectedAgent?.promptId === agent.promptId}
                    onSelect={() => {
                      onSelect({
                        promptId: agent.promptId,
                        name: agent.name,
                        description: agent.description,
                      });
                      onOpenChange(false);
                    }}
                  />
                ))}
                {filteredBuiltins.map((agent) => (
                  <MobileAgentItem
                    key={agent.id}
                    promptId={agent.id}
                    name={agent.name}
                    description={agent.description}
                    isSelected={selectedAgent?.promptId === agent.id}
                    onSelect={() => handleSelectBuiltin(agent)}
                  />
                ))}
              </div>
            </>
          )}

          {filteredOwned.length > 0 && (
            <>
              <SectionHeader>My Agents</SectionHeader>
              <div className="px-2">
                {filteredOwned.map((agent) => (
                  <MobileAgentItem
                    key={agent.id}
                    promptId={agent.id}
                    name={agent.name}
                    description={agent.description}
                    isSelected={selectedAgent?.promptId === agent.id}
                    onSelect={() => handleSelectBuiltin(agent)}
                  />
                ))}
              </div>
            </>
          )}

          {isLoading && filteredOwned.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading agents...</span>
            </div>
          )}

          {filteredSystem.length === 0 &&
            filteredBuiltins.length === 0 &&
            filteredOwned.length === 0 &&
            !isLoading && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No agents found
              </div>
            )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ── Desktop modal ─────────────────────────────────────────────────────────────

function DesktopAgentPicker({
  open,
  onOpenChange,
  selectedAgent,
  onSelect,
}: AgentPickerSheetProps) {
  const [filter, setFilter] = useState<FilterType>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const owned = useAppSelector(selectOwnedAgents);
  const builtins = useAppSelector(selectBuiltinAgents);
  const status = useAppSelector(selectAgentsSliceStatus);
  const isLoading = status === "loading";

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearchTerm("");
      setFilter("all");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onOpenChange]);

  const q = searchTerm.toLowerCase().trim();

  const filteredSystem = useMemo(() => {
    if (filter === "mine") return [];
    if (!q) return DEFAULT_AGENTS;
    return filterAndSortBySearch(DEFAULT_AGENTS, q, [
      { get: (a) => a.name, weight: "title" },
      { get: (a) => a.description, weight: "body" },
    ]);
  }, [q, filter]);

  const filteredBuiltins = useMemo(() => {
    if (filter === "mine") return [];
    if (!q) return builtins;
    return filterAndSortBySearch(builtins, q, [
      { get: (a) => a.name, weight: "title" },
      { get: (a) => a.description, weight: "body" },
    ]);
  }, [builtins, q, filter]);

  const filteredOwned = useMemo(() => {
    if (filter === "system") return [];
    if (!q) return owned;
    return filterAndSortBySearch(owned, q, [
      { get: (a) => a.name, weight: "title" },
      { get: (a) => a.description, weight: "body" },
    ]);
  }, [owned, q, filter]);

  const systemCount = DEFAULT_AGENTS.length + builtins.length;
  const totalResults =
    filteredSystem.length + filteredBuiltins.length + filteredOwned.length;

  const handleSelect = (agent: AgentDefinitionRecord) => {
    onSelect(toAgentConfig(agent));
    onOpenChange(false);
    setSearchTerm("");
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] animate-in fade-in-0 duration-150"
        onClick={() => onOpenChange(false)}
      />
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12dvh] pointer-events-none">
        <div
          className="pointer-events-auto w-[560px] max-h-[70dvh] bg-popover rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search + filters */}
          <div className="px-4 pt-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search agents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-muted text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 border-0"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between mt-3">
              <FilterToggles
                active={filter}
                onChange={setFilter}
                systemCount={systemCount}
                userCount={owned.length}
              />
              {searchTerm && (
                <span className="text-xs text-muted-foreground">
                  {totalResults} {totalResults === 1 ? "result" : "results"}
                </span>
              )}
            </div>
          </div>

          <div className="w-full h-px bg-border" />

          {/* Agent grid */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
            {(filteredSystem.length > 0 || filteredBuiltins.length > 0) && (
              <div className="mb-4">
                {filter === "all" && filteredOwned.length > 0 && (
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    System
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {filteredSystem.map((agent) => (
                    <DesktopAgentCard
                      key={agent.id}
                      promptId={agent.promptId}
                      name={agent.name}
                      description={agent.description}
                      varCount={agent.variableDefaults?.length}
                      icon={
                        (agent as typeof agent & { icon?: React.ReactNode })
                          .icon
                      }
                      isSelected={selectedAgent?.promptId === agent.promptId}
                      onSelect={() => {
                        onSelect({
                          promptId: agent.promptId,
                          name: agent.name,
                          description: agent.description,
                        });
                        onOpenChange(false);
                      }}
                      badge="System"
                    />
                  ))}
                  {filteredBuiltins.map((agent) => (
                    <DesktopAgentCard
                      key={agent.id}
                      promptId={agent.id}
                      name={agent.name}
                      description={agent.description}
                      varCount={agent.variableDefinitions?.length}
                      isSelected={selectedAgent?.promptId === agent.id}
                      onSelect={() => handleSelect(agent)}
                      badge="System"
                    />
                  ))}
                </div>
              </div>
            )}

            {filteredOwned.length > 0 && (
              <div className="mb-2">
                {filter === "all" &&
                  (filteredSystem.length > 0 ||
                    filteredBuiltins.length > 0) && (
                    <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      My Agents
                    </div>
                  )}
                <div className="grid grid-cols-2 gap-2">
                  {filteredOwned.map((agent) => (
                    <DesktopAgentCard
                      key={agent.id}
                      promptId={agent.id}
                      name={agent.name}
                      description={agent.description}
                      varCount={agent.variableDefinitions?.length}
                      isSelected={selectedAgent?.promptId === agent.id}
                      onSelect={() => handleSelect(agent)}
                    />
                  ))}
                </div>
              </div>
            )}

            {isLoading && filteredOwned.length === 0 && filter !== "system" && (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading agents...</span>
              </div>
            )}

            {totalResults === 0 && !isLoading && (
              <div className="py-12 text-center">
                <Cuboid className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  {searchTerm
                    ? `No agents matching "${searchTerm}"`
                    : "No agents available"}
                </p>
              </div>
            )}
          </div>

          <div className="px-4 py-2 border-t border-border flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>
              <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">
                Esc
              </kbd>{" "}
              to close
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Unified export — Drawer on mobile, custom modal on desktop ────────────────

export function AgentPickerSheet(props: AgentPickerSheetProps) {
  const isMobile = useIsMobile();
  return isMobile ? (
    <MobileAgentPicker {...props} />
  ) : (
    <DesktopAgentPicker {...props} />
  );
}

export default AgentPickerSheet;
