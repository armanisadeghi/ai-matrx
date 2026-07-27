// features/agents/agent-sets/components/OrchestratorInspector.tsx
//
// Right-side inspector for the ORCHESTRATOR itself — the mirror of
// MemberInspector for the hub node. Shows the same "core items" a member gets
// (a Quick-look snapshot + the agent's declared inputs/outputs via the shared
// AgentIODetails), plus the one thing unique to an orchestrator: direct access
// to its SYSTEM PROMPT, which our features can auto-generate. "View system
// prompt" opens the Agent Advanced Editor restricted to the System Instructions
// tab (the same single-tab panel the "Enable sync" flow uses).

"use client";

import Link from "next/link";
import { ExternalLink, FileText, Network, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { useOpenAgentContentWindow } from "@/features/overlays/openers/agentAdvancedEditorWindow";
import { AgentPeekButton } from "./AgentPeekButton";
import { AgentIODetails } from "./AgentIODetails";
import { accentClasses } from "./accents";
import type { SetAccent } from "../constants";

export interface OrchestratorInspectorProps {
  orchestratorId: string;
  accent: SetAccent;
  onClose: () => void;
}

export function OrchestratorInspector({
  orchestratorId,
  accent,
  onClose,
}: OrchestratorInspectorProps) {
  const a = accentClasses(accent);
  const agent = useAppSelector((s) => selectAgentById(s, orchestratorId));
  const openAgentContentWindow = useOpenAgentContentWindow();

  const openSystemPrompt = () =>
    openAgentContentWindow({
      initialAgentId: orchestratorId,
      initialTab: "system",
      tabs: ["system"],
    });

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-card">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-border p-3">
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg shadow-sm", a.glyph)}>
          <Network className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">
            {agent?.name ?? "Orchestrator"}
          </div>
          <div className="text-[11px] text-muted-foreground">Orchestrator</div>
        </div>
        <AgentPeekButton agentId={orchestratorId} />
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {agent?.description && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">About</div>
            <p className="text-xs leading-snug text-foreground">{agent.description}</p>
          </div>
        )}

        {/* Unique to the orchestrator: view/edit the system prompt (auto-generatable). */}
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">System prompt</div>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-1.5"
            onClick={openSystemPrompt}
          >
            <FileText className="h-3.5 w-3.5" /> View system prompt
          </Button>
          <p className="text-[11px] leading-snug text-muted-foreground">
            The orchestrator&apos;s instructions — including its auto-generated
            <span className="whitespace-nowrap"> &lt;available_agents&gt;</span> listing.
          </p>
        </div>

        {/* Same core I/O detail members get — what the orchestrator consumes + produces. */}
        <AgentIODetails agentId={orchestratorId} accent={accent} />

        <div className="flex flex-wrap gap-1.5">
          <Link href={`/agents/${orchestratorId}/build`} target="_blank">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" /> Open
            </Button>
          </Link>
          <Link href={`/agents/${orchestratorId}/run`} target="_blank">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Play className="h-3.5 w-3.5" /> Run
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
