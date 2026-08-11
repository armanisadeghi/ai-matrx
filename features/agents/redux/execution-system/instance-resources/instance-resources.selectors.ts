/**
 * Instance Resource Selectors
 *
 * Stable empty constants are hoisted at module level so selectors always return
 * the same reference when the instance has no resources — preventing spurious
 * re-renders from inline `?? []` or new `Object.values()` arrays every call.
 *
 * Derived array selectors are memoized with createSelector so they only
 * rebuild when the underlying resource map actually changes.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { ManagedResource } from "@/features/agents/types/instance.types";
import {
  isMessagePart,
  type MessagePart,
  type PreFetchedUrl,
} from "@/types/python-generated/stream-events";
import type { UserInputPart } from "@/features/agents/types/request.types";
import { isPreFetchedUrl } from "@/features/resource-manager/webpage/webpage-snapshot";
import {
  isEditorXmlResource,
  serializeEditorResourcesAsXml,
} from "@/features/agents/utils/editor-resource-xml";
import { isEditableCapableBlockType } from "./editable-resource-types";

const EMPTY_RESOURCES: ManagedResource[] = [];
const EMPTY_EDITOR_RESOURCES: ManagedResource[] = [];
const EMPTY_PAYLOADS: UserInputPart[] = [];

type RequestMediaPart = Extract<UserInputPart, { type: "media" }>;
type PersistedMediaPart = Extract<MessagePart, { type: "media" }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function optionalString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value ? value : undefined;
}

function invalidResource(resource: ManagedResource, reason: string): never {
  console.error("[instance-resources] Invalid ready resource payload", {
    resourceId: resource.resourceId,
    blockType: resource.blockType,
    reason,
  });
  throw new TypeError(
    `Cannot send ${resource.blockType} attachment ${resource.resourceId}: ${reason}`,
  );
}

function resourceMetadata(
  resource: ManagedResource,
  content: unknown,
): Record<string, unknown> | undefined {
  const sourceMetadata =
    isRecord(content) && isRecord(content.metadata)
      ? content.metadata
      : undefined;
  const sourceTitle = isRecord(content)
    ? (optionalString(content, "title") ??
      optionalString(content, "name") ??
      optionalString(content, "label") ??
      optionalString(content, "filename"))
    : undefined;
  const displayTitle =
    typeof resource.preview === "string" && resource.preview
      ? resource.preview
      : sourceTitle;
  if (!sourceMetadata && !displayTitle) return undefined;
  return {
    ...sourceMetadata,
    ...(displayTitle ? { display_title: displayTitle } : {}),
  };
}

function inputControls(resource: ManagedResource) {
  return {
    ...(resource.options.keepFresh ? { keep_fresh: true } : {}),
    ...(isEditableCapableBlockType(resource.blockType)
      ? { editable: resource.options.editable }
      : {}),
    ...(!resource.options.convertToText ? { convert_to_text: false } : {}),
    ...(resource.options.optionalContext ? { optional_context: true } : {}),
    ...(resource.options.template
      ? { template: resource.options.template }
      : {}),
  };
}

/**
 * Reduce attached note/task resources to the lean reference shape the backend
 * expects: a list of bare id strings. The picker stores the *whole* resource
 * object on `source`, but an attach-by-reference only needs the id — the
 * backend re-fetches the live record each turn (honouring edits, ownership,
 * keep_fresh). Shipping the full object wasted ~6 KB/note on the wire and, when
 * the backend fed it straight into a `WHERE id = $1` query, took down the whole
 * request.
 *
 * The backend now normalizes any shape (string id, `{id}` object, or a
 * `{mode:"snapshot", content}` value block), so this is purely the lean,
 * correct default. When attach-by-value (snapshot) ships in the UI it will send
 * the full object with `mode:"snapshot"` explicitly instead of going through
 * this reducer.
 */
function toResourceIdList(content: unknown): string[] {
  const entries = Array.isArray(content) ? content : [content];
  const ids: string[] = [];
  for (const entry of entries) {
    if (typeof entry === "string" && entry) {
      ids.push(entry);
    } else if (entry && typeof entry === "object") {
      const id = isRecord(entry) ? entry.id : undefined;
      if (typeof id === "string" && id) ids.push(id);
    }
  }
  return ids;
}

/**
 * Normalize the source of an `input_table` / `input_list` resource into the
 * `bookmarks` ARRAY the wire contract requires (`TableInputPart.bookmarks` /
 * `ListInputPart.bookmarks` are `Bookmark[]`). Pickers store a single picked
 * `TableReference` / list bookmark on `source`, so a naive `bookmarks = source`
 * shipped a bare object and the backend silently dropped it — the reference
 * never resolved. Bookmark items are already canonical (typed ids + optional
 * `extra="allow"` display hints per docs/protocol/MATRX_REFERENCES.md), so we
 * only array-wrap and drop empties; we never strip hint fields.
 */
function structuredEntries(content: unknown, key: "bookmarks" | "refs") {
  const source =
    isRecord(content) && Array.isArray(content[key]) ? content[key] : content;
  return Array.isArray(source) ? source : [source];
}

/** Validate shared request/persistence shapes with the generated schema. */
function toTableBookmarks(content: unknown) {
  const candidate: unknown = {
    type: "input_table",
    bookmarks: structuredEntries(content, "bookmarks"),
  };
  if (!isMessagePart(candidate) || candidate.type !== "input_table") return [];
  return candidate.bookmarks ?? [];
}

function toListBookmarks(content: unknown) {
  const candidate: unknown = {
    type: "input_list",
    bookmarks: structuredEntries(content, "bookmarks"),
  };
  if (!isMessagePart(candidate) || candidate.type !== "input_list") return [];
  return candidate.bookmarks ?? [];
}

function toDataRefs(content: unknown) {
  const candidate: unknown = {
    type: "input_data",
    refs: structuredEntries(content, "refs"),
  };
  if (!isMessagePart(candidate) || candidate.type !== "input_data") return [];
  return candidate.refs ?? [];
}

function mediaDataUrl(base64Data: string, mimeType?: string): string {
  return `data:${mimeType ?? "application/octet-stream"};base64,${base64Data}`;
}

function requestMediaLocator(
  url: string | null | undefined,
  fileId: string | null | undefined,
  base64Data: string | null | undefined,
) {
  if (url) return { url };
  if (fileId) return { file_id: fileId };
  if (base64Data) return { base64_data: base64Data };
  throw new TypeError(
    "Cannot send media attachment without a URL, file id, or inline bytes",
  );
}

function messageMediaPartToUserInputPart(
  part: PersistedMediaPart,
): RequestMediaPart {
  if (part.kind === "youtube") return part;
  const locator = requestMediaLocator(part.url, part.file_id, undefined);
  switch (part.kind) {
    case "image":
      return { ...part, ...locator, type: "media", kind: "image" };
    case "audio":
      return { ...part, ...locator, type: "media", kind: "audio" };
    case "video":
      return { ...part, ...locator, type: "media", kind: "video" };
    case "document":
      return { ...part, ...locator, type: "media", kind: "document" };
  }
}

/** Convert an already-persisted part back to the generated request contract. */
export function messagePartToUserInputPart(part: MessagePart): UserInputPart {
  return part.type === "media" ? messageMediaPartToUserInputPart(part) : part;
}

/**
 * Project a request-side part into the durable shape used by the optimistic
 * message bubble. Inline media bytes are represented by a local data URL until
 * the server replaces them with the stored file/url reference.
 */
export function userInputPartToMessagePart(part: UserInputPart): MessagePart {
  if (part.type !== "media") return part;
  if (part.kind === "youtube") {
    return {
      metadata: part.metadata,
      type: "media",
      kind: "youtube",
      url: part.url,
      external_url: part.external_url,
      origin: part.origin,
      mime_type: part.mime_type,
    };
  }
  const base64Data =
    "base64_data" in part && typeof part.base64_data === "string"
      ? part.base64_data
      : undefined;
  const locator = part.url
    ? { url: part.url }
    : part.file_id
      ? { file_id: part.file_id }
      : base64Data
        ? { url: mediaDataUrl(base64Data, part.mime_type ?? undefined) }
        : null;
  if (!locator)
    throw new TypeError("Cannot persist optimistic media without a locator");
  const common = {
    metadata: part.metadata,
    origin: part.origin,
    ...locator,
    mime_type: part.mime_type,
    size_bytes: part.size_bytes,
  };
  switch (part.kind) {
    case "image":
      return {
        ...common,
        type: "media",
        kind: "image",
        width: part.width,
        height: part.height,
      };
    case "audio":
      return {
        ...common,
        type: "media",
        kind: "audio",
        duration_ms: part.duration_ms,
        transcription_result: part.transcription_result,
      };
    case "video":
      return {
        ...common,
        type: "media",
        kind: "video",
        width: part.width,
        height: part.height,
        duration_ms: part.duration_ms,
      };
    case "document":
      return {
        ...common,
        type: "media",
        kind: "document",
        width: part.width,
        height: part.height,
        page_count: part.page_count,
      };
  }
}

function buildResourcePayload(resource: ManagedResource): UserInputPart | null {
  if (resource.finalPayload) return resource.finalPayload;

  const content = resource.userEdited
    ? resource.editedContent
    : resource.source;
  const metadata = resourceMetadata(resource, content);
  const controls = inputControls(resource);

  switch (resource.blockType) {
    case "text": {
      if (typeof content !== "string") {
        invalidResource(resource, "text content must be a string");
      }
      return { type: "text", text: content, metadata };
    }
    case "image":
    case "audio":
    case "video":
    case "document": {
      const record = isRecord(content) ? content : undefined;
      const url =
        typeof content === "string"
          ? content
          : record
            ? optionalString(record, "url")
            : undefined;
      const fileId = record ? optionalString(record, "file_id") : undefined;
      const base64Data = record
        ? optionalString(record, "base64_data")
        : undefined;
      const mimeType = record ? optionalString(record, "mime_type") : undefined;

      // Backward compatibility for drafts created by the old Voice Pad path:
      // a transcript is text, never an empty audio reference.
      if (
        resource.blockType === "audio" &&
        !url &&
        !fileId &&
        !base64Data &&
        record
      ) {
        const transcript =
          optionalString(record, "transcript") ??
          optionalString(record, "transcription_result");
        if (transcript) return { type: "text", text: transcript, metadata };
      }

      if (!url && !fileId && !base64Data) {
        invalidResource(
          resource,
          "media requires a URL, file id, or inline bytes",
        );
      }
      const locator = requestMediaLocator(url, fileId, base64Data);
      switch (resource.blockType) {
        case "image":
          return {
            type: "media",
            kind: "image",
            metadata,
            ...locator,
            mime_type: mimeType,
          };
        case "audio":
          return {
            type: "media",
            kind: "audio",
            metadata,
            ...locator,
            mime_type: mimeType,
          };
        case "video":
          return {
            type: "media",
            kind: "video",
            metadata,
            ...locator,
            mime_type: mimeType,
          };
        case "document":
          return {
            type: "media",
            kind: "document",
            metadata,
            ...locator,
            mime_type: mimeType,
          };
      }
    }
    case "youtube_video": {
      const url =
        typeof content === "string"
          ? content
          : isRecord(content)
            ? optionalString(content, "url")
            : undefined;
      if (!url) invalidResource(resource, "YouTube attachment requires a URL");
      return {
        type: "media",
        kind: "youtube",
        url,
        origin: "external",
        metadata,
      };
    }
    case "input_webpage": {
      const entries = Array.isArray(content) ? content : [content];
      const validEntries = entries.filter(
        (entry): entry is string | PreFetchedUrl =>
          typeof entry === "string" || isPreFetchedUrl(entry),
      );
      if (validEntries.length !== entries.length || validEntries.length === 0) {
        invalidResource(
          resource,
          "webpage entries must be URLs or saved snapshots",
        );
      }
      return {
        type: "input_webpage",
        urls: validEntries,
        metadata,
        ...controls,
      };
    }
    case "input_notes": {
      const noteIds = toResourceIdList(content);
      if (noteIds.length === 0) invalidResource(resource, "note id is missing");
      return { type: "input_notes", note_ids: noteIds, metadata, ...controls };
    }
    case "input_task": {
      const taskIds = toResourceIdList(content);
      if (taskIds.length === 0) invalidResource(resource, "task id is missing");
      return { type: "input_task", task_ids: taskIds, metadata, ...controls };
    }
    case "input_table": {
      const bookmarks = toTableBookmarks(content);
      if (bookmarks.length === 0)
        invalidResource(resource, "table bookmark is malformed");
      return { type: "input_table", bookmarks, metadata, ...controls };
    }
    case "input_list": {
      const bookmarks = toListBookmarks(content);
      if (bookmarks.length === 0)
        invalidResource(resource, "list bookmark is malformed");
      return { type: "input_list", bookmarks, metadata, ...controls };
    }
    case "input_data": {
      const refs = toDataRefs(content);
      if (refs.length === 0)
        invalidResource(resource, "data reference is malformed");
      return { type: "input_data", refs, metadata, ...controls };
    }
    case "input_agent": {
      const agentIds = toResourceIdList(content);
      if (agentIds.length === 0)
        invalidResource(resource, "agent id is missing");
      return {
        type: "input_agent",
        agent_ids: agentIds,
        metadata,
        ...controls,
      };
    }
    case "input_project": {
      const projectIds = toResourceIdList(content);
      if (projectIds.length === 0)
        invalidResource(resource, "project id is missing");
      return {
        type: "input_project",
        project_ids: projectIds,
        metadata,
        ...controls,
      };
    }
    case "input_agent_app": {
      const appIds = toResourceIdList(content);
      if (appIds.length === 0)
        invalidResource(resource, "agent app id is missing");
      return {
        type: "input_agent_app",
        agent_app_ids: appIds,
        metadata,
        ...controls,
      };
    }
    case "input_transcript": {
      const transcriptIds = toResourceIdList(content);
      if (transcriptIds.length === 0)
        invalidResource(resource, "transcript id is missing");
      return {
        type: "input_transcript",
        transcript_ids: transcriptIds,
        metadata,
        ...controls,
      };
    }
    case "input_transcript_session": {
      const sessionIds = toResourceIdList(content);
      if (sessionIds.length === 0)
        invalidResource(resource, "transcript session id is missing");
      return {
        type: "input_transcript_session",
        transcript_session_ids: sessionIds,
        metadata,
        ...controls,
      };
    }
    case "input_workbook": {
      const workbookIds = toResourceIdList(content);
      if (workbookIds.length === 0)
        invalidResource(resource, "workbook id is missing");
      return {
        type: "input_workbook",
        workbook_ids: workbookIds,
        metadata,
        ...controls,
      };
    }
    case "input_document": {
      const documentIds = toResourceIdList(content);
      if (documentIds.length === 0)
        invalidResource(resource, "document id is missing");
      return {
        type: "input_document",
        document_ids: documentIds,
        metadata,
        ...controls,
      };
    }
    case "processed_document":
    case "editor_error":
    case "editor_code_snippet":
      return null;
  }
}

/**
 * All resources for an instance, sorted by sortOrder.
 */
export const selectInstanceResources = (conversationId: string) =>
  createSelector(
    (state: RootState) =>
      state.instanceResources.byConversationId[conversationId],
    (resources) => {
      if (!resources) return EMPTY_RESOURCES;
      const arr = Object.values(resources).sort(
        (a, b) => a.sortOrder - b.sortOrder,
      );
      return arr.length === 0 ? EMPTY_RESOURCES : arr;
    },
  );

/**
 * True when the composer holds an attachment that is NOT part of the last
 * submitted message — i.e. a live next-message draft attachment (pasted image,
 * file) the user added while the previous response was still streaming. Such
 * resources are SACRED and must never be cleared by a stream/conversation event.
 * Mirrors `isInputDraftProtected` (text) for the resources slice. Used to gate
 * stream-end variable resets so a next-message draft is preserved whole.
 */
export const selectHasUnsentResources =
  (conversationId: string) =>
  (state: RootState): boolean => {
    const resources = state.instanceResources.byConversationId[conversationId];
    if (!resources) return false;
    const ids = Object.keys(resources);
    if (ids.length === 0) return false;
    const submitted =
      state.instanceResources.submittedIds[conversationId] ?? [];
    return ids.some((id) => !submitted.includes(id));
  };

/**
 * A single resource by ID.
 */
export const selectResource =
  (conversationId: string, resourceId: string) =>
  (state: RootState): ManagedResource | undefined =>
    state.instanceResources.byConversationId[conversationId]?.[resourceId];

/**
 * Resources that are ready for the API call.
 */
export const selectReadyResources = (conversationId: string) =>
  createSelector(
    (state: RootState) =>
      state.instanceResources.byConversationId[conversationId],
    (resources) => {
      if (!resources) return EMPTY_RESOURCES;
      const arr = Object.values(resources)
        .filter((r) => r.status === "ready")
        .sort((a, b) => a.sortOrder - b.sortOrder);
      return arr.length === 0 ? EMPTY_RESOURCES : arr;
    },
  );

/**
 * Resources that are still resolving (pending or in-progress).
 */
export const selectPendingResources = (conversationId: string) =>
  createSelector(
    (state: RootState) =>
      state.instanceResources.byConversationId[conversationId],
    (resources) => {
      if (!resources) return EMPTY_RESOURCES;
      const arr = Object.values(resources).filter(
        (r) => r.status === "pending" || r.status === "resolving",
      );
      return arr.length === 0 ? EMPTY_RESOURCES : arr;
    },
  );

/**
 * Whether all resources are resolved (ready or error — nothing pending).
 * Uses a for..in loop over the Record keys to avoid Object.values() allocation
 * on every call — this runs on every dispatch while resources are resolving.
 */
export const selectAllResourcesResolved =
  (conversationId: string) =>
  (state: RootState): boolean => {
    const resources = state.instanceResources.byConversationId[conversationId];
    if (!resources) return true;
    for (const key in resources) {
      const status = resources[key]?.status;
      if (status !== "ready" && status !== "error") return false;
    }
    return true;
  };

/**
 * Build the ContentBlock[] array for the API payload.
 * Uses finalPayload if set, otherwise constructs from source/options.
 */
export const selectResourcePayloads = (conversationId: string) =>
  createSelector(
    (state: RootState) =>
      state.instanceResources.byConversationId[conversationId],
    (resources) => {
      if (!resources) return EMPTY_PAYLOADS;

      const arr = Object.values(resources)
        .filter((r) => r.status === "ready")
        // Editor pills (editor_error / editor_code_snippet) round-trip via
        // XML in the user message text — not via structured ContentBlocks —
        // so they're excluded from the API payload here. The XML weave
        // happens in `assembleRequest` via `selectEditorResourceXml`.
        .filter(
          (r) =>
            !isEditorXmlResource(r) && r.blockType !== "processed_document",
        )
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(buildResourcePayload)
        .filter((part): part is UserInputPart => part !== null);

      return arr.length === 0 ? EMPTY_PAYLOADS : arr;
    },
  );

/**
 * Editor pills (errors, code snippets) — these resources serialize to XML
 * embedded in the user message text rather than to structured ContentBlocks.
 * Returned in sortOrder so the wire format matches what the user composed.
 */
export const selectEditorResources = (conversationId: string) =>
  createSelector(
    (state: RootState) =>
      state.instanceResources.byConversationId[conversationId],
    (resources) => {
      if (!resources) return EMPTY_EDITOR_RESOURCES;
      const arr = Object.values(resources)
        .filter((r) => isEditorXmlResource(r))
        .sort((a, b) => a.sortOrder - b.sortOrder);
      return arr.length === 0 ? EMPTY_EDITOR_RESOURCES : arr;
    },
  );

/**
 * Concatenated XML text for all editor-type resources. Empty string when
 * there are none — `assembleRequest` can append unconditionally.
 */
export const selectEditorResourceXml = (conversationId: string) =>
  createSelector(selectEditorResources(conversationId), (resources) =>
    serializeEditorResourcesAsXml(resources),
  );
