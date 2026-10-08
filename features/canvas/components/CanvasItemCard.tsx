"use client";

/**
 * CanvasItemCard — one canvas_items row rendered by id through the artifact
 * renderer registry, exactly as its chat block renders. The chat package's
 * `CanvasItemCard` slot: a tool that wrote a new artifact version (edit_artifact)
 * shows THAT version's card under its result bar (rendered-output standard
 * ruling 1 — the patching turn carries the new version).
 */

import { useEffect, useState } from "react";
import { RegionSkeleton } from "@ai-matrx/design-system/controls";
import { ArtifactRender } from "@/features/canvas/artifact-types/artifact-renderers";
import {
  canvasArtifactService,
  type CanvasArtifactRow,
} from "@/features/canvas/services/canvasArtifactService";

/** The chat package's `CanvasItemCardProps`. */
interface CanvasItemCardProps {
  canvasItemId: string;
  version?: number;
}

type Read =
  | { status: "loading" }
  | { status: "ready"; row: CanvasArtifactRow }
  | { status: "missing" }
  | { status: "error"; message: string };

export function CanvasItemCard({ canvasItemId }: CanvasItemCardProps) {
  const [read, setRead] = useState<Read>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setRead({ status: "loading" });
    canvasArtifactService.getById(canvasItemId).then(
      (row) => {
        if (!cancelled) setRead(row ? { status: "ready", row } : { status: "missing" });
      },
      (error: unknown) => {
        if (!cancelled) {
          setRead({ status: "error", message: error instanceof Error ? error.message : "Could not read it." });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [canvasItemId]);

  if (read.status === "loading") return <RegionSkeleton count={2} />;
  if (read.status === "missing") {
    return <p className="text-xs text-muted-foreground">This version was removed.</p>;
  }
  if (read.status === "error") {
    return <p className="text-xs text-destructive">This version could not be loaded: {read.message}</p>;
  }
  const { row } = read;
  const content = (row.content ?? {}) as { data?: unknown; metadata?: Record<string, unknown> };
  return (
    <ArtifactRender
      canvasType={row.type}
      mode="inline"
      artifactId={row.id}
      data={content.data}
      raw={typeof content.data === "string" ? content.data : undefined}
      metadata={content.metadata}
      conversationId={row.conversation_id ?? undefined}
      messageId={row.source_message_id ?? undefined}
      isStreamActive={false}
    />
  );
}
