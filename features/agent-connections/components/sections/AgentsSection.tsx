"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Hexagon, ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { SectionToolbar } from "../SectionToolbar";
import { SectionFooter } from "../SectionFooter";
import { ListRow } from "../ListRow";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { EntityDoorControls } from "@/components/official/entity-ref/EntityDoorControls";
import { AiModelRef } from "@ai-matrx/chat/agents/components/identity-refs/AiIdentityRef";
import { useAgentModelLabel } from "@ai-matrx/chat/agents/hooks/useAgentModelLabel";
import { fetchAgentExecutionFull } from "@/features/agents/redux/builder-tier.thunks";
import { useAgents } from "../../hooks/useAgents";
import { ReadFailure } from "@ai-matrx/design-system";
import { selectSelectedItemId, setSelectedItemId } from "../../redux/ui/slice";
import type { AgentSummary } from "@ai-matrx/agents/catalog";
import { useAgentView } from "@ai-matrx/chat/agents/identity/agent-identity";

export function AgentsSection() {
  const dispatch = useAppDispatch();
  const selectedItemId = useAppSelector(selectSelectedItemId);
  const [search, setSearch] = useState("");
  const { agents, loading, error, reload } = useAgents();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter(
      (a) =>
        (a.name ?? "").toLowerCase().includes(q) ||
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
        ) : error && agents.length === 0 ? (
          <ReadFailure error={error} what="your agents" onRetry={reload} />
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
              // The row's click shows the agent in THIS panel; the doors open
              // the actual record (peek + new tab) without costing the user
              // the panel they are standing in.
              door={
                <EntityDoorControls
                  token="agent"
                  id={agent.id}
                  name={agent.name}
                />
              }
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
  agent: summary,
  onBack,
}: {
  agent: AgentSummary;
  onBack: () => void;
}) {
  // The detail pane names the model the agent USES — with its class when the
  // model has several. A list record carries no settings, so the pane reads
  // the agent's execution payload (skipped when already loaded).
  const dispatch = useAppDispatch();
  useEffect(() => {
    void dispatch(fetchAgentExecutionFull(summary.id));
  }, [dispatch, summary.id]);
  const { label: modelLabel } = useAgentModelLabel(summary.id);
  // The catalog row completed by the agent's loaded record (tools, servers, messages).
  const agent = useAgentView(summary.id);
  if (!agent) return null;
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
        <div className="group/entity-ref flex flex-col min-w-0">
          {/* The detail pane names the agent — so it opens it. */}
          <div className="text-sm font-semibold text-foreground truncate">
            <EntityRef
              token="agent"
              id={agent.id}
              name={agent.name}
              showIcon={false}
              alwaysShowActions
            />
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
        <DetailField
          label="Model"
          value={
            agent.modelId ? (
              <AiModelRef modelId={agent.modelId} name={modelLabel} showId />
            ) : (
              "—"
            )
          }
        />
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
  value: React.ReactNode;
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
