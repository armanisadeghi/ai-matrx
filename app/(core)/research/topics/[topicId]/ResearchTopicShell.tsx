"use client";

import { TopicProvider } from "@/features/research/context/ResearchContext";
import { StreamDebugOverlay } from "@/features/research/components/shared/StreamDebugOverlay";
import { ResearchTopicSurfaceHost } from "@/features/research/components/shell/ResearchTopicSurfaceHost";
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

export default function ResearchTopicShell({
  topicId,
  initialData,
  children,
}: ResearchTopicShellProps) {
  const pathname = usePathname();
  return (
    <TopicProvider topicId={topicId} initialData={initialData}>
      <ResearchTopicSurfaceHost
        activeView={activeViewFromPathname(pathname, topicId)}
      >
        {/* Topic navigation is the shell sidebar's route menu
            (ResearchTopicSidebarMenu) — never a second page-local sidebar. */}
        <main className="h-full min-w-0 overflow-y-auto">{children}</main>
        <StreamDebugOverlay />
      </ResearchTopicSurfaceHost>
    </TopicProvider>
  );
}
