/**
 * syncCanvasItemToCloud — THE one "Sync to cloud" path for a canvas pane.
 *
 * Both canvas shells (CanvasPane and the legacy CanvasRenderer) used to carry
 * near-duplicate `handleSync` bodies, and both shared the same defect: they
 * resolved the payload only from `typeof content.data === "string"` and bailed
 * for every artifact whose body is an OBJECT (diagram, quiz, comparison…), so
 * a structured artifact could never be materialized.
 *
 * Payload resolution, in order:
 *  1. `content.data` is a POINTER (`{ artifactId }`) → the body lives in the
 *     row; resolve the existing artifact id and read the row for the payload.
 *  2. `content.data` is a string  → raw string payload.
 *  3. `content.data` is an object → STRUCTURED payload, persisted verbatim as
 *     `content.data` via `ensureArtifactPersisted({ structured })`.
 */

import {
  isMaterializedArtifactId,
  readArtifactPointerId,
} from "@/features/canvas/artifact-types/artifactId";
import { canvasArtifactService } from "@/features/canvas/services/canvasArtifactService";
import {
  ensureArtifactPersisted,
  type EnsureArtifactResult,
} from "@/features/canvas/materialization/ensureArtifactPersisted";
import type { CanvasContent, CanvasItem } from "@/features/canvas/redux/canvasSlice";

export interface SyncCanvasItemInput {
  content: CanvasContent;
  item: Pick<CanvasItem, "savedItemId">;
  title: string;
}

export type SyncCanvasItemOutcome =
  | { ok: false; error: string; result: null }
  | { ok: true; error: null; result: EnsureArtifactResult };

export async function syncCanvasItemToCloud(
  input: SyncCanvasItemInput,
): Promise<SyncCanvasItemOutcome> {
  const { content, item, title } = input;

  const pointerId = readArtifactPointerId(content.data);
  const existingArtifactId =
    pointerId ?? content.metadata?.canvasItemId ?? item.savedItemId;

  let rawContent = typeof content.data === "string" ? content.data : "";
  // A pointer shape is never a payload — including the un-materialized
  // `{ artifactId: "artifact_1" }` form that `readArtifactPointerId` rejects
  // for not being a UUID. Persisting one would store a reference as the body.
  const isPointerShape =
    !!content.data &&
    typeof content.data === "object" &&
    "artifactId" in (content.data as object);
  let structured: Record<string, unknown> | null =
    !isPointerShape && content.data && typeof content.data === "object"
      ? (content.data as Record<string, unknown>)
      : null;

  // Pointer-only item (already materialized): the body lives in the row.
  if (!rawContent && !structured && isMaterializedArtifactId(existingArtifactId)) {
    const row = await canvasArtifactService.getById(existingArtifactId!);
    if (row?.content && typeof row.content === "object" && "data" in row.content) {
      const d = (row.content as { data?: unknown }).data;
      if (typeof d === "string") rawContent = d;
      else if (d && typeof d === "object")
        structured = d as Record<string, unknown>;
    }
  }

  if (!rawContent && !structured) {
    return {
      ok: false,
      error: "Nothing to persist — no card content on this session item.",
      result: null,
    };
  }

  const result = await ensureArtifactPersisted({
    canvasType: content.type,
    title,
    content: rawContent,
    structured,
    messageId: content.metadata?.messageId ?? content.metadata?.sourceMessageId,
    conversationId: content.metadata?.conversationId,
    artifactId: existingArtifactId,
  });

  if (!result.ok || !result.artifactId) {
    return {
      ok: false,
      error: result.errors[0] ?? "Cloud sync failed",
      result: null,
    };
  }

  return { ok: true, error: null, result };
}
