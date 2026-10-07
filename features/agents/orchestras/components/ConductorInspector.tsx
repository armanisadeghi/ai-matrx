// features/agents/orchestras/components/ConductorInspector.tsx
//
// Right-side inspector for the CONDUCTOR itself — the mirror of
// MemberInspector for the hub node. Shows the same "core items" a member gets
// (a Quick-look snapshot + the agent's declared inputs/outputs via the shared
// AgentIODetails), plus the one thing unique to an conductor: direct access
// to its SYSTEM PROMPT, which our features can auto-generate. "View system
// prompt" opens the Agent Advanced Editor restricted to the System Instructions
// tab (the same single-tab panel the "Enable sync" flow uses).

"use client";

import Link from "next/link";
import { ExternalLink, FileText, Network, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { useOpenAgentContentWindow } from "@/features/overlays/openers/agentAdvancedEditorWindow";
import { Button as ControlButton } from "@ai-matrx/design-system/controls";
import { AgentPeekButton } from "./AgentPeekButton";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { AgentIODetails } from "./AgentIODetails";
import { accentClasses } from "./accents";
import type { OrchestraAccent } from "../constants";
import { useAgentView } from "@ai-matrx/chat/agents/identity/agent-identity";

export interface ConductorInspectorProps {
  conductorId: string;
  accent: OrchestraAccent;
  onClose: () => void;
}

export function ConductorInspector({
  conductorId,
  accent,
  onClose,
}: ConductorInspectorProps) {
  const a = accentClasses(accent);
  const agent = useAgentView(conductorId);
  const openAgentContentWindow = useOpenAgentContentWindow();

  const openSystemPrompt = () =>
    openAgentContentWindow({
      initialAgentId: conductorId,
      initialTab: "system",
      tabs: ["system"],
    });

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-card">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-border p-3">
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg shadow-sm", a.glyph)}>
          <Network className="h-4 w-4" />
        </div>
        <div className="group/entity-ref min-w-0 flex-1">
          {/* THE DOOR LAW: the conductor is an agent with a route — name it
              and open it. An unloaded row shows its id, never a made-up label. */}
          <div className="truncate type-title text-foreground">
            <EntityRef
              token="agent"
              id={conductorId}
              name={agent?.name ?? null}
              showIcon={false}
              disablePeek
            />
          </div>
          <div className="type-meta text-muted-foreground">Conductor</div>
        </div>
        <AgentPeekButton agentId={conductorId} />
        <ControlButton variant="quiet" icon={<X />} aria-label="Close" title="Close" onClick={onClose} />
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {agent?.description && (
          <div className="space-y-1.5">
            <div className="type-secondary font-medium text-muted-foreground">About</div>
            <p className="type-secondary leading-snug text-foreground">{agent.description}</p>
          </div>
        )}

        {/* Unique to the conductor: view/edit the system prompt (auto-generatable). */}
        <div className="space-y-1.5">
          <div className="type-secondary font-medium text-muted-foreground">System prompt</div>
          <Button
            icon={<FileText />}
            variant="outline"
            className="w-full justify-start"
            onClick={openSystemPrompt}
          > View system prompt
          </Button>
          {/* The prompt includes the auto-generated <available_agents> listing. */}
        </div>

        {/* Same core I/O detail members get — what the conductor consumes + produces. */}
        <AgentIODetails agentId={conductorId} accent={accent} />

        <div className="flex flex-wrap gap-1.5">
          <Link href={`/agents/go/${conductorId}/build`} target="_blank">
            <Button icon={<ExternalLink />} type="submit" variant="outline"> Open
            </Button>
          </Link>
          <Link href={`/agents/go/${conductorId}/run`} target="_blank">
            <Button icon={<Play />} type="submit" variant="outline"> Run
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
