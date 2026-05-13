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
import type { MessagePart } from "@/types/python-generated/stream-events";
import type { MediaRef } from "@/features/files";
import {
  isEditorXmlResource,
  serializeEditorResourcesAsXml,
} from "@/features/agents/utils/editor-resource-xml";

const EMPTY_RESOURCES: ManagedResource[] = [];
const EMPTY_EDITOR_RESOURCES: ManagedResource[] = [];
const EMPTY_PAYLOADS: MessagePart[] = [];

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
        .filter((r) => !isEditorXmlResource(r))
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((r): MessagePart => {
          if (r.finalPayload) return r.finalPayload;

          const payload: Record<string, unknown> = { type: r.blockType };
          const content = r.userEdited ? r.editedContent : r.source;

          if (r.options.keepFresh) payload.keep_fresh = true;
          if (r.options.editable) payload.editable = true;
          if (!r.options.convertToText) payload.convert_to_text = false;
          if (r.options.optionalContext) payload.optional_context = true;
          if (r.options.template) payload.template = r.options.template;

          switch (r.blockType) {
            case "text":
              payload.text = content;
              break;
            case "image":
            case "audio":
            case "video":
            case "document": {
              // Media blocks carry a `MediaRef`-shaped source for files we
              // own (so the backend can resolve `file_id` directly without
              // a share-link redirect). Legacy callsites still pass a raw
              // URL string or a partial object — both are handled here.
              //
              // Resolution order matches the backend's `MediaRef` contract:
              //   1. file_id  — preferred, skip the redirect
              //   2. file_uri — native cloud URI
              //   3. url      — public or signed URL
              //   4. base64_data — only if a callsite hand-rolls one
              //
              // We extract the recognized fields explicitly instead of
              // spreading the whole source — this drops the legacy
              // `details` / `metadata` / `localId` payload bloat
              // (~3 KB per content block on the wire) that the backend
              // ignores anyway.
              if (typeof content === "string") {
                // Legacy path: bare URL string. The MediaRef.url field
                // accepts any URL, so this still works — but new callsites
                // should pass a MediaRef object instead.
                payload.url = content;
              } else if (content && typeof content === "object") {
                const ref = content as Partial<MediaRef> & {
                  base64_data?: string;
                };
                if (ref.file_id) payload.file_id = ref.file_id;
                if (ref.file_uri) payload.file_uri = ref.file_uri;
                if (ref.url) payload.url = ref.url;
                if (ref.base64_data) payload.base64_data = ref.base64_data;
                if (ref.mime_type) payload.mime_type = ref.mime_type;
                if (ref.metadata) payload.metadata = ref.metadata;
              }
              break;
            }
            case "youtube_video":
              payload.url = content;
              break;
            case "input_webpage":
              payload.urls = Array.isArray(content) ? content : [content];
              break;
            case "input_notes":
              payload.note_ids = Array.isArray(content) ? content : [content];
              break;
            case "input_task":
              payload.task_ids = Array.isArray(content) ? content : [content];
              break;
            case "input_table":
              payload.bookmarks = content;
              break;
            case "input_list":
              payload.bookmarks = content;
              break;
            case "input_data":
              payload.refs = content;
              break;
          }

          return payload as unknown as MessagePart;
        });

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
  createSelector(
    selectEditorResources(conversationId),
    (resources) => serializeEditorResourcesAsXml(resources),
  );
