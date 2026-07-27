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
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface ResearchTopicShellProps {
  topicId: string;
  initialData?: TopicStoreInitialData;
  children: ReactNode;
}

/**
 * Which sub-route of the topic workspace is on screen — the segment after
 * `/research/topics/<id>`. The overview itself has no trailing segment.
 */
function activeViewFromPathname(
  pathname: string | null,
  topicId: string,
): string {
  if (!pathname) return "overview";
  const marker = `/research/topics/${topicId}`;
  const idx = pathname.indexOf(marker);
  if (idx === -1) return "overview";
  const rest = pathname.slice(idx + marker.length).replace(/^\//, "");
  return rest.split("/")[0] || "overview";
}

/** Registers live topic/progress scope for the header Agents chrome. */
function ResearchSurfaceRuntime({
  topicId,
  children,
}: {
  topicId: string;
  children: ReactNode;
}) {
  const { topic } = useTopicData();
  const progress = useTopicProgress();
  const pathname = usePathname();

  const getScope = () =>
    buildApplicationScopeFromMenuContext({
      selectedText:
        typeof window !== "undefined"
          ? (window.getSelection()?.toString() ?? "")
          : "",
      selectionRange: null,
      contextData: buildResearchContextData({
        topic,
        progress,
        activeView: activeViewFromPathname(pathname, topicId),
      }),
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
      <ResearchSurfaceRuntime topicId={topicId}>
        <ResearchLayoutShell topicId={topicId}>{children}</ResearchLayoutShell>
        <StreamDebugOverlay />
      </ResearchSurfaceRuntime>
    </TopicProvider>
  );
}
