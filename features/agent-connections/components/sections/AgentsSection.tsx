"use client";

import React, { useMemo, useState } from "react";
import { Hexagon, ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { SectionToolbar } from "../SectionToolbar";
import { SectionFooter } from "../SectionFooter";
import { ListRow } from "../ListRow";
import { useAgents } from "../../hooks/useAgents";
import { selectSelectedItemId, setSelectedItemId } from "../../redux/ui/slice";
import type { AgentDefinitionRecord } from "@/features/agents/types/agent-definition.types";

export function AgentsSection() {
  const dispatch = useAppDispatch();
  const selectedItemId = useAppSelector(selectSelectedItemId);
  const [search, setSearch] = useState("");
  const { agents, loading } = useAgents();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        (a.description ?? "").toLowerCase().includes(q),
    );
  }, [agents, search]);

  const selected = selectedItemId
    ? (agents.find((a) => a.id === selectedItemId) ?? null)
    : null;

  if (selected) {
    return (
      <AgentDetail
        agent={selected}
        onBack={() => dispatch(setSelectedItemId(null))}
      />
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <SectionToolbar
        search={search}
        onSearchChange={setSearch}
        generateLabel="Generate Agent"
      />
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading && agents.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading agents…
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {search ? "No agents match your search." : "No agents yet."}
          </div>
        ) : (
          filtered.map((agent) => (
            <ListRow
              key={agent.id}
              icon={Hexagon}
              title={agent.name || "Untitled"}
              subtitle={agent.description ?? "No description"}
              onClick={() => dispatch(setSelectedItemId(agent.id))}
            />
          ))
        )}
      </div>
      <SectionFooter
        description="Agents define how AI behaves in your workspace — custom personas, tool access, and instructions for specific tasks."
        learnMoreLabel="Learn more about agents"
        learnMoreHref="#"
      />
    </div>
  );
}

function AgentDetail({
  agent,
  onBack,
}: {
  agent: AgentDefinitionRecord;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-4 py-3 shrink-0 border-b border-border/40">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className={cn(
            "inline-flex items-center justify-center h-8 w-8 rounded-md",
            "text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
          )}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex flex-col min-w-0">
          <div className="text-sm font-semibold text-foreground truncate">
            {agent.name || "Untitled"}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {agent.description ?? agent.id}
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto scrollbar-thin p-4 space-y-3 text-sm">
        <DetailField label="ID" value={agent.id} mono />
        <DetailField label="Name" value={agent.name} />
        <DetailField label="Description" value={agent.description ?? "—"} />
        <DetailField label="Model" value={agent.modelId ?? "—"} />
        <DetailField label="Agent type" value={agent.agentType} />
        <DetailField
          label="MCP servers"
          value={
            agent.mcpServers.length === 0 ? "—" : agent.mcpServers.join(", ")
          }
          mono
        />
        <DetailField
          label="Tools"
          value={
            agent.tools.length === 0 ? "—" : `${agent.tools.length} configured`
          }
        />
        <DetailField
          label="Messages"
          value={`${agent.messages.length} message${agent.messages.length === 1 ? "" : "s"}`}
        />
        <p className="text-xs text-muted-foreground pt-4 border-t border-border/40">
          Full normalized / source editor coming with the DetailEditor rollout.
        </p>
      </div>
    </div>
  );
}

function DetailField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-4">
      <div className="w-32 shrink-0 text-xs uppercase tracking-wide text-muted-foreground pt-0.5">
        {label}
      </div>
      <div
        className={cn(
          "flex-1 text-sm break-words",
          mono && "font-mono text-xs",
        )}
      >
        {value}
      </div>
    </div>
  );
}

export default AgentsSection;
