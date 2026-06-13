"use client";

/**
 * AgentFindUsagesWindow — the user-facing "Find Usages" window.
 *
 * Shows every place THIS user's agent is used (own + org-managed usages in
 * full detail; everyone else's as aggregate counts) and surfaces drift red
 * flags first via the shared <AgentUsagesEngine mode="user">. Opened from the
 * agent options menu (useOpenAgentFindUsagesWindow) and from drift DM chips.
 *
 * Shell mirrors AgentRunWindow: a WindowPanel with an AgentListDropdown in the
 * title so a null agentId shows a picker instead of dead-ending.
 */

import { useCallback, useState } from "react";
import { Search } from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAgentName } from "@/features/agents/redux/agent-definition/selectors";
import type { RootState } from "@/lib/redux/store";
import { AgentUsagesEngine } from "@/features/agents/components/usages/AgentUsagesEngine";

interface AgentFindUsagesWindowProps {
  isOpen: boolean;
  onClose: () => void;
  agentId?: string | null;
}

export function AgentFindUsagesWindow({ isOpen, onClose, agentId }: AgentFindUsagesWindowProps) {
  const [selectedId, setSelectedId] = useState<string | null>(agentId ?? null);
  const effectiveId = selectedId ?? agentId ?? null;

  const agentName = useAppSelector((s: RootState) =>
    effectiveId ? (selectAgentName(s, effectiveId) ?? null) : null,
  );

  const handleSelect = useCallback((id: string) => setSelectedId(id), []);

  if (!isOpen) return null;

  return (
    <WindowPanel
      id="agent-find-usages-window"
      overlayId="agentFindUsagesWindow"
      titleNode={
        <div className="flex min-w-0 items-center gap-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="shrink-0 text-xs font-medium text-muted-foreground">Find Usages</span>
          <AgentListDropdown
            onSelect={handleSelect}
            label={effectiveId ? (agentName ?? "Agent") : "Select agent…"}
            noBorder
            compact
            className="max-w-[180px] rounded-none bg-transparent md:max-w-[240px]"
          />
        </div>
      }
      onClose={onClose}
      width={920}
      height={680}
      minWidth={520}
      minHeight={400}
      bodyClassName="p-0"
    >
      {effectiveId ? (
        <AgentUsagesEngine key={effectiveId} agentId={effectiveId} mode="user" />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
          <Search className="h-12 w-12 opacity-15" aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Pick an agent</p>
            <p className="text-xs opacity-60">
              Choose an agent from the title bar to see everywhere it&apos;s used and any drift.
            </p>
          </div>
        </div>
      )}
    </WindowPanel>
  );
}
