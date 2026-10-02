"use client";

/**
 * The body of a `topical-map-topic` canvas tab: THE topic body
 * (`TopicDetailBody`) — the same one the window and the peek render. A topic
 * that is retired, rejected or merged closes its own tab.
 */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { TopicDetailBody } from "../panel/TopicDetailBody";
import { readTopicTabData } from "./topicKind";

export default function TopicCanvasView({ item, data, canvas }: CanvasKindProps) {
  const topic = readTopicTabData(data);
  if (!topic) {
    return <p className="p-4 text-sm text-muted-foreground">This tab names no topic.</p>;
  }
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <TopicDetailBody
        mapId={topic.mapId}
        slug={topic.slug}
        siteId={topic.siteId}
        host="drawer"
        onClose={() => canvas.close(item.id)}
      />
    </div>
  );
}
