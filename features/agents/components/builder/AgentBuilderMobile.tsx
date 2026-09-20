"use client";

import { AgentBuilderLeftPanel } from "./AgentBuilderLeftPanel";
import { AgentBuilderRightPanel } from "./AgentBuilderRightPanel";
import { AgentBuilderReadOnlyFrame } from "./AgentBuilderReadOnlyFrame";

interface AgentBuilderMobileProps {
  agentId: string;
}

export function AgentBuilderMobile({ agentId }: AgentBuilderMobileProps) {
  return (
    <div className="matrx-touch-targets h-full overflow-y-auto overscroll-contain bg-textured pb-safe pt-[var(--shell-header-h)]">
      <section
        aria-labelledby="agent-builder-mobile-configure"
        className="bg-card"
      >
        <div className="border-b border-border px-4 py-3">
          <p
            id="agent-builder-mobile-configure"
            className="text-sm font-semibold text-foreground"
          >
            Configure
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Set the instructions, capabilities, and inputs for this agent.
          </p>
        </div>
        <div className="px-4 pb-4">
          <AgentBuilderReadOnlyFrame agentId={agentId} className="min-h-full">
            <AgentBuilderLeftPanel agentId={agentId} />
          </AgentBuilderReadOnlyFrame>
        </div>
      </section>

      <section
        aria-labelledby="agent-builder-mobile-test"
        className="mt-3 min-h-[42rem] border-y border-border bg-card"
      >
        <div className="border-b border-border px-4 py-3">
          <p
            id="agent-builder-mobile-test"
            className="text-sm font-semibold text-foreground"
          >
            Test
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Run the draft here before saving a version.
          </p>
        </div>
        <div className="h-[36rem] px-3 pb-3">
          <AgentBuilderRightPanel agentId={agentId} />
        </div>
      </section>
    </div>
  );
}
