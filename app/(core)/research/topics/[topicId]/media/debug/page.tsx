"use client";

import MediaDebugPanel from "@/features/research/components/media/MediaDebugPanel";
import { useTopicContext } from "@/features/research/context/ResearchContext";
import { useResearchMedia } from "@/features/research/hooks/useResearchState";
import type { ResearchMedia } from "@/features/research/types";

export default function MediaDebugPage() {
  const { topicId } = useTopicContext();
  const { data: media } = useResearchMedia(topicId);
  const mediaList = (media as ResearchMedia[]) ?? [];

  return (
    <div className="p-3 sm:p-4 h-full min-h-0 flex flex-col">
      <MediaDebugPanel
        topicId={topicId}
        items={mediaList}
        totalCount={mediaList.length}
        scope="all"
        className="flex-1 min-h-0"
      />
    </div>
  );
}
