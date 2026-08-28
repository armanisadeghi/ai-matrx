"use client";

/**
 * useOpenCanvasItem — the ONE way a LIST surface opens a saved canvas item.
 *
 * Sibling of `useOpenArtifactInCanvas`, which exists for the other direction:
 * that hook takes raw block content that may not be persisted yet and
 * materializes it first. This one starts from a row that already exists, so
 * there is nothing to persist — it only needs the row's `type` to open by
 * pointer, and it will fetch the row to learn it when the caller doesn't know.
 *
 * Why this is a primitive and not three call sites: every list that shows
 * canvas items was opening them its own way. `SavedCanvasItems` (the canvas's
 * own library) dispatched `openCanvas(item.content)` — a full-payload snapshot
 * that the slice cannot dedupe against an item already showing that artifact,
 * even though it was holding the row id. The Content Library navigated to a
 * route instead of opening anything. Same artifact, three behaviours.
 *
 * Opening is LOOKING: this never writes. It resolves an identity and hands it
 * to `openArtifactInCanvas`, which stores `{ artifactId }` — a pointer, never
 * a copy — so the pane, the row and every other view of that artifact stay the
 * same thing.
 */

import { useCallback, useState } from "react";
import { toast } from "@/lib/toast";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  openArtifactInCanvas,
  type CanvasContentType,
} from "@/features/canvas/redux/canvasSlice";
import { isMaterializedArtifactId } from "@/features/canvas/artifact-types/artifactId";
import { getArtifactDef } from "@/features/canvas/artifact-types/artifact-type-registry";
import { canvasArtifactService } from "@/features/canvas/services/canvasArtifactService";

export interface OpenCanvasItemInput {
  /** `canvas_items.id`. */
  artifactId: string;
  /** Skip the row fetch when the caller already knows these. */
  type?: CanvasContentType | string | null;
  title?: string | null;
  /** Extra render metadata for the type's renderer (theme, options, …). */
  metadata?: Record<string, unknown>;
}

export function useOpenCanvasItem() {
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);

  const openItem = useCallback(
    async (input: OpenCanvasItemInput): Promise<boolean> => {
      if (!isMaterializedArtifactId(input.artifactId)) {
        toast.error("That item has no saved artifact to open");
        return false;
      }

      setBusy(true);
      try {
        let type = input.type ?? null;
        let title = input.title ?? null;

        // The caller knew neither — read the row for its type. A pointer open
        // is meaningless without it, so a miss here is a real failure, not a
        // reason to fall back to a snapshot.
        if (!type) {
          const row = await canvasArtifactService.getById(input.artifactId);
          if (!row) {
            toast.error("Couldn't load that artifact");
            return false;
          }
          type = row.type;
          title = title ?? row.title;
        }

        const artifactDef = getArtifactDef(type);
        if (!artifactDef) {
          toast.error(`That artifact type cannot be opened: ${type}`);
          return false;
        }

        dispatch(
          openArtifactInCanvas({
            artifactId: input.artifactId,
            type: artifactDef.canvasType,
            metadata: {
              ...input.metadata,
              title: title ?? undefined,
              canvasItemId: input.artifactId,
            },
          }),
        );
        return true;
      } finally {
        setBusy(false);
      }
    },
    [dispatch],
  );

  return { openItem, busy };
}
