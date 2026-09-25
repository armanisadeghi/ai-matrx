/**
 * Runtime scope builders for the `matrx-user/artifacts` surface.
 *
 * Two routes share the surface and each owns a different slice of it: the list
 * route emits the `listing` group, the detail route emits `artifact` + `origin`.
 * The emitting components call these at TRIGGER time from state they already
 * hold — `getScope` is polled every 400ms while a Surface Context window is
 * open, so nothing here may fetch.
 *
 * "Not loaded" and "loaded, empty" stay distinct: a key is OMITTED while its
 * data has not loaded, and `[]` / `0` only ever mean the load finished.
 */

import {
  createArtifactsScope,
  type ArtifactListRow,
} from "@/features/surfaces/manifests/artifacts.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type {
  ArtifactStatus,
  ArtifactType,
  CxArtifactRecord,
} from "@/features/artifacts/types";

export function toArtifactListRow(a: CxArtifactRecord): ArtifactListRow {
  return {
    id: a.id,
    title: a.title,
    type: a.artifactType,
    status: a.status,
    description: a.description,
    updated_at: a.updatedAt,
    conversation_id: a.conversationId,
  };
}

/** List route. `visible` is the list exactly as the table shows it. */
export function buildArtifactListScope(input: {
  typeFilter: ArtifactType | "all";
  statusFilter: ArtifactStatus | "all";
  search: string;
  visible: CxArtifactRecord[];
  fetchStatus: string;
  fetchError: string | null;
  openCanvasItemId: string | null;
}): SurfaceScopePayload {
  const loaded =
    input.fetchStatus === "succeeded" || input.fetchStatus === "failed";
  const rows = input.visible.map(toArtifactListRow);
  return createArtifactsScope({
    artifact_type_filter:
      input.typeFilter === "all" ? undefined : input.typeFilter,
    artifact_status_filter:
      input.statusFilter === "all" ? undefined : input.statusFilter,
    artifact_search_query: input.search.trim() || undefined,
    visible_artifact_count: loaded ? rows.length : undefined,
    visible_artifacts: loaded ? rows : undefined,
    artifacts_load_status: {
      status: input.fetchStatus,
      error: input.fetchError,
    },
    open_canvas_item_id: input.openCanvasItemId ?? undefined,
  });
}

/**
 * What the detail pane's content preview loaded, published up by the
 * preview child into a ref the detail component owns (one slot, one
 * publisher). `null` = not loaded or no canvas content.
 */
export interface ArtifactContentSnapshot {
  canvasItemId: string;
  canvasType: string;
  data: unknown;
}

function stringifyContent(data: unknown): string | undefined {
  if (data == null) return undefined;
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data);
  } catch {
    return undefined;
  }
}

/** Detail route. */
export function buildArtifactDetailScope(input: {
  loadState: "loading" | "ready" | "canvas_item" | "gate";
  artifact: CxArtifactRecord | null;
  content: ArtifactContentSnapshot | null;
}): SurfaceScopePayload {
  const { artifact, content, loadState } = input;
  // An unregistered canvas item still renders its content on this route.
  const contentFields = content
    ? {
        artifact_canvas_type: content.canvasType,
        content: stringifyContent(content.data),
      }
    : {};

  if (!artifact) {
    return createArtifactsScope({
      artifact_load_state: loadState,
      ...(loadState === "canvas_item" && content
        ? { artifact_canvas_item_id: content.canvasItemId, ...contentFields }
        : {}),
    });
  }

  const metadata =
    artifact.metadata && Object.keys(artifact.metadata).length > 0
      ? artifact.metadata
      : undefined;

  return createArtifactsScope({
    artifact_load_state: "ready",
    artifact_id: artifact.id,
    artifact_title: artifact.title ?? undefined,
    artifact_description: artifact.description ?? undefined,
    artifact_type: artifact.artifactType,
    artifact_status: artifact.status,
    artifact_summary: {
      id: artifact.id,
      title: artifact.title,
      type: artifact.artifactType,
      status: artifact.status,
      created_at: artifact.createdAt,
      updated_at: artifact.updatedAt,
    },
    artifact_created_at: artifact.createdAt,
    artifact_updated_at: artifact.updatedAt,
    artifact_external_url: artifact.externalUrl ?? undefined,
    artifact_external_id: artifact.externalId ?? undefined,
    artifact_external_system: artifact.externalSystem ?? undefined,
    artifact_canvas_item_id: artifact.canvasItemId ?? undefined,
    artifact_metadata: metadata,
    source_conversation_id: artifact.conversationId || undefined,
    source_message_id: artifact.messageId || undefined,
    artifact_organization_id: artifact.organizationId ?? undefined,
    artifact_task_id: artifact.taskId ?? undefined,
    // Only the preview for THIS artifact's canvas item counts as its content.
    ...(content && content.canvasItemId === artifact.canvasItemId
      ? contentFields
      : {}),
  });
}
