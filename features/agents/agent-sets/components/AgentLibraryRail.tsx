// features/agents/agent-sets/components/AgentLibraryRail.tsx
//
// The builder's left rail: every agent the user can add to the set. It reuses the
// CANONICAL agent filter system (the same one /agents/all uses) — its own
// `useAgentConsumer` slot + the filtered selectors + <DesktopFilterPanel> — so
// Mine/Shared/All tabs, category/tag filters, sort and search all work exactly as
// elsewhere. Current members + the orchestrator are excluded. Each row is
// draggable (drop onto the canvas), clickable (adds to the end), and has a peek.

"use client";

import { useMemo } from "react";
import { Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppSelector } from "@/lib/redux/hooks";
import { useAgentConsumer } from "@/features/agents/hooks/useAgentConsumer";
import {
  makeSelectFilteredOwnedAgents,
  makeSelectFilteredSharedAgents,
  selectAllAgentCategories,
  selectAllAgentTags,
  selectTotalSharedAgentsCount,
} from "@/features/agents/redux/agent-consumers/selectors";
import { DesktopFilterPanel } from "@/features/agents/components/shared/DesktopFilterPanel";
import { AgentPeekButton } from "./AgentPeekButton";

/** MIME key used to hand an agent id from the rail to the canvas drop target. */
export const AGENT_DND_MIME = "application/x-matrx-agent-id";

const LIBRARY_CONSUMER = "agent-sets-library";

/** Bridge DesktopFilterPanel's whole-array setter onto the consumer's per-item toggle. */
function applyArrayViaToggle(current: string[], next: string[], toggle: (v: string) => void) {
  const cur = new Set(current);
  const nxt = new Set(next);
  current.forEach((v) => !nxt.has(v) && toggle(v)); // removed
  next.forEach((v) => !cur.has(v) && toggle(v)); // added
}

export interface AgentLibraryRailProps {
  orchestratorId: string;
  memberIds: string[];
  onAdd: (agentId: string) => void;
}

export function AgentLibraryRail({ orchestratorId, memberIds, onAdd }: AgentLibraryRailProps) {
  const consumer = useAgentConsumer(LIBRARY_CONSUMER, { initialTab: "mine" });

  const selOwned = useMemo(() => makeSelectFilteredOwnedAgents(LIBRARY_CONSUMER), []);
  const selShared = useMemo(() => makeSelectFilteredSharedAgents(LIBRARY_CONSUMER), []);
  const owned = useAppSelector(selOwned);
  const shared = useAppSelector(selShared);
  const allCategories = useAppSelector(selectAllAgentCategories);
  const allTags = useAppSelector(selectAllAgentTags);
  const totalShared = useAppSelector(selectTotalSharedAgentsCount);

  const excluded = useMemo(
    () => new Set([orchestratorId, ...memberIds]),
    [orchestratorId, memberIds],
  );

  const available = useMemo(() => {
    const base =
      consumer.tab === "shared" ? shared : consumer.tab === "mine" ? owned : [...owned, ...shared];
    return base.filter((a) => !excluded.has(a.id));
  }, [consumer.tab, owned, shared, excluded]);

  const activeFilterCount =
    consumer.includedCats.length +
    consumer.includedTags.length +
    (consumer.favFilter !== "all" ? 1 : 0) +
    (consumer.archFilter !== "active" ? 1 : 0);

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-card/40">
      <div className="shrink-0 space-y-2 border-b border-border p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground">Agent library</span>
          <span className="text-[11px] text-muted-foreground">{available.length}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={consumer.searchTerm}
              onChange={(e) => consumer.setSearchTerm(e.target.value)}
              placeholder="Search agents…"
              className="h-8 pl-8 text-sm"
            />
          </div>
          <DesktopFilterPanel
            iconOnly
            sortBy={consumer.sortBy}
            setSortBy={consumer.setSortBy}
            activeTab={consumer.tab}
            setActiveTab={consumer.setTab}
            includedCats={consumer.includedCats}
            setIncludedCats={(next) =>
              applyArrayViaToggle(consumer.includedCats, next, consumer.toggleCategory)
            }
            includedTags={consumer.includedTags}
            setIncludedTags={(next) =>
              applyArrayViaToggle(consumer.includedTags, next, consumer.toggleTag)
            }
            favFilter={consumer.favFilter}
            setFavFilter={consumer.setFavFilter}
            archFilter={consumer.archFilter}
            setArchFilter={consumer.setArchFilter}
            favoritesFirst={consumer.favoritesFirst}
            setFavoritesFirst={(v) => {
              if (v !== consumer.favoritesFirst) consumer.toggleFavoritesFirst();
            }}
            allCategories={allCategories}
            allTags={allTags}
            resetFilters={consumer.resetFilters}
            activeFilterCount={activeFilterCount}
            hasShared={totalShared > 0}
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {available.length === 0 && (
            <div className="px-2 py-8 text-center text-xs text-muted-foreground">
              No agents match. Adjust filters or search.
            </div>
          )}
          {available.map((a) => (
            <div
              key={a.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(AGENT_DND_MIME, a.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => onAdd(a.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") onAdd(a.id);
              }}
              className={cn(
                "group flex cursor-grab items-center gap-2 rounded-md border border-transparent px-2 py-1.5 transition-colors",
                "hover:border-border hover:bg-muted/60 active:cursor-grabbing",
              )}
              title="Drag onto the canvas or click to add"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">
                  {a.name || "Untitled Agent"}
                </div>
                {a.category && (
                  <div className="truncate text-[11px] text-muted-foreground">{a.category}</div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <AgentPeekButton agentId={a.id} />
                <Plus className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
