import { AgentModeController } from "../shared/AgentModeController";
import { AgentSaveStatus } from "../shared/AgentSaveStatus";
import { AgentOptionsMenu } from "../shared/AgentOptionsMenu";
import { ReviewAnswersLink } from "@/features/agents/decision-review/components/ReviewAnswersLink";
import Link from "next/link";
import { AgentSelectorIsland } from "../shared/AgentSelectorIsland";
import { ChevronLeftTapButton } from "@ai-matrx/tap-target/buttons";
import { AgentNewRunButton } from "../shared/AgentNewRunButton";
import { AgentHeaderMobile } from "../shared/AgentHeaderMobile";

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
    <>
    {/* Below lg: the agent family's phone header — the agent's name keeps the
        row; the modes, New run and the options fold into the shell's ⋮. It
        showed nothing at all on a phone before (page-pass, 2026-09-27). */}
    <div className="lg:hidden w-full">
      <AgentHeaderMobile
        agentId={agentId}
        agentName={agentName}
        basePath={basePath}
        extraActions={<AgentNewRunButton surfaceKey={surfaceKey} />}
      />
    </div>
    <div className="@container/agent-header hidden lg:flex items-center justify-between w-full gap-2 shrink-0">
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
        {basePath === "/agents" && <ReviewAnswersLink agentId={agentId} />}
        <AgentOptionsMenu agentId={agentId} basePath={basePath} />
      </div>
    </div>
    </>
  );
}
