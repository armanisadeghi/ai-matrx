"use client";

/**
 * The body of an artifact tab: the canonical CanvasBody (or its source), plus
 * the share sheet and admin debug panel when the tab's "…" menu asks for them.
 * Loaded lazily — the canvas pays for renderers only when a tab shows one.
 */

import dynamic from "next/dynamic";
import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { useScrollFade } from "@/components/ui/scroll-fade";
import { CanvasBody } from "@/features/canvas/core/CanvasBody";
import { CanvasSourceView } from "@/features/canvas/core/CanvasSourceView";
import { CanvasArtifactDebugPanel } from "@/features/canvas/components/CanvasArtifactDebugPanel";
import { getDefaultTitle, titleToString, type ArtifactDebugTrace } from "@/features/canvas/canvasContent";
import type { CanvasType } from "@/types/canvas-social";
import { contentOf, readArtifactItemData } from "./artifactItem";
import { useArtifactPanel, closeArtifactPanel } from "./artifactPanels";
import { ArtifactBodyOutputProvider } from "@/features/canvas/output/bodyOutput";

const CanvasShareSheet = dynamic(
  () => import("@/features/canvas/social/CanvasShareSheet").then((m) => m.CanvasShareSheet),
  { ssr: false },
);

export default function ArtifactCanvasView({ item }: CanvasKindProps) {
  const fade = useScrollFade<HTMLDivElement>();
  const panel = useArtifactPanel(item.id);
  const data = readArtifactItemData(item.data);
  if (!data) {
    return <div className="m-auto p-6 text-sm text-muted-foreground">This item has no content.</div>;
  }
  const content = contentOf(data);
  const title = titleToString(content.metadata?.title) || getDefaultTitle(content.type);

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      {panel === "debug" ? (
        <CanvasArtifactDebugPanel
          item={{
            id: item.id,
            content,
            timestamp: item.openedAt,
            savedItemId: data.savedItemId ?? undefined,
            artifactDebug: (data.artifactDebug ?? undefined) as ArtifactDebugTrace | undefined,
          }}
        />
      ) : null}
      <div
        ref={fade.ref}
        style={fade.style}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-overlay"
      >
        {data.view === "source" ? (
          <CanvasSourceView content={content} />
        ) : (
          // A live body (cloud browser, document) offers its print/capture to this tab's menu.
          <ArtifactBodyOutputProvider itemId={item.id}>
            <CanvasBody content={content} />
          </ArtifactBodyOutputProvider>
        )}
      </div>
      <CanvasShareSheet
        open={panel === "share"}
        onOpenChange={(open) => {
          if (!open) closeArtifactPanel(item.id);
        }}
        canvasData={content.data}
        canvasType={content.type as CanvasType}
        defaultTitle={title}
        hasScoring={content.type === "quiz" || content.type === "flashcards"}
      />
    </div>
  );
}
