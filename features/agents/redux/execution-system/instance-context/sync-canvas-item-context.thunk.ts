/**
 * syncCanvasItemContextFromAgent — re-read a pinned canvas_items row after
 * the agent ctx_patch'd it, then refresh the instanceContext entry + bust
 * the useCanvasItem cache so chat refs show the new version.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { setContextEntry } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import {
  buildCanvasItemContextValue,
  isCanvasItemContextValue,
} from "@/features/agents/utils/canvasItemContext";
import { applyContextDeltaToContent } from "@/features/agents/redux/execution-system/instance-working-document/contextDelta";
import type { ContextDeltaData } from "@/types/python-generated/stream-events";
import {
  CANVAS_ITEM_UPDATED_EVENT,
  invalidateCanvasItemCache,
} from "@/features/canvas/hooks/useCanvasItem";
import { canvasArtifactService } from "@/features/canvas/services/canvasArtifactService";
import { isMaterializedArtifactId } from "@/features/canvas/artifact-types/artifactId";

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
  rejectValue: { message: string };
}

function extractBody(content: unknown): string {
  const stored = content as { data?: unknown } | string | null | undefined;
  if (stored && typeof stored === "object" && "data" in stored) {
    return typeof stored.data === "string"
      ? stored.data
      : JSON.stringify(stored.data ?? "");
  }
  if (typeof stored === "string") return stored;
  return "";
}

function broadcastUpdated(artifactId: string, latestId?: string) {
  invalidateCanvasItemCache(artifactId);
  if (latestId && latestId !== artifactId) {
    invalidateCanvasItemCache(latestId);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(CANVAS_ITEM_UPDATED_EVENT, {
        detail: { rootId: artifactId, latestId: latestId ?? artifactId },
      }),
    );
  }
}

/**
 * Apply a live context_delta to a pinned canvas-item context entry.
 * Returns true when applied (so process-stream can skip the mid-turn re-read).
 */
export function applyAgentCanvasItemDelta(args: {
  conversationId: string;
  key: string;
  delta: ContextDeltaData;
}): (dispatch: AppDispatch, getState: () => RootState) => boolean {
  return (dispatch, getState) => {
    if (!isMaterializedArtifactId(args.key)) return false;
    const entry =
      getState().instanceContext.byConversationId[args.conversationId]?.[
        args.key
      ];
    if (!entry || !isCanvasItemContextValue(entry.value)) return false;

    const next = applyContextDeltaToContent(entry.value.content, args.delta);
    if (next === null) return false;

    // BUG-B guard: never let a transient empty full-replacement wipe a
    // non-empty pinned artifact (mirrors working-document).
    if (next === "" && entry.value.content !== "") {
      console.warn(
        "[canvas-item] blocked an empty context_delta from wiping a non-empty artifact (BUG-B guard fired)",
        { conversationId: args.conversationId, artifactId: args.key },
      );
      return false;
    }

    dispatch(
      setContextEntry({
        conversationId: args.conversationId,
        key: args.key,
        value: {
          ...entry.value,
          content: next,
        },
        type: entry.type,
        label: entry.label,
      }),
    );
    return true;
  };
}

/**
 * Re-read the canvas row (latest in chain) and republish the context entry.
 * Always run on context_persisted so base_version latches.
 */
export const syncCanvasItemContextFromAgentThunk = createAsyncThunk<
  { conversationId: string; artifactId: string; version: number },
  { conversationId: string; artifactId: string },
  ThunkApi
>(
  "instanceContext/syncCanvasItemFromAgent",
  async ({ conversationId, artifactId }, { dispatch, getState, rejectWithValue }) => {
    if (!isMaterializedArtifactId(artifactId)) {
      return rejectWithValue({ message: "invalid artifact id" });
    }

    // Prefer latest in chain (agent edits create new version rows).
    const history = await canvasArtifactService.getVersionHistory(artifactId);
    const latest =
      history.length > 0
        ? history.reduce((max, r) => (r.version > max.version ? r : max), history[0]!)
        : await canvasArtifactService.getById(artifactId);

    if (!latest) {
      return rejectWithValue({ message: "canvas item not found" });
    }

    const prev =
      getState().instanceContext.byConversationId[conversationId]?.[artifactId];
    const label =
      (isCanvasItemContextValue(prev?.value) ? prev.value.label : null) ||
      latest.title ||
      "Code artifact";

    const value = buildCanvasItemContextValue({
      artifactId,
      content: extractBody(latest.content),
      label,
      version: latest.version,
    });

    dispatch(
      setContextEntry({
        conversationId,
        key: artifactId,
        value,
        type: "text",
        label,
      }),
    );

    broadcastUpdated(artifactId, latest.id);
    return {
      conversationId,
      artifactId,
      version: latest.version,
    };
  },
);
