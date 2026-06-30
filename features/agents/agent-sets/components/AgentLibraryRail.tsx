// features/agents/agent-sets/components/AgentLibraryRail.tsx
//
// The builder's left rail: every agent the user can add to the set, minus the
// orchestrator and current members. Each row is BOTH draggable (drop onto the
// canvas) and clickable (adds to the end) — drag for spatial control, click for
// speed/accessibility.

"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Webhook } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectPickableAgents } from "@/features/agents/redux/agent-sets/selectors";

/** MIME key used to hand an agent id from the rail to the canvas drop target. */
export const AGENT_DND_MIME = "application/x-matrx-agent-id";

export interface AgentLibraryRailProps {
  orchestratorId: string;
  memberIds: string[];
  onAdd: (agentId: string) => void;
}

export function AgentLibraryRail({ orchestratorId, memberIds, onAdd }: AgentLibraryRailProps) {
  const agents = useAppSelector(selectPickableAgents);
  const [search, setSearch] = useState("");

  const memberSet = useMemo(() => new Set([orchestratorId, ...memberIds]), [orchestratorId, memberIds]);

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agents
      .filter((a) => !memberSet.has(a.id))
      .filter(
        (a) =>
          !q ||
          a.name?.toLowerCase().includes(q) ||
          a.category?.toLowerCase().includes(q) ||
          a.tags?.some((t) => t.toLowerCase().includes(q)),
      );
  }, [agents, memberSet, search]);

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-card/40">
      <div className="shrink-0 border-b border-border p-2.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground">Agent library</span>
          <span className="text-[11px] text-muted-foreground">{available.length}</span>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents…"
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {available.length === 0 && (
            <div className="px-2 py-8 text-center text-xs text-muted-foreground">
              {agents.length === 0
                ? "Loading your agents…"
                : "Every agent is already in this set."}
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
                "group flex cursor-grab items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 transition-colors",
                "hover:border-border hover:bg-muted/60 active:cursor-grabbing",
              )}
              title="Drag onto the canvas or click to add"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Webhook className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">
                  {a.name || "Untitled Agent"}
                </div>
                {a.category && (
                  <div className="truncate text-[11px] text-muted-foreground">{a.category}</div>
                )}
              </div>
              <Plus className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
