import { AgentModeController } from "../shared/AgentModeController";
import { AgentSaveStatus } from "../shared/AgentSaveStatus";
import { AgentOptionsMenu } from "../shared/AgentOptionsMenu";
import Link from "next/link";
import { AgentSelectorIsland } from "../shared/AgentSelectorIsland";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { AgentNewRunButton } from "../shared/AgentNewRunButton";

interface AgentRunHeaderProps {
  agentId: string;
  basePath: string;
  currentPath: string;
  agentName: string;
  surfaceKey: string;
  backHref?: string;
}

export function AgentRunHeader({
  agentId,
  agentName,
  surfaceKey,
  backHref = "/agents/all",
  basePath = "/agents",
  currentPath,
}: AgentRunHeaderProps) {
  return (
    <div className="hidden lg:flex items-center justify-between w-full gap-2 shrink-0">
      <div className="flex items-center">
        <ChevronLeftTapButton href={backHref} aria-label="Back to Agents" />
        <AgentSelectorIsland
          agentId={agentId}
          initialName={agentName}
          basePath={basePath}
          showNewRunButton={true}
          showBackButton={true}
          showVersion={false}
          showBuiltin={true}
        />
        <div className="pl-2">
          <AgentNewRunButton surfaceKey={surfaceKey} />
        </div>
      </div>
      <div>
        <AgentModeController
          agentId={agentId}
          basePath={basePath}
          currentPath={currentPath}
        />
      </div>
      <div className="flex items-center gap-1.5 pt-0.5 shrink-0">
        <AgentSaveStatus agentId={agentId} />
        <AgentOptionsMenu agentId={agentId} basePath={basePath} />
      </div>
    </div>
  );
}
