export const TYPESCRIPT_SNIPPET = `
"use client";

/**
 * AgentBuilderRightPanel — Test Run Panel
 *
 * Uses createManualInstance which reads from agentDefinition.agents[agentId] —
 * including dirty (unsaved) fields. So the test run always reflects the
 * current in-memory builder state, whether saved or not.
 */

import { Loader2 } from "lucide-react";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { AgentConversationColumn } from "../shared/AgentConversationColumn";
import type { ManagedAgentOptions } from "@/features/agents/types/instance.types";

interface AgentBuilderRightPanelProps {
  agentId: string;
}

export function AgentBuilderRightPanel({
  agentId,
}: AgentBuilderRightPanelProps) {
  const sourceFeature = "agent-builder";
  const surfaceKey = sourceFeature + ":" + agentId;

  const agentOptions: ManagedAgentOptions = {
    surfaceKey,
    sourceFeature,
    apiEndpointMode: "manual",
    showAutoClearToggle: true,
    autoClearConversation: true,
    config: {
      autoRun: false,
      allowChat: true,
      showVariablePanel: true,
    },
  };

  const { conversationId } = useAgentLauncher(agentId, agentOptions);

  if (!conversationId) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span className="text-sm">Initializing...</span>
      </div>
    );
  }

  return (
    <AgentConversationColumn
      conversationId={conversationId}
      surfaceKey={surfaceKey}
      smartInputProps={{
        showSubmitOnEnterToggle: true,
      }}
    />
  );
}
`;

export const ADDITIONAL_CONTEXT_SNIPPET = `

This is the parent file that has that one in it.

\`\`\`tsx
// /Users/armanisadeghi/code/matrx-admin/features/agents/components/builder/AgentBuilderDesktop.tsx

import { Suspense } from "react";
import { AgentBuilderLeftPanel } from "./AgentBuilderLeftPanel";
import { AgentBuilderRightPanel } from "./AgentBuilderRightPanel";
import { RightPanelSkeleton } from "./AgentBuilderSkeletons";

interface AgentBuilderDesktopProps {
  agentId: string;
}

export function AgentBuilderDesktop({ agentId }: AgentBuilderDesktopProps) {
  return (
    <div className="flex h-full">
      <div
        className="h-full overflow-hidden w-full max-w-[640px] shrink-0 px-2"
        style={{ paddingTop: "var(--shell-header-h)" }}
      >
        <AgentBuilderLeftPanel agentId={agentId} />
      </div>
      <div className="flex-1 h-full overflow-hidden flex justify-center">
        <div className="w-full max-w-3xl h-full pt-12">
          <Suspense fallback={<RightPanelSkeleton />}>
            <AgentBuilderRightPanel agentId={agentId} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
\`\`\`
`;
