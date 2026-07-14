"use client";

/**
 * attach-resource — the single mapping from a picked `Resource` to how it gets
 * attached to a conversation, shared by every surface that attaches resources
 * (SmartAgentResourcePickerButton, the RunControlsMenu Attach tab, …).
 *
 * TWO attach shapes, by kind:
 *  - A stored FILE → a DURABLE `platform.associations` edge to the conversation
 *    (`processed_document → conversation` when the file has a processed document,
 *    else `file → conversation`). This PERSISTS across turns and reloads; the
 *    backend reads the conversation's edges at call time and injects the context.
 *    The chip renders from the edge list (see `AttachedDocumentChips`), NOT the
 *    ephemeral `instanceResources` slice.
 *  - Everything else (media bytes, notes, tasks, webpages, …) → the per-turn
 *    `instanceResources` block, UNCHANGED (the binary `document` bytes path is
 *    left untouched — a file with no file identity, or a media block, still rides
 *    content[]).
 */

import type { Dispatch } from "@reduxjs/toolkit";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  addResource,
  setResourcePreview,
} from "@/features/agents/redux/execution-system/instance-resources/instance-resources.slice";
import {
  refineBlockType,
  resourceDataToSource,
} from "@/features/agents/redux/execution-system/instance-resources/resource-source";
import { isEditableCapableBlockType } from "@/features/agents/redux/execution-system/instance-resources/editable-resource-types";
import {
  addAssociation,
  removeAssociation,
  associationsKey,
  type AssociationWriteResult,
} from "@/features/scopes/redux/thunks/associations";
import {
  lookupFileDocument,
  peekFileDocument,
  type FileDocumentState,
} from "@/features/files/api/document-lookup";
import {
  cleanDocumentLabel,
  resolveConversationOrgId,
  type AttachedDocumentMetadata,
  type AttachedDocumentToken,
} from "@/features/agents/components/inputs/resources/attached-documents";
import type { Resource } from "@/features/agents/resources/types";
import type {
  DocumentRepresentation,
  ResourceBlockType,
} from "@/features/agents/types/instance.types";
import type { Json } from "@/types/database.types";

/** Map prompt-system resource types to agent ResourceBlockType. */
export function resourceTypeToBlockType(
  type: Resource["type"],
): ResourceBlockType {
  const map: Record<string, ResourceBlockType> = {
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
    agent: "input_agent",
    agent_app: "input_agent_app",
    transcript: "input_transcript",
    transcript_session: "input_transcript_session",
    workbook: "input_workbook",
    document: "input_document",
  };
  return map[type] ?? "text";
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

function edgeMetadata(
  fileId: string | null,
  representation?: DocumentRepresentation,
): Json {
  const meta: AttachedDocumentMetadata = { file_id: fileId };
  if (representation) meta.representation = representation;
  return meta as Json;
}

/** True when the conversation already has an incoming edge of `token` → `id`. */
function conversationHasEdge(
  getState: () => RootState,
  conversationId: string,
  token: AttachedDocumentToken,
  sourceId: string,
): boolean {
  const key = associationsKey("conversation", conversationId);
  const edges = getState().scopesTree.associationsByKey[key]?.edges ?? [];
  return edges.some(
    (e) =>
      e.direction === "incoming" &&
      e.otherType === token &&
      e.otherId === sourceId,
  );
}

/** Create a `token → conversation` attachment edge (idempotent). */
async function attachDocumentEdge(
  dispatch: AppDispatch,
  getState: () => RootState,
  conversationId: string,
  token: AttachedDocumentToken,
  sourceId: string,
  fileId: string | null,
  label: string,
  representation?: DocumentRepresentation,
): Promise<AssociationWriteResult> {
  const orgId = resolveConversationOrgId(getState(), conversationId);
  if (!orgId) {
    return { ok: false, error: "No organization for this conversation" };
  }
  return dispatch(
    addAssociation({
      sourceType: token,
      sourceId,
      targetType: "conversation",
      targetId: conversationId,
      orgId,
      label,
      metadata: edgeMetadata(fileId, representation),
    }),
  );
}

/**
 * Cold-cache upgrade: a file edge was attached instantly (durable + present for
 * turn 1); once the file→document probe resolves, if it HAS a processed document
 * AND the file edge is still attached (the user didn't detach it), swap to the
 * `processed_document → conversation` edge. Never resurrects a detached
 * attachment.
 */
async function upgradeFileEdgeToProcessedDocument(
  dispatch: AppDispatch,
  getState: () => RootState,
  conversationId: string,
  fileId: string,
  label: string,
): Promise<void> {
  let state: FileDocumentState;
  try {
    state = await lookupFileDocument(fileId);
  } catch {
    return; // transient probe failure — leave the file edge as-is
  }
  if (state.kind !== "found") return;
  // The user may have detached the file edge while the probe was in flight —
  // never resurrect it onto the conversation.
  if (!conversationHasEdge(getState, conversationId, "file", fileId)) return;
  const representation: DocumentRepresentation = state.doc.has_clean_content
    ? "clean"
    : "raw";
  const res = await attachDocumentEdge(
    dispatch,
    getState,
    conversationId,
    "processed_document",
    state.doc.processed_document_id,
    fileId,
    label,
    representation,
  );
  if (!res.ok) {
    console.error(
      "[attached-document] upgrade to processed_document failed — leaving the raw file edge attached",
      { conversationId, fileId, error: res.error },
    );
    return;
  }
  // Drop the now-redundant raw file edge (idempotent; no-op if already gone).
  await dispatch(
    removeAssociation({
      sourceType: "file",
      sourceId: fileId,
      targetType: "conversation",
      targetId: conversationId,
    }),
  );
}

/**
 * Returns a handler that attaches a picked Resource to the conversation.
 *
 * A stored file (or file_url) that refines to a `document` becomes a DURABLE
 * association edge to the conversation:
 *  - cache hit "found"   → `processed_document → conversation` immediately;
 *  - cache hit "absent"  → `file → conversation` immediately;
 *  - cache cold          → `file → conversation` immediately (instant + durable,
 *    safe on fast submit — the edge is there for turn 1), then upgrade to
 *    `processed_document → conversation` when the probe resolves, IF still
 *    attached.
 * A file with no file identity, and every media / note / task / … resource, take
 * the per-turn binary/instanceResources path unchanged. Closing the hosting
 * popover is the CALLER's job.
 */
export function useAttachResource(
  conversationId: string,
): (resource: Resource) => void {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  return (resource: Resource) => {
    const getState = () => store.getState() as RootState;
    const baseBlockType = resourceTypeToBlockType(resource.type);
    const blockType = refineBlockType(baseBlockType, resource.data);
    const label = cleanDocumentLabel(resourceLabel(resource));

    // A real (non-media) file → a durable association edge to the conversation.
    if (blockType === "document") {
      const fileId = extractFileId(resource.data);
      if (fileId) {
        const cached = peekFileDocument(fileId);
        if (cached?.kind === "found") {
          const representation: DocumentRepresentation = cached.doc
            .has_clean_content
            ? "clean"
            : "raw";
          void attachDocumentEdge(
            dispatch,
            getState,
            conversationId,
            "processed_document",
            cached.doc.processed_document_id,
            fileId,
            label,
            representation,
          ).then((res) => {
            if (!res.ok) {
              console.error("[attached-document] attach failed", {
                conversationId,
                fileId,
                error: res.error,
              });
            }
          });
          return;
        }
        // absent / unavailable / cold — attach the raw file edge now. On a cold
        // cache, upgrade to processed_document once the probe resolves.
        void attachDocumentEdge(
          dispatch,
          getState,
          conversationId,
          "file",
          fileId,
          fileId,
          label,
        ).then((res) => {
          if (!res.ok) {
            console.error("[attached-document] attach failed", {
              conversationId,
              fileId,
              error: res.error,
            });
            return;
          }
          if (cached === undefined) {
            void upgradeFileEdgeToProcessedDocument(
              dispatch,
              getState,
              conversationId,
              fileId,
              label,
            );
          }
        });
        return;
      }
    }

    attachBinary(dispatch, conversationId, blockType, resource.data, label);
  };
}
