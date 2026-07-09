"use client";

/**
 * attach-resource — the single mapping from a picked `Resource` to an
 * instance resource block, shared by every surface that attaches resources
 * to an agent execution instance (SmartAgentResourcePickerButton, the
 * RunControlsMenu Attach tab, …). Previously copy-pasted per surface, which
 * drifted.
 */

import type { Dispatch } from "@reduxjs/toolkit";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import {
  addResource,
  removeResource,
  setResourcePreview,
  setResourceStatus,
} from "@/features/agents/redux/execution-system/instance-resources/instance-resources.slice";
import {
  refineBlockType,
  resourceDataToSource,
} from "@/features/agents/redux/execution-system/instance-resources/resource-source";
import { isEditableCapableBlockType } from "@/features/agents/redux/execution-system/instance-resources/editable-resource-types";
import {
  lookupFileDocument,
  peekFileDocument,
  type FileDocumentLookup,
} from "@/features/files/api/document-lookup";
import {
  buildProcessedDocumentSource,
  defaultRepresentation,
  isProcessedDocumentSource,
  type ProcessedDocumentSource,
} from "@/features/agents/utils/processedDocumentContext";
import type { Resource } from "@/features/agents/resources/types";
import type {
  DocumentRepresentation,
  ResourceBlockType,
} from "@/features/agents/types/instance.types";

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

/**
 * Attach a processed document by REFERENCE with a chosen text representation.
 * Rides the context channel (not content[]). Like editor pills, it has no
 * server-side resolution, so it's marked `ready` immediately.
 */
export function attachProcessedDocument(
  dispatch: Dispatch,
  conversationId: string,
  source: ProcessedDocumentSource,
  label: string,
  representation?: DocumentRepresentation,
): string {
  const resourceId = newResourceId();
  dispatch(
    addResource({
      conversationId,
      blockType: "processed_document",
      source,
      resourceId,
      options: {
        representation: representation ?? defaultRepresentation(source),
      },
    }),
  );
  dispatch(setResourceStatus({ conversationId, resourceId, status: "ready" }));
  dispatch(setResourcePreview({ conversationId, resourceId, preview: label }));
  return resourceId;
}

/**
 * Chip "Attach as file instead": drop the processed-document reference and
 * re-add the origin binary file so the agent gets the raw bytes (vision / the
 * model reads the PDF natively) instead of the extracted-text representation.
 */
export function switchAttachedDocumentToBinary(
  dispatch: Dispatch,
  conversationId: string,
  resourceId: string,
  source: ProcessedDocumentSource,
  label: string,
): void {
  dispatch(removeResource({ conversationId, resourceId }));
  if (source.file_id) {
    attachBinary(dispatch, conversationId, "document", { id: source.file_id }, label);
  }
}

function attachedProcessedDocIds(
  getState: () => RootState,
  conversationId: string,
): Set<string> {
  const map = getState().instanceResources.byConversationId[conversationId];
  const ids = new Set<string>();
  if (map) {
    for (const r of Object.values(map)) {
      if (
        r.blockType === "processed_document" &&
        isProcessedDocumentSource(r.source)
      ) {
        ids.add(r.source.processed_document_id);
      }
    }
  }
  return ids;
}

function resourceStillExists(
  getState: () => RootState,
  conversationId: string,
  resourceId: string,
): boolean {
  return Boolean(
    getState().instanceResources.byConversationId[conversationId]?.[resourceId],
  );
}

/** Attach a processed document, deduped: skip if the same doc is already on. */
function attachProcessedDocumentDeduped(
  dispatch: Dispatch,
  getState: () => RootState,
  conversationId: string,
  doc: FileDocumentLookup,
  fileId: string,
  label: string,
): void {
  if (attachedProcessedDocIds(getState, conversationId).has(doc.processed_document_id)) {
    return;
  }
  attachProcessedDocument(
    dispatch,
    conversationId,
    buildProcessedDocumentSource(doc, fileId),
    label,
  );
}

/**
 * Returns a handler that attaches a picked Resource to the instance.
 *
 * A stored file (or file_url) that refines to a `document` is checked for a
 * processed document (OCR'd → AI-cleaned). To avoid a fast-submit race (the send
 * path never waits for pending attaches), a chip ALWAYS appears synchronously:
 *  - cache hit "found"   → attach by reference immediately (default clean/raw);
 *  - cache hit "absent"  → binary attach immediately;
 *  - cache cold          → binary attach immediately (safe on fast submit — the
 *    file still sends), then upgrade to the reference form when the probe
 *    resolves, IF the chip is still present and not already attached.
 * The chip then offers the quick representation choice + an "Attach as file
 * instead" escape. Non-file / media resources take the binary path unchanged.
 * Closing the hosting popover is the CALLER's job.
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
    const label = resourceLabel(resource);

    // Only a real (non-media) file document qualifies for representation-attach.
    if (blockType === "document") {
      const fileId = extractFileId(resource.data);
      if (fileId) {
        const cached = peekFileDocument(fileId);
        if (cached?.kind === "found") {
          attachProcessedDocumentDeduped(
            dispatch,
            getState,
            conversationId,
            cached.doc,
            fileId,
            label,
          );
          return;
        }
        if (cached?.kind === "absent" || cached?.kind === "unavailable") {
          attachBinary(dispatch, conversationId, "document", resource.data, label);
          return;
        }
        // Cold cache — attach binary now (instant, ready, safe on fast submit),
        // then upgrade if it turns out to qualify and the chip is still there.
        const resourceId = attachBinary(
          dispatch,
          conversationId,
          "document",
          resource.data,
          label,
        );
        void upgradeToProcessedDocument(
          dispatch,
          getState,
          conversationId,
          fileId,
          resourceId,
          label,
        );
        return;
      }
    }

    attachBinary(dispatch, conversationId, blockType, resource.data, label);
  };
}

async function upgradeToProcessedDocument(
  dispatch: Dispatch,
  getState: () => RootState,
  conversationId: string,
  fileId: string,
  binaryResourceId: string,
  label: string,
): Promise<void> {
  let state;
  try {
    state = await lookupFileDocument(fileId);
  } catch {
    return; // transient probe failure — leave the binary chip as-is
  }
  if (state.kind !== "found") return;
  // The chip may have been sent/removed while the probe was in flight — never
  // resurrect it onto the next turn.
  if (!resourceStillExists(getState, conversationId, binaryResourceId)) return;
  // Already attached as a processed doc (e.g. a second rapid attach) → just drop
  // the redundant binary rather than add a duplicate.
  const already = attachedProcessedDocIds(getState, conversationId).has(
    state.doc.processed_document_id,
  );
  dispatch(removeResource({ conversationId, resourceId: binaryResourceId }));
  if (already) return;
  attachProcessedDocument(
    dispatch,
    conversationId,
    buildProcessedDocumentSource(state.doc, fileId),
    label,
  );
}
