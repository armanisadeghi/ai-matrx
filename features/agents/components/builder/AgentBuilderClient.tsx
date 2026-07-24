"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAgentReadyForBuilder } from "@/features/agents/redux/agent-definition/selectors";
import { useAgentAutoSave } from "@/features/agents/hooks/useAgentAutoSave";
import { useCreatorOwnershipSync } from "@/features/agents/hooks/useCreatorOwnershipSync";
import { useAgentBuilderSurfaceScope } from "@/features/agents/hooks/useAgentBuilderSurfaceScope";
import { AGENT_BUILDER_CONTEXT_MENU_PROPS } from "@/features/agents/agent-context/buildAgentBuilderContextData";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileBuilderSkeleton } from "./AgentBuilderSkeletons";
import { DebugSessionActivator } from "@/features/agents/components/debug/DebugSessionActivator";

const AgentBuilderMobile = dynamic(
  () =>
    import("./AgentBuilderMobile").then((m) => ({
      default: m.AgentBuilderMobile,
    })),
  { ssr: false, loading: () => <MobileBuilderSkeleton /> },
);

interface AgentBuilderClientProps {
  agentId: string;
  desktopContent: React.ReactNode;
  fallback: React.ReactNode;
}

export function AgentBuilderClient({
  agentId,
  desktopContent,
  fallback,
}: AgentBuilderClientProps) {
  const [mounted, setMounted] = useState(false);
  const isMobile = useIsMobile();
  const isReady = useAppSelector((state) =>
    selectAgentReadyForBuilder(state, agentId),
  );
  const getAgentBuilderScope = useAgentBuilderSurfaceScope(agentId);

  useEffect(() => {
    setMounted(true);
  }, []);

  useAgentAutoSave(agentId);
  useCreatorOwnershipSync(agentId);

  // Gate on mounted so SSR + first client paint match: Redux may rehydrate before
  // hydration completes, which would otherwise render skeleton on server and real UI on client.
  if (!mounted || !isReady) return <>{fallback}</>;

  if (isMobile) {
    return (
      <SurfaceRuntimeProvider
        surfaceName={AGENT_BUILDER_CONTEXT_MENU_PROPS.surfaceName}
        getScope={getAgentBuilderScope}
        isEditable
      >
        <AgentBuilderMobile agentId={agentId} />
      </SurfaceRuntimeProvider>
    );
  }

  return (
    <SurfaceRuntimeProvider
      surfaceName={AGENT_BUILDER_CONTEXT_MENU_PROPS.surfaceName}
      getScope={getAgentBuilderScope}
      isEditable
    >
      <DebugSessionActivator />
      {desktopContent}
    </SurfaceRuntimeProvider>
  );
}
