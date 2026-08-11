"use client";

/**
 * attach-resource — the single mapping from a picked `Resource` to how it gets
 * attached to a conversation, shared by every surface that attaches resources
 * (SmartAgentResourcePickerButton, the RunControlsMenu Attach tab, …).
 *
 * TWO attach shapes, by kind:
 *  - A stored FILE → a DURABLE `platform.associations` edge to the conversation
 *    (`file → conversation`). The file ID means its complete existing family,
 *    including processed documents and RAG. This PERSISTS across turns and reloads; the
 *    backend reads the conversation's edges at call time and injects the context.
 *    The chip renders from the edge list (see `AttachedDocumentChips`), NOT the
 *    ephemeral `instanceResources` slice.
 *  - Everything else (media bytes, notes, tasks, webpages, …) → the per-turn
 *    `instanceResources` block, UNCHANGED (the binary `document` bytes path is
 *    left untouched — a file with no file identity, or a media block, still rides
 *    content[]).
 */

import type { Dispatch } from "@reduxjs/toolkit";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  addResource,
  setResourcePreview,
} from "@/features/agents/redux/execution-system/instance-resources/instance-resources.slice";
import { selectIsCacheOnly } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import {
  refineBlockType,
  resourceDataToSource,
} from "@/features/agents/redux/execution-system/instance-resources/resource-source";
import { isEditableCapableBlockType } from "@/features/agents/redux/execution-system/instance-resources/editable-resource-types";
import {
  addAssociation,
  loadAssociations,
  type AssociationWriteResult,
} from "@/features/scopes/redux/thunks/associations";
import {
  cleanDocumentLabel,
  documentAttachLabelFromState,
  type AttachedDocumentMetadata,
} from "@/features/agents/components/inputs/resources/attached-documents";
import type { Resource } from "@/features/agents/resources/types";
import type { ResourceBlockType } from "@/features/agents/types/instance.types";
import type { Json } from "@/types/database.types";

/** Map prompt-system resource types to agent ResourceBlockType. */
export function resourceTypeToBlockType(
  type: Resource["type"],
): ResourceBlockType {
  const map = {
    note: "input_notes",
    task: "input_task",
    project: "input_project",
    file: "document",
    table: "input_table",
    webpage: "input_webpage",
    youtube: "youtube_video",
    image_url: "image",
    file_url: "document",
    audio: "audio",
    text: "text",
    agent: "input_agent",
    agent_app: "input_agent_app",
    transcript: "input_transcript",
    transcript_session: "input_transcript_session",
    workbook: "input_workbook",
    document: "input_document",
    context_value: "text",
  } satisfies Record<Resource["type"], ResourceBlockType>;
  return map[type];
}

/** Extract the display label from a Resource (used for the chip preview). */
export function resourceLabel(resource: Resource): string {
  switch (resource.type) {
    case "note":
      return resource.data.label ?? "Note";
    case "task":
      return resource.data.title ?? "Task";
    case "project":
      return resource.data.name ?? "Project";
    case "file":
      return resource.data.details?.filename ?? "File";
    case "table":
      return resource.data.table_name ?? "Table";
    case "webpage":
      return resource.data.title ?? resource.data.url ?? "Webpage";
    case "youtube":
      return resource.data.title ?? "YouTube";
    case "image_url":
      return resource.data.url ?? "Image";
    case "file_url":
      return resource.data.filename ?? "File";
    case "audio":
      return resource.data.filename ?? "Audio";
    case "text":
      return resource.data.label;
    case "agent":
      return resource.data.name ?? "Agent";
    case "agent_app":
      return resource.data.name ?? "App";
    case "transcript":
      return resource.data.title ?? "Transcript";
    case "transcript_session":
      return resource.data.title ?? "Session";
    case "workbook":
      return resource.data.name ?? "Workbook";
    case "document":
      return resource.data.title ?? "Document";
    case "context_value":
      return resource.data.label ?? "Context value";
    default:
      return "Resource";
  }
}

function newResourceId(): string {
  return `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Best-effort cld_files id from a picker payload (stored file / file_url). */
function extractFileId(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.fileId === "string" && d.fileId) return d.fileId;
  if (typeof d.id === "string" && d.id) return d.id;
  return null;
}

/**
 * Attach a picked file as today's BINARY block (document / image / audio /
 * video). `setResourcePreview` flips it to `ready` in the same tick (its reducer
 * sets status="ready"), so the chip is instantly sendable.
 */
function attachBinary(
  dispatch: Dispatch,
  conversationId: string,
  blockType: ResourceBlockType,
  data: unknown,
  label: string,
): string {
  const resourceId = newResourceId();
  dispatch(
    addResource({
      conversationId,
      blockType,
      source: resourceDataToSource(blockType, data),
      resourceId,
      // Default editable-capable resources to EDITABLE. The server defaults
      // to locked, so the FE must explicitly mark `editable: true` (which the
      // payload selector then emits). The user opts OUT by clicking the lock.
      options: isEditableCapableBlockType(blockType)
        ? { editable: true }
        : undefined,
    }),
  );
  dispatch(setResourcePreview({ conversationId, resourceId, preview: label }));
  return resourceId;
}

// ─── Document association edges (durable, persist across turns/reloads) ──────

function edgeMetadata(fileId: string | null, existing?: Json): Json {
  const previous =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as Record<string, Json | undefined>)
      : {};
  const meta: AttachedDocumentMetadata = {
    ...(previous as AttachedDocumentMetadata),
    file_id: fileId,
  };
  return meta as Json;
}

/** Create a `token → conversation` attachment edge (idempotent). */
async function attachDocumentEdge(
  dispatch: AppDispatch,
  conversationId: string,
  sourceId: string,
  fileId: string | null,
  label: string,
  existingMetadata?: Json,
): Promise<AssociationWriteResult> {
  return dispatch(
    addAssociation({
      sourceType: "file",
      sourceId,
      targetType: "conversation",
      targetId: conversationId,
      label,
      metadata: edgeMetadata(fileId, existingMetadata),
    }),
  );
}

/**
 * Returns a handler that attaches a picked Resource to the conversation.
 *
 * A stored file (or file_url) that refines to a `document` becomes a DURABLE
 * association edge to the conversation. A canonical `file → conversation`
 * edge is always used. The backend resolves
 * the complete readable family on every run, so no client-side document probe
 * or edge replacement is needed when processing finishes later.
 * A file with no file identity, and every media / note / task / … resource, take
 * the per-turn binary/instanceResources path unchanged. Closing the hosting
 * popover is the CALLER's job.
 */
export function useAttachResource(
  conversationId: string,
): (resource: Resource) => Promise<boolean> {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  return async (resource: Resource) => {
    const getState = () => store.getState() as RootState;
    const baseBlockType = resourceTypeToBlockType(resource.type);
    const blockType = refineBlockType(baseBlockType, resource.data);
    const resourcePreviewLabel = cleanDocumentLabel(resourceLabel(resource));

    // A real (non-media) file → a durable association edge to the conversation.
    // The picker awaits this edge before it closes, so the user cannot submit a
    // turn from the composer while the durable association is still in flight.
    if (blockType === "document") {
      const fileId = extractFileId(resource.data);
      if (fileId) {
        // Durable edges require a real chat.conversation row. New saved-agent
        // chats are provisional until turn 1, while Builder/manual mode uses a
        // local Redux id that never becomes its server-minted wire id. In both
        // cases the existing per-turn resource path is the truthful boundary.
        if (selectIsCacheOnly(conversationId)(getState())) {
          attachBinary(
            dispatch,
            conversationId,
            blockType,
            resource.data,
            resourcePreviewLabel,
          );
          return true;
        }
        const cacheKey = `conversation:${conversationId}`;
        // Always refresh before a duplicate attach. A "ready" cache may be
        // stale after another tab or server-side variable attachment.
        await dispatch(
          loadAssociations({
            type: "conversation",
            id: conversationId,
            force: true,
          }),
        );
        if (
          getState().scopesTree.associationsByKey[cacheKey]?.status !== "ready"
        ) {
          toast.error("Couldn't verify existing document attachment metadata");
          return false;
        }
        const label = documentAttachLabelFromState(
          getState(),
          fileId,
          resourcePreviewLabel,
        );
        const existingEdge = getState().scopesTree.associationsByKey[
          cacheKey
        ]?.edges.find(
          (edge) =>
            edge.direction === "incoming" &&
            edge.otherType === "file" &&
            edge.otherId === fileId,
        );
        // Association already exists: reselect is an idempotent no-op. This
        // avoids a read/replace race that could erase a policy written by
        // another tab between refresh and mutation.
        if (existingEdge) return true;
        const result = await attachDocumentEdge(
          dispatch,
          conversationId,
          fileId,
          fileId,
          label,
          undefined,
        );
        if (!result.ok) {
          console.error("[attached-document] attach failed", {
            conversationId,
            fileId,
            error: result.error,
          });
          toast.error(`Couldn't attach document: ${result.error}`);
          return false;
        }
        return true;
      }
    }

    attachBinary(
      dispatch,
      conversationId,
      blockType,
      resource.type === "context_value"
        ? resource.data.referenceFence
        : resource.type === "text"
          ? resource.data.text
          : resource.data,
      resourcePreviewLabel,
    );
    return true;
  };
}
