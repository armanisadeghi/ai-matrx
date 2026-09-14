"use client";

import { useCallback, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { reportCanvasOpenDrop } from "@/features/canvas/openRequest";
import { useCanvasOpenGuard } from "./useCanvasOpenGuard";
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
  const { ensureCanvasReachable } = useCanvasOpenGuard();
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<EnsureArtifactResult | null>(
    null,
  );

  const openArtifact = useCallback(
    async (input: OpenArtifactInCanvasInput): Promise<EnsureArtifactResult> => {
      // No canvas surface on this route → say so instead of persisting an
      // artifact and dispatching it into a pane that will never mount.
      if (!ensureCanvasReachable(input.title)) {
        const dropped: EnsureArtifactResult = {
          ok: false,
          artifactId: null,
          version: null,
          externalSystem: null,
          externalId: null,
          wasCreated: false,
          steps: ["blocked: no canvas surface is mounted on this route"],
          errors: ["canvas-unavailable"],
          row: null,
        };
        setLastResult(dropped);
        return dropped;
      }
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
          reportCanvasOpenDrop({
            reason: "not-persisted",
            requested: input.title,
            detail: result.errors[0] ?? "Could not persist artifact",
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
              // Caller extras first — per-type render options (mermaid theme /
              // look / layout), AI-rail intent, anything a renderer needs. They
              // used to be passed to persistence and then dropped on the floor
              // here, which is why type-specific blocks kept their own bespoke
              // `openCanvas` opener instead of using this canonical one.
              ...input.metadata,
              // Identity always wins over caller extras.
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
    [dispatch, ensureCanvasReachable],
  );

  return { openArtifact, busy, lastResult };
}
