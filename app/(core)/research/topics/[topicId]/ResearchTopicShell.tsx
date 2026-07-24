"use client";

import {
  TopicProvider,
  useTopicData,
  useTopicProgress,
} from "@/features/research/context/ResearchContext";
import ResearchLayoutShell from "@/features/research/components/shell/ResearchLayoutShell";
import { StreamDebugOverlay } from "@/features/research/components/shared/StreamDebugOverlay";
import {
  buildResearchContextData,
  RESEARCH_CONTEXT_MENU_PROPS,
} from "@/features/research/agent-context/buildResearchContextData";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { TopicStoreInitialData } from "@/features/research/state/topicStore";
import type { ReactNode } from "react";

interface ResearchTopicShellProps {
  topicId: string;
  initialData?: TopicStoreInitialData;
  children: ReactNode;
}

/** Registers live topic/progress scope for the header Agents chrome. */
function ResearchSurfaceRuntime({ children }: { children: ReactNode }) {
  const { topic } = useTopicData();
  const progress = useTopicProgress();

  const getScope = () =>
    buildApplicationScopeFromMenuContext({
      selectedText:
        typeof window !== "undefined"
          ? (window.getSelection()?.toString() ?? "")
          : "",
      selectionRange: null,
      contextData: buildResearchContextData({ topic, progress }),
    });

  return (
    <SurfaceRuntimeProvider
      surfaceName={RESEARCH_CONTEXT_MENU_PROPS.surfaceName}
      getScope={getScope}
      isEditable={false}
    >
      {children}
    </SurfaceRuntimeProvider>
  );
}

export default function ResearchTopicShell({
  topicId,
  initialData,
  children,
}: ResearchTopicShellProps) {
  return (
    <TopicProvider topicId={topicId} initialData={initialData}>
      <ResearchSurfaceRuntime>
        <ResearchLayoutShell topicId={topicId}>{children}</ResearchLayoutShell>
        <StreamDebugOverlay />
      </ResearchSurfaceRuntime>
    </TopicProvider>
  );
}
