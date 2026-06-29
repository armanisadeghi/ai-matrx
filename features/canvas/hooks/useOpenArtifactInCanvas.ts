"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  openArtifactInCanvas,
  type CanvasContentType,
  type ArtifactDebugTrace,
} from "@/features/canvas/redux/canvasSlice";
import {
  ensureArtifactPersisted,
  type EnsureArtifactResult,
} from "@/features/canvas/materialization/ensureArtifactPersisted";

export interface OpenArtifactInCanvasInput {
  canvasType: CanvasContentType;
  title: string;
  content: string;
  messageId?: string | null;
  conversationId?: string | null;
  artifactIndex?: number;
  artifactId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Opens canvas bound to a real `canvas_items` UUID — never a raw snapshot.
 * Materializes on demand when the UUID doesn't exist yet.
 */
export function useOpenArtifactInCanvas() {
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<EnsureArtifactResult | null>(
    null,
  );

  const openArtifact = useCallback(
    async (input: OpenArtifactInCanvasInput): Promise<EnsureArtifactResult> => {
      setBusy(true);
      try {
        const result = await ensureArtifactPersisted({
          canvasType: input.canvasType,
          title: input.title,
          content: input.content,
          messageId: input.messageId,
          conversationId: input.conversationId,
          artifactIndex: input.artifactIndex,
          artifactId: input.artifactId,
          metadata: input.metadata,
        });

        setLastResult(result);

        if (!result.ok || !result.artifactId) {
          const detail = result.errors[0] ?? "Could not persist artifact";
          toast.error("Canvas requires a saved artifact", {
            description: detail,
          });
          return result;
        }

        const debugTrace: ArtifactDebugTrace = {
          steps: result.steps,
          errors: result.errors,
          ensuredAt: Date.now(),
          wasCreated: result.wasCreated,
        };

        dispatch(
          openArtifactInCanvas({
            artifactId: result.artifactId,
            type: input.canvasType,
            metadata: {
              title: input.title,
              canvasItemId: result.artifactId,
              conversationId: input.conversationId ?? undefined,
              messageId: input.messageId ?? undefined,
              artifactVersion: result.version ?? undefined,
              sourceMessageId: input.messageId ?? undefined,
            },
            artifactDebug: debugTrace,
          }),
        );

        return result;
      } finally {
        setBusy(false);
      }
    },
    [dispatch],
  );

  return { openArtifact, busy, lastResult };
}
